import {
  appointmentButtons,
  EvolutionRequestError,
  normalizeWhatsAppNumber,
  retryDelay,
  sendWhatsApp,
  whatsappProvider,
} from "./whatsapp.ts";

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

Deno.test("429 reintenta con espera y respeta el máximo de intentos", () => {
  const error = new EvolutionRequestError("Ocupado", 429);
  equal(retryDelay(error, 1, 4), 60_000);
  equal(retryDelay(error, 2, 4), 300_000);
  equal(retryDelay(error, 3, 4), 900_000);
  equal(retryDelay(error, 4, 4), null);
});

Deno.test("fallos ambiguos o permanentes requieren revisión, sin reenvío automático", () => {
  for (
    const error of [
      new Error("Timeout"),
      new EvolutionRequestError("Error", 500),
      new EvolutionRequestError("No autorizado", 401),
      new EvolutionRequestError("Inválido", 400),
    ]
  ) {
    equal(retryDelay(error, 1, 4), null);
  }
});

Deno.test("normaliza celulares peruanos e internacionales", () => {
  equal(normalizeWhatsAppNumber("999 111 222"), "51999111222");
  equal(normalizeWhatsAppNumber("+51 999 111 222"), "51999111222");
  equal(normalizeWhatsAppNumber("0051999111222"), "51999111222");
});

Deno.test("avisos de cita ofrecen respuestas cortas con identificadores inequívocos", () => {
  const buttons = appointmentButtons("CITA_CONFIRMACION");
  equal(buttons.length, 3);
  equal(buttons[0].id, "CONFIRMO");
  equal(buttons[1].id, "CANCELAR");
  equal(appointmentButtons("CITA_CANCELACION")[0].id, "RESERVAR");
});

Deno.test("el proveedor debe devolver un identificador antes de registrar ENVIADO", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [
    "EVOLUTION_API_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_INSTANCE_NAME",
    "CF_ACCESS_CLIENT_ID",
    "CF_ACCESS_CLIENT_SECRET",
    "WHATSAPP_PROVIDER",
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  try {
    Deno.env.set(keys[0], "https://example.invalid");
    Deno.env.set(keys[1], "test-only");
    Deno.env.set(keys[2], "test");
    Deno.env.delete(keys[3]);
    Deno.env.delete(keys[4]);
    Deno.env.set(keys[5], "evolution");
    globalThis.fetch = () =>
      Promise.resolve(new Response("{}", { status: 200 }));
    let rejected = false;
    try {
      await sendWhatsApp("999111222", "Prueba");
    } catch {
      rejected = true;
    }
    equal(rejected, true);
    globalThis.fetch = () =>
      Promise.resolve(Response.json({ key: { id: "test-message" } }));
    equal(await sendWhatsApp("999111222", "Prueba"), "test-message");
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!)
    );
  }
});

