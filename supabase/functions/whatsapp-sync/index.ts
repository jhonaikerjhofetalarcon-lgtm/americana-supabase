import { matchesSecret, requirePermission } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/client.ts";
import {
  corsHeaders,
  errorResponse,
  json,
  readJsonObject,
} from "../_shared/http.ts";
import {
  connectionState,
  findChats,
  findMessages,
} from "../_shared/whatsapp.ts";

const directJid = (value: unknown) => {
  const jid = String(value ?? "").trim();
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid") ? jid : "";
};
const preferredDirectJid = (...values: unknown[]) => {
  const candidates = values.map(directJid).filter(Boolean);
  return candidates.find((jid) => jid.endsWith("@s.whatsapp.net")) ??
    candidates[0] ?? "";
};
const digits = (value: unknown) =>
  String(value ?? "").split("@")[0].replace(/\D/g, "");
const record = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
const timestamp = (value: unknown) => {
  const raw = typeof value === "object" && value
    ? (value as { low?: unknown }).low
    : value;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
};
const text = (message: Record<string, any> = {}, type = "") =>
  String(
    message.conversation ?? message.extendedTextMessage?.text ??
      message.imageMessage?.caption ?? message.videoMessage?.caption ??
      message.documentMessage?.caption ??
      message.buttonsResponseMessage?.selectedDisplayText ??
      message.listResponseMessage?.title ??
      message.buttonsMessage?.contentText ??
      message.templateMessage?.hydratedTemplate?.hydratedContentText ??
      message.interactiveMessage?.body?.text ??
      (type === "imageMessage"
        ? "[Imagen]"
        : type === "videoMessage"
        ? "[Video]"
        : type === "audioMessage"
        ? "[Audio]"
        : type === "documentMessage"
        ? "[Documento]"
        : type === "stickerMessage"
        ? "[Sticker]"
        : type === "contactMessage"
        ? "[Contacto]"
        : type === "locationMessage"
        ? "[Ubicación]"
        : ""),
  ).trim();
const messageStatus = (value: unknown) => {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "READ" || raw === "READ_ACK" || raw === "PLAYED") return "LEIDO";
  if (raw === "DELIVERED" || raw === "DELIVERY_ACK") return "ENTREGADO";
  if (raw === "FAILED" || raw === "ERROR") return "FALLIDO";
  return "ENVIADO";
};

async function authorized(request: Request) {
  if (
    matchesSecret(request.headers.get("x-cron-secret"), "WHATSAPP_CRON_SECRET")
  ) return;
  await requirePermission(request, "SEGUIMIENTO_ESCRIBIR");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ message: "Método no permitido" }, 405);
  }
  try {
    await authorized(request);
    const body = await readJsonObject(request);
    if (body.healthOnly === true) return json(await connectionState());
    const [chats, messages] = await Promise.all([
      findChats(),
      findMessages(500),
    ]);
    const admin = serviceClient();
    const validChats = chats.map((chat) => {
      const last = record(chat.lastMessage);
      const key = record(last.key);
      return {
        chat,
        jid: preferredDirectJid(
          key.remoteJidAlt,
          chat.remoteJidAlt,
          chat.remoteJid,
        ),
      };
    }).filter((entry) => entry.jid);

    const importChat = async (
      entry: { chat: Record<string, any>; jid: string },
    ) => {
      const { chat, jid } = entry;
      const last = chat.lastMessage ?? {};
      const result = await admin.rpc("importar_chat_whatsapp", {
        datos: {
          providerChatId: jid,
          phone: digits(jid),
          contactName: chat.pushName ||
            (!last.key?.fromMe ? last.pushName : null),
          lastMessage: text(last.message, last.messageType),
          lastMessageDirection: last.key?.fromMe ? "SALIENTE" : "ENTRANTE",
          lastMessageAt: timestamp(
            last.messageTimestamp ?? new Date(chat.updatedAt).getTime() / 1000,
          ),
          unreadCount: Number(chat.unreadCount ?? 0),
        },
      });
      if (result.error) throw new Error(result.error.message);
    };

    for (const chat of validChats) await importChat(chat);

    let importedMessages = 0;
    const orderedMessages = messages.map((message) => {
      const key = record(message.key);
      return {
        message,
        jid: preferredDirectJid(
          key.remoteJidAlt,
          message.remoteJidAlt,
          key.remoteJid,
        ),
      };
    }).filter((entry) =>
      entry.jid &&
      text(
        record(entry.message.message),
        String(entry.message.messageType ?? ""),
      )
    )
      .sort((a, b) =>
        Number(a.message.messageTimestamp ?? 0) -
        Number(b.message.messageTimestamp ?? 0)
      );
    for (const { message, jid } of orderedMessages) {
      const latestUpdate = Array.isArray(message.MessageUpdate)
        ? message.MessageUpdate.at(-1)
        : null;
      const result = await admin.rpc("importar_mensaje_whatsapp", {
        datos: {
          providerChatId: jid,
          providerId: record(message.key).id,
          direction: record(message.key).fromMe ? "SALIENTE" : "ENTRANTE",
          content: text(
            record(message.message),
            String(message.messageType ?? ""),
          ),
          status: messageStatus(latestUpdate?.status ?? message.status),
          createdAt: timestamp(message.messageTimestamp),
        },
      });
      if (result.error) throw new Error(result.error.message);
      if (result.data) importedMessages++;
    }

    // Evolution conserva el contador de no leídos y el último mensaje autoritativos.
    for (const chat of validChats) await importChat(chat);
    return json({ chats: validChats.length, messages: importedMessages });
  } catch (error) {
    return errorResponse(error, 502);
  }
});
