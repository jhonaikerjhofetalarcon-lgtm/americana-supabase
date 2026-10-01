import { matchesSecret } from "../_shared/auth.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import { serviceClient } from "../_shared/client.ts";

const statusMap: Record<string, string> = {
  PENDING: "PENDIENTE",
  SERVER_ACK: "ENVIADO",
  SENT: "ENVIADO",
  DELIVERY_ACK: "ENTREGADO",
  DELIVERED: "ENTREGADO",
  READ: "LEIDO",
  READ_ACK: "LEIDO",
  PLAYED: "LEIDO",
  FAILED: "FALLIDO",
  ERROR: "FALLIDO",
  "0": "FALLIDO",
  "1": "PENDIENTE",
  "2": "ENVIADO",
  "3": "ENTREGADO",
  "4": "LEIDO",
  "5": "LEIDO",
};
const rank: Record<string, number> = {
  PENDIENTE: 0,
  ENVIADO: 1,
  ENTREGADO: 2,
  LEIDO: 3,
};
const appointmentButton =
  /^appointment_(confirm|cancel|reschedule):([1-9][0-9]*)$/i;
const directJid = (value: unknown) => {
  const jid = String(value ?? "").trim();
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid") ? jid : "";
};
const preferredDirectJid = (...values: unknown[]) => {
  const candidates = values.map(directJid).filter(Boolean);
  return candidates.find((jid) => jid.endsWith("@s.whatsapp.net")) ??
    candidates[0] ?? "";
};
const phoneFromJid = (jid: unknown) =>
  String(jid ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
const messageTimestamp = (value: unknown) => {
  const raw = typeof value === "object" && value
    ? (value as { low?: unknown }).low
    : value;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
};

export function unwrapMessage(value: Record<string, any>): Record<string, any> {
  let message = value;
  for (let depth = 0; depth < 4; depth++) {
    const next = message.ephemeralMessage?.message ??
      message.viewOnceMessage?.message ??
      message.viewOnceMessageV2?.message ??
      message.documentWithCaptionMessage?.message;
    if (!next || typeof next !== "object") break;
    message = next;
  }
  return message;
}

export const textFromMessage = (message: Record<string, any> = {}) => {
  const native = message.interactiveResponseMessage?.nativeFlowResponseMessage
    ?.paramsJson;
  if (typeof native === "string") {
    try {
      const parsed = JSON.parse(native);
      if (typeof parsed?.id === "string") return parsed.id;
    } catch {
      /* Unknown interactive payload: use the regular text below. */
    }
  }
  const content = message.buttonsResponseMessage?.selectedButtonId ??
    message.templateButtonReplyMessage?.selectedId ??
    message.listResponseMessage?.singleSelectReply?.selectedRowId ??
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    message.buttonsMessage?.contentText ??
    message.templateMessage?.hydratedTemplate?.hydratedContentText ??
    message.interactiveMessage?.body?.text ??
    "";
  if (String(content).trim()) return String(content);
  if (message.imageMessage) return "[Imagen]";
  if (message.videoMessage) return "[Video]";
  if (message.audioMessage) return "[Audio]";
  if (message.documentMessage) return "[Documento]";
  if (message.stickerMessage) return "[Sticker]";
  if (message.contactMessage || message.contactsArrayMessage) {
    return "[Contacto]";
  }
  if (message.locationMessage || message.liveLocationMessage) {
    return "[Ubicación]";
  }
  return "";
};

const safeEqual = (left: string, right: string) => {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
};

export async function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  secret?: string,
) {
  const appSecret = secret?.trim() ||
    Deno.env.get("WHATSAPP_APP_SECRET")?.trim() || "";
  const provided = signature?.trim().replace(/^sha256=/i, "") ?? "";
  if (!appSecret || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  const expected = Array.from(
    digest,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return safeEqual(expected, provided.toLowerCase());
}

const evolutionAuthorized = (request: Request) => {
  const provided = new URL(request.url).searchParams.get("token") ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return matchesSecret(provided ?? null, "EVOLUTION_WEBHOOK_SECRET");
};

const automationSettings = async (client: ReturnType<typeof serviceClient>) => {
  const configuration = await client
    .from("configuracion_sistema")
    .select("clave,valor")
    .in("clave", [
      "whatsapp.automatizacion.activa",
      "whatsapp.automatizacion.citas",
      "whatsapp.automatizacion.reservas",
    ]);
  if (configuration.error) throw new Error(configuration.error.message);
  const settings = new Map(
    (configuration.data ?? []).map((entry) => [entry.clave, entry.valor]),
  );
  const generalEnabled =
    settings.get("whatsapp.automatizacion.activa") === "true";
  return {
    generalEnabled,
    bookingEnabled: generalEnabled &&
      settings.get("whatsapp.automatizacion.reservas") === "true",
    appointmentsEnabled: generalEnabled &&
      settings.get("whatsapp.automatizacion.citas") === "true",
  };
};

const routeIncoming = async (
  client: ReturnType<typeof serviceClient>,
  event: {
    phone: string;
    content: string;
    providerId: string;
    contextProviderId?: string | null;
  },
) => {
  if (!event.phone || !event.content || !event.providerId) return;
  const settings = await automationSettings(client);
  const command = event.content.trim().toUpperCase();
  const secureButton = appointmentButton.test(event.content.trim());
  const appointmentCommand = secureButton ||
    /^(CONFIRMO|CONFIRMAR|CONFIRMO MI CITA|CANCELAR|CANCELO|CANCELAR MI CITA|CANCELO MI CITA|REPROGRAMAR|REPROGRAMAR MI CITA|QUIERO OTRA FECHA|OTRA FECHA)[.! ]*$/
      .test(command);
  const rpc =
    secureButton && settings.generalEnabled && settings.appointmentsEnabled
      ? "procesar_respuesta_whatsapp_cita"
      : !settings.generalEnabled ||
          (!settings.appointmentsEnabled && appointmentCommand)
      ? "registrar_evento_whatsapp_pasivo"
      : settings.bookingEnabled
      ? "procesar_evento_whatsapp_citas"
      : "registrar_evento_whatsapp";
  const result = await client.rpc(rpc, {
    datos: {
      phone: event.phone,
      content: event.content,
      providerId: event.providerId,
      contextProviderId: event.contextProviderId ?? null,
    },
  });
  if (result.error) throw new Error(result.error.message);
};

const updateDeliveryStatus = async (
  client: ReturnType<typeof serviceClient>,
  providerId: unknown,
  rawStatus: unknown,
  providerError?: unknown,
) => {
  const normalized = statusMap[String(rawStatus ?? "").toUpperCase()];
  if (!providerId || !normalized) return;
  const current = await client
    .from("mensajes_whatsapp")
    .select("id,estado,tipo,cita_id,atencion_id")
    .eq("proveedor_id", providerId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) return;
  if (
    normalized !== "FALLIDO" &&
    (rank[normalized] ?? 0) < (rank[current.data.estado] ?? 0)
  ) return;
  if (
    normalized === "FALLIDO" &&
    ["ENTREGADO", "LEIDO"].includes(current.data.estado)
  ) return;
  const updated = await client
    .from("mensajes_whatsapp")
    .update({
      estado: normalized,
      error_detalle: normalized === "FALLIDO"
        ? String(providerError ?? "WhatsApp reportó un error").slice(0, 500)
        : null,
    })
    .eq("id", current.data.id)
    .eq("estado", current.data.estado);
  if (updated.error) throw new Error(updated.error.message);
};

const handleMetaPayload = async (
  payload: Record<string, any>,
  client: ReturnType<typeof serviceClient>,
) => {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const content = message.interactive?.button_reply?.id ??
          message.interactive?.list_reply?.id ??
          message.button?.payload ??
          message.text?.body ??
          "";
        await routeIncoming(client, {
          phone: phoneFromJid(message.from),
          content: String(content),
          providerId: String(message.id ?? ""),
          contextProviderId: message.context?.id
            ? String(message.context.id)
            : null,
        });
      }
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        const detail = Array.isArray(status.errors)
          ? status.errors.map((error: any) =>
            error?.title ?? error?.message ?? error?.code
          )
            .filter(Boolean).join("; ")
          : undefined;
        await updateDeliveryStatus(client, status.id, status.status, detail);
      }
    }
  }
};