Deno.test("botones desactivados usan texto y un rechazo explícito permite volver al texto", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [
    "EVOLUTION_API_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_INSTANCE_NAME",
    "EVOLUTION_INTERACTIVE_BUTTONS",
    "WHATSAPP_PROVIDER",
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  const paths: string[] = [];
  try {
    Deno.env.set(keys[0], "https://example.invalid");
    Deno.env.set(keys[1], "test-only");
    Deno.env.set(keys[2], "test");
    Deno.env.delete(keys[3]);
    Deno.env.set(keys[4], "evolution");
    globalThis.fetch = (input) => {
      paths.push(String(input));
      return Promise.resolve(Response.json({ key: { id: "text-id" } }));
    };
    equal(
      await sendWhatsApp("999111222", "Opciones", [{
        id: "RESERVAR",
        text: "Reservar",
      }]),
      "text-id",
    );
    equal(paths[0].includes("/sendText/"), true);

    Deno.env.set(keys[3], "true");
    globalThis.fetch = (input, init) => {
      paths.push(String(input));
      const body = JSON.parse(String(init?.body));
      equal(body.buttons[0].id, "RESERVAR");
      equal(body.title, "Opciones");
      return Promise.resolve(Response.json({ key: { id: "button-id" } }));
    };
    equal(
      await sendWhatsApp("999111222", "Opciones", [{
        id: "RESERVAR",
        text: "Reservar",
      }]),
      "button-id",
    );
    equal(paths.at(-1)?.includes("/sendButtons/"), true);

    globalThis.fetch = (_input, init) => {
      const body = JSON.parse(String(init?.body));
      equal(body.buttons[0].id, "appointment_confirm:84");
      equal(body.buttons[0].displayText, "Aceptar cita");
      equal(body.buttons[1].displayText, "Cancelar");
      equal(body.buttons[2].displayText, "Reprogramar");
      return Promise.resolve(
        Response.json({ key: { id: "appointment-buttons-id" } }),
      );
    };
    equal(
      await sendWhatsApp("999111222", "Confirma tu cita", [
        { id: "appointment_confirm:84", text: "Sí, confirmar" },
        { id: "appointment_cancel:84", text: "No puedo asistir" },
        { id: "appointment_reschedule:84", text: "Otra fecha" },
      ]),
      "appointment-buttons-id",
    );

    globalThis.fetch = (input) => {
      paths.push(String(input));
      return String(input).includes("/sendButtons/")
        ? Promise.resolve(
          Response.json({ message: "Formato no admitido" }, { status: 400 }),
        )
        : Promise.resolve(Response.json({ key: { id: "fallback-id" } }));
    };
    equal(
      await sendWhatsApp("999111222", "Opciones", [{
        id: "RESERVAR",
        text: "Reservar",
      }]),
      "fallback-id",
    );
    equal(paths.at(-2)?.includes("/sendButtons/"), true);
    equal(paths.at(-1)?.includes("/sendText/"), true);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!)
    );
  }
});

Deno.test("Meta envía la plantilla de cita con botones ligados a la cita", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [
    "WHATSAPP_PROVIDER",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_GRAPH_VERSION",
    "WHATSAPP_TEMPLATE_LANGUAGE",
    "WHATSAPP_APPOINTMENT_TEMPLATE",
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  let requestedUrl = "";
  let authorization = "";
  let requestedBody: Record<string, any> = {};
  try {
    Deno.env.set(keys[0], "meta");
    Deno.env.set(keys[1], "test-access-token");
    Deno.env.set(keys[2], "123456789");
    Deno.env.set(keys[3], "v23.0");
    Deno.env.set(keys[4], "es");
    Deno.env.set(keys[5], "dental_cita_confirmacion");
    equal(whatsappProvider(), "meta");
    globalThis.fetch = (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      requestedBody = JSON.parse(String(init?.body));
      return Promise.resolve(
        Response.json({ messages: [{ id: "wamid.test" }] }),
      );
    };
    const providerId = await sendWhatsApp("999 111 222", "Confirmación", {
      type: "CITA_CONFIRMACION",
      appointmentId: 84,
      templateParameters: ["Ana", "15/10/2026", "09:30", "Limpieza dental"],
      buttons: [
        { id: "appointment_confirm:84", text: "Sí, confirmar" },
        { id: "appointment_cancel:84", text: "No puedo asistir" },
        { id: "appointment_reschedule:84", text: "Reprogramar" },
      ],
    });
    equal(providerId, "wamid.test");
    equal(requestedUrl, "https://graph.facebook.com/v23.0/123456789/messages");
    equal(authorization, "Bearer test-access-token");
    equal(requestedBody.to, "51999111222");
    equal(requestedBody.type, "template");
    equal(requestedBody.template.name, "dental_cita_confirmacion");
    equal(requestedBody.template.components[0].parameters.length, 4);
    equal(
      requestedBody.template.components[1].parameters[0].payload,
      "appointment_confirm:84",
    );
    equal(
      requestedBody.template.components[3].parameters[0].payload,
      "appointment_reschedule:84",
    );
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) =>
      previous[index] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[index]!)
    );
  }
});
