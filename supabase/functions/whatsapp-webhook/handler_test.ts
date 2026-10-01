import { handleWebhook, textFromMessage, unwrapMessage } from "./handler.ts";
import { serviceClient } from "../_shared/client.ts";

const secret = "test-webhook-secret-never-for-production";
const clientFactory = (client: unknown) => () =>
  client as ReturnType<typeof serviceClient>;
const withSettings = (
  rpc: (name: string, args: unknown) => Promise<unknown>,
  values: Record<string, string> = {
    "whatsapp.automatizacion.activa": "true",
    "whatsapp.automatizacion.citas": "true",
    "whatsapp.automatizacion.reservas": "true",
  },
) =>
  clientFactory({
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: Object.entries(values).map(([clave, valor]) => ({
              clave,
              valor,
            })),
            error: null,
          }),
      }),
    }),
    rpc,
  });
function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
}
function request(event: string, data: unknown) {
  return new Request("https://example.invalid/webhook", {
    method: "POST",
    headers: { "x-webhook-secret": secret, "content-type": "application/json" },
    body: JSON.stringify({ event, data }),
  });
}
async function withSecret(run: () => Promise<void>) {
  const previous = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  Deno.env.set("EVOLUTION_WEBHOOK_SECRET", secret);
  try {
    await run();
  } finally {
    if (previous === undefined) Deno.env.delete("EVOLUTION_WEBHOOK_SECRET");
    else Deno.env.set("EVOLUTION_WEBHOOK_SECRET", previous);
  }
}

async function metaRequest(payload: unknown, appSecret: string) {
  const raw = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  const signature = Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  return new Request("https://example.invalid/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${signature}`,
    },
    body: raw,
  });
}

Deno.test(
  "un fallo al guardar el mensaje devuelve 500 para permitir redelivery",
  () =>
    withSecret(async () => {
      const response = await handleWebhook(
        request("messages.upsert", {
          key: { remoteJid: "51999111222@s.whatsapp.net", id: "test-incoming" },
          message: { conversation: "CONFIRMO" },
        }),
        withSettings(() =>
          Promise.resolve({ error: { message: "Database unavailable" } })
        ),
      );
      check(
        response.status === 500,
        "No debe confirmar un mensaje que no se guardó",
      );
    }),
);

Deno.test("mensaje persistido devuelve 200 y conserva el contexto citado", () =>
  withSecret(async () => {
    let received: unknown;
    let called = "";
    const response = await handleWebhook(
      request("messages.upsert", {
        key: { remoteJid: "51999111222@s.whatsapp.net", id: "test-incoming" },
        message: {
          extendedTextMessage: {
            text: "CONFIRMO",
            contextInfo: { stanzaId: "test-outgoing" },
          },
        },
      }),
      withSettings((name: string, args: unknown) => {
        called = name;
        received = args;
        return Promise.resolve({ error: null });
      }),
    );
    check(response.status === 200, "Debe aceptar el mensaje guardado");
    check(
      called === "procesar_evento_whatsapp_citas",
      "Debe usar el flujo de reservas del webhook",
    );
    check(
      JSON.stringify(received).includes("test-outgoing"),
      "Debe conservar la cita respondida",
    );
  }));

Deno.test("usa el número real cuando Evolution entrega un chat con LID", () =>
  withSecret(async () => {
    let received: any;
    const response = await handleWebhook(
      request("messages.upsert", {
        key: {
          remoteJid: "249028612726953@lid",
          remoteJidAlt: "51901214858@s.whatsapp.net",
          fromMe: false,
          id: "lid-incoming",
        },
        message: { conversation: "Hola" },
        messageTimestamp: 1790874741,
      }),
      withSettings((_name, args) => {
        received = args;
        return Promise.resolve({ error: null });
      }),
    );
    check(response.status === 200, "Debe aceptar el mensaje con LID");
    check(
      received.datos.phone === "51901214858",
      "Debe asociar el mensaje al número real y no al LID",
    );
  }));