const parseObject = (rawBody: string): Record<string, any> => {
  try {
    const value = JSON.parse(rawBody);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error();
    }
    return value;
  } catch {
    throw new HttpError(400, "El webhook no contiene JSON válido");
  }
};

export async function handleWebhook(
  request: Request,
  getClient = serviceClient,
): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    return mode === "subscribe" && matchesSecret(token, "WHATSAPP_VERIFY_TOKEN")
      ? new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
      : json({ message: "Verificación de webhook rechazada" }, 403);
  }
  if (request.method !== "POST") {
    return json({ message: "Método no permitido" }, 405);
  }
  try {
    const rawBody = await request.text();
    const metaSignature = request.headers.get("x-hub-signature-256");
    if (metaSignature) {
      if (!await verifyMetaSignature(rawBody, metaSignature)) {
        return json({ message: "Firma de Meta inválida" }, 401);
      }
      const payload = parseObject(rawBody);
      if (payload.object !== "whatsapp_business_account") {
        return json({ message: "Evento de Meta no reconocido" }, 400);
      }
      await handleMetaPayload(payload, getClient());
      return json({ received: true });
    }
    if (!evolutionAuthorized(request)) {
      return json({ message: "Webhook no autorizado" }, 401);
    }
    const payload = parseObject(rawBody);

    const expectedInstance = Deno.env.get("EVOLUTION_INSTANCE_NAME");
    if (
      expectedInstance && payload.instance &&
      payload.instance !== expectedInstance
    ) {
      return json({ received: true, ignored: true });
    }
    const event = String(payload.event ?? "").replaceAll(".", "_")
      .toUpperCase();
    const dataValue = payload.data;
    const data =
      dataValue && typeof dataValue === "object" && !Array.isArray(dataValue)
        ? dataValue as Record<string, any>
        : {};
    const client = getClient();

    if (event === "CONNECTION_UPDATE" || event === "CONNECTION") {
      const raw = String(data.state ?? data.statusReason ?? data.status ?? "")
        .toLowerCase();
      const state = raw === "open" || raw === "connected"
        ? "CONECTADO"
        : raw === "connecting"
        ? "CONECTANDO"
        : raw.includes("error")
        ? "ERROR"
        : "DESCONECTADO";
      const saved = await client.from("whatsapp_instancia_estado").upsert({
        id: 1,
        estado: state,
        numero: phoneFromJid(data.wuid ?? data.owner) || null,
        nombre_instancia: payload.instance ?? expectedInstance,
        detalle: raw || null,
        actualizado_en: new Date().toISOString(),
      });
      if (saved.error) throw new Error(saved.error.message);
    }

    if (["MESSAGES_UPSERT", "MESSAGE", "MESSAGES_SET"].includes(event)) {
      const items = Array.isArray(dataValue) ? dataValue : [data];
      for (const item of items) {
        const key = item.key ?? item.message?.key ?? {};
        if (String(key.remoteJid ?? "").endsWith("@g.us")) continue;
        const jid = preferredDirectJid(
          key.remoteJidAlt,
          item.remoteJidAlt,
          key.senderPn,
          item.senderPn,
          item.sender,
          key.remoteJid,
          item.from,
        );
        if (!jid) continue;
        const message = unwrapMessage(
          item.message?.message ?? item.message ?? {},
        );
        const content = String(textFromMessage(message)).trim();
        const providerId = String(key.id ?? item.id ?? "");
        if (key.fromMe) {
          if (!content || !providerId) continue;
          const imported = await client.rpc("importar_mensaje_whatsapp", {
            datos: {
              providerChatId: jid,
              providerId,
              direction: "SALIENTE",
              content,
              status: statusMap[String(item.status ?? "").toUpperCase()] ??
                "ENVIADO",
              createdAt: messageTimestamp(item.messageTimestamp),
            },
          });
          if (imported.error) throw new Error(imported.error.message);
          continue;
        }
        await routeIncoming(client, {
          phone: phoneFromJid(jid),
          content,
          providerId,
          contextProviderId:
            message.extendedTextMessage?.contextInfo?.stanzaId ??
              message.buttonsResponseMessage?.contextInfo?.stanzaId ??
              message.interactiveResponseMessage?.contextInfo?.stanzaId ??
              message.contextInfo?.stanzaId ??
              null,
        });
      }
    }

    if (["MESSAGES_UPDATE", "MESSAGE_UPDATE", "SEND_MESSAGE"].includes(event)) {
      const items = Array.isArray(dataValue) ? dataValue : [data];
      for (const item of items) {
        await updateDeliveryStatus(
          client,
          item.key?.id ?? item.id ?? item.messageId,
          item.update?.status ?? item.status,
          item.error ?? "Evolution API reportó un error",
        );
      }
    }
    return json({ received: true });
  } catch (error) {
    console.error("Error procesando webhook de WhatsApp", error);
    return errorResponse(error);
  }
}