Deno.test("importa mensajes enviados desde el teléfono vinculado", () =>
  withSecret(async () => {
    let called = "";
    let received: any;
    const response = await handleWebhook(
      request("messages.upsert", {
        key: {
          remoteJid: "249028612726953@lid",
          remoteJidAlt: "51901214858@s.whatsapp.net",
          fromMe: true,
          id: "phone-outgoing",
        },
        status: "SERVER_ACK",
        message: { conversation: "Mensaje desde el teléfono" },
        messageTimestamp: 1790874800,
      }),
      clientFactory({
        rpc: (name: string, args: unknown) => {
          called = name;
          received = args;
          return Promise.resolve({ error: null });
        },
      }),
    );
    check(response.status === 200, "Debe aceptar el mensaje saliente");
    check(
      called === "importar_mensaje_whatsapp",
      "Debe importar el mensaje saliente sin activar automatizaciones",
    );
    check(
      received.datos.providerChatId === "51901214858@s.whatsapp.net" &&
        received.datos.direction === "SALIENTE",
      "Debe usar el chat telefónico canónico",
    );
  }));

Deno.test("representa archivos sin texto dentro del historial", () => {
  check(
    textFromMessage({ imageMessage: {} }) === "[Imagen]" &&
      textFromMessage({ audioMessage: {} }) === "[Audio]" &&
      textFromMessage({ locationMessage: {} }) === "[Ubicación]",
    "Los mensajes multimedia deben permanecer visibles",
  );
});

Deno.test("al pausar todo, registra la respuesta sin ejecutar la cita", () =>
  withSecret(async () => {
    let called = "";
    const response = await handleWebhook(
      request("messages.upsert", {
        key: { remoteJid: "51999111222@s.whatsapp.net", id: "paused-incoming" },
        message: { conversation: "CANCELAR" },
      }),
      withSettings(
        (name) => {
          called = name;
          return Promise.resolve({ error: null });
        },
        {
          "whatsapp.automatizacion.activa": "false",
          "whatsapp.automatizacion.citas": "true",
          "whatsapp.automatizacion.reservas": "true",
        },
      ),
    );
    check(
      response.status === 200 && called === "registrar_evento_whatsapp_pasivo",
      "Debe guardar la respuesta para revisión sin cancelar la cita",
    );
  }));

Deno.test("al pausar reservas, no genera ofertas de horario", () =>
  withSecret(async () => {
    let called = "";
    const response = await handleWebhook(
      request("messages.upsert", {
        key: { remoteJid: "51999111222@s.whatsapp.net", id: "booking-paused" },
        message: { conversation: "RESERVAR" },
      }),
      withSettings(
        (name) => {
          called = name;
          return Promise.resolve({ error: null });
        },
        {
          "whatsapp.automatizacion.activa": "true",
          "whatsapp.automatizacion.citas": "true",
          "whatsapp.automatizacion.reservas": "false",
        },
      ),
    );
    check(
      response.status === 200 && called === "registrar_evento_whatsapp",
      "Debe pasar la solicitud a revisión sin responder automáticamente",
    );
  }));

Deno.test(
  "al pausar avisos de cita, la cancelación recibida queda para revisión",
  () =>
    withSecret(async () => {
      let called = "";
      const response = await handleWebhook(
        request("messages.upsert", {
          key: {
            remoteJid: "51999111222@s.whatsapp.net",
            id: "appointments-paused",
          },
          message: { conversation: "CANCELAR" },
        }),
        withSettings(
          (name) => {
            called = name;
            return Promise.resolve({ error: null });
          },
          {
            "whatsapp.automatizacion.activa": "true",
            "whatsapp.automatizacion.citas": "false",
            "whatsapp.automatizacion.reservas": "true",
          },
        ),
      );
      check(
        response.status === 200 &&
          called === "registrar_evento_whatsapp_pasivo",
        "Debe conservar la cancelación sin cambiar la cita automáticamente",
      );
    }),
);

Deno.test(
  "estados numéricos distinguen enviado, entregado y leído sin retroceder",
  () =>
    withSecret(async () => {
      for (
        const [current, incoming, expected] of [
          ["ENVIADO", 3, "ENTREGADO"],
          ["ENTREGADO", 4, "LEIDO"],
          ["LEIDO", 2, null],
          ["LEIDO", 0, null],
        ] as const
      ) {
        let saved: string | null = null;
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () =>
            Promise.resolve({ data: { id: 1, estado: current }, error: null }),
          update: (value: { estado: string }) => {
            saved = value.estado;
            return query;
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve),
        };
        const response = await handleWebhook(
          request("messages.update", { key: { id: "test" }, status: incoming }),
          clientFactory({ from: () => query }),
        );
        check(
          response.status === 200 && saved === expected,
          `Estado ${current} + ${incoming}`,
        );
      }
    }),
);

Deno.test("sin secreto válido no consulta la base de datos", async () => {
  let queried = false;
  const response = await handleWebhook(
    new Request("https://example.invalid", { method: "POST" }),
    () => {
      queried = true;
      throw new Error("No debe ejecutarse");
    },
  );
  check(response.status === 401 && !queried, "Rechazar webhook no autorizado");
});

Deno.test(
  "los botones conservan el identificador elegido y no el texto visible",
  () => {
    check(
      textFromMessage({
        buttonsResponseMessage: {
          selectedButtonId: "CITA_AB12CD34_2",
          selectedDisplayText: "2 · 30/09 10:00",
        },
      }) === "CITA_AB12CD34_2",
      "El botón usa su ID estable",
    );
    check(
      textFromMessage({
        interactiveResponseMessage: {
          nativeFlowResponseMessage: { paramsJson: '{"id":"RESERVAR"}' },
        },
      }) === "RESERVAR",
      "El flujo interactivo usa su ID estable",
    );
    check(
      textFromMessage(
        unwrapMessage({
          viewOnceMessage: {
            message: {
              interactiveResponseMessage: {
                nativeFlowResponseMessage: {
                  paramsJson: '{"id":"CITA_AB12CD34_1"}',
                },
              },
            },
          },
        }),
      ) === "CITA_AB12CD34_1",
      "Lee respuestas envueltas de Baileys",
    );
  },
);

Deno.test("Meta verifica el callback sin consultar la base de datos", async () => {
  const verifyToken = "meta-test-verify-token-123456789";
  const previous = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  Deno.env.set("WHATSAPP_VERIFY_TOKEN", verifyToken);
  let queried = false;
  try {
    const response = await handleWebhook(
      new Request(
        `https://example.invalid/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=challenge-ok`,
      ),
      () => {
        queried = true;
        throw new Error("No debe consultar la base de datos");
      },
    );
    check(response.status === 200, "Debe aceptar el token de verificación");
    check(
      await response.text() === "challenge-ok",
      "Debe devolver el reto sin modificar",
    );
    check(!queried, "La verificación no necesita base de datos");
  } finally {
    if (previous === undefined) Deno.env.delete("WHATSAPP_VERIFY_TOKEN");
    else Deno.env.set("WHATSAPP_VERIFY_TOKEN", previous);
  }
});

Deno.test("Meta rechaza una firma inválida antes de consultar la base", async () => {
  const previous = Deno.env.get("WHATSAPP_APP_SECRET");
  Deno.env.set("WHATSAPP_APP_SECRET", "correct-meta-app-secret");
  let queried = false;
  try {
    const response = await handleWebhook(
      new Request("https://example.invalid/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
        },
        body: JSON.stringify({
          object: "whatsapp_business_account",
          entry: [],
        }),
      }),
      () => {
        queried = true;
        throw new Error("No debe consultar la base de datos");
      },
    );
    check(
      response.status === 401 && !queried,
      "Debe rechazar la firma inválida",
    );
  } finally {
    if (previous === undefined) Deno.env.delete("WHATSAPP_APP_SECRET");
    else Deno.env.set("WHATSAPP_APP_SECRET", previous);
  }
});

Deno.test("el botón de Meta actualiza solamente la cita identificada", async () => {
  const appSecret = "meta-test-app-secret";
  const previous = Deno.env.get("WHATSAPP_APP_SECRET");
  Deno.env.set("WHATSAPP_APP_SECRET", appSecret);
  let called = "";
  let received: any;
  try {
    const response = await handleWebhook(
      await metaRequest({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: "51999111222",
                id: "wamid.incoming",
                context: { id: "wamid.outgoing" },
                interactive: {
                  type: "button_reply",
                  button_reply: {
                    id: "appointment_confirm:84",
                    title: "Sí, confirmar",
                  },
                },
              }],
            },
          }],
        }],
      }, appSecret),
      withSettings((name, args) => {
        called = name;
        received = args;
        return Promise.resolve({ error: null });
      }),
    );
    check(response.status === 200, "Debe aceptar el evento firmado");
    check(
      called === "procesar_respuesta_whatsapp_cita",
      "Debe usar la RPC segura de cita",
    );
    check(
      received.datos.content === "appointment_confirm:84",
      "Debe conservar el identificador exacto",
    );
    check(
      received.datos.contextProviderId === "wamid.outgoing",
      "Debe conservar el contexto del mensaje",
    );
  } finally {
    if (previous === undefined) Deno.env.delete("WHATSAPP_APP_SECRET");
    else Deno.env.set("WHATSAPP_APP_SECRET", previous);
  }
});
