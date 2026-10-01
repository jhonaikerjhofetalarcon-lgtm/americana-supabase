export type EvolutionConnectionStatus =
  | "CONECTADO"
  | "DESCONECTADO"
  | "CONECTANDO"
  | "ERROR";
export type JsonRecord = Record<string, unknown>;

export class EvolutionRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type WhatsAppProvider = "evolution" | "meta";
export type WhatsAppSendOptions = {
  buttons?: WhatsAppReplyButton[];
  type?: string;
  appointmentId?: number;
  templateName?: string;
  templateParameters?: unknown[];
};

export const whatsappProvider = (): WhatsAppProvider =>
  Deno.env.get("WHATSAPP_PROVIDER")?.trim().toLowerCase() === "meta"
    ? "meta"
    : "evolution";

// Only an explicit rate-limit rejection is retried automatically. A timeout or
// server error may occur after delivery and needs reconciliation by an operator.
export function retryDelay(
  error: unknown,
  attempts: number,
  maxAttempts: number,
): number | null {
  if (
    !(error instanceof EvolutionRequestError) || error.status !== 429 ||
    attempts >= maxAttempts
  ) return null;
  return [60_000, 300_000, 900_000][Math.min(Math.max(attempts - 1, 0), 2)];
}

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};

const records = (value: unknown): JsonRecord[] =>
  Array.isArray(value)
    ? value.filter((item): item is JsonRecord =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    : [];

const configuration = () => {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.trim().replace(/\/$/, "");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY")?.trim();
  const instance = Deno.env.get("EVOLUTION_INSTANCE_NAME")?.trim();
  if (!baseUrl || !apiKey || !instance) {
    throw new Error("Evolution API todavía no está configurada");
  }
  return { baseUrl, apiKey, instance };
};

const evolutionRequest = async (path: string, init: RequestInit = {}) => {
  const { baseUrl, apiKey } = configuration();
  const accessClientId = Deno.env.get("CF_ACCESS_CLIENT_ID")?.trim();
  const accessClientSecret = Deno.env.get("CF_ACCESS_CLIENT_SECRET")?.trim();
  if (Boolean(accessClientId) !== Boolean(accessClientSecret)) {
    throw new Error("Cloudflare Access está configurado de forma incompleta");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20_000),
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      ...(accessClientId && accessClientSecret
        ? {
          "CF-Access-Client-Id": accessClientId,
          "CF-Access-Client-Secret": accessClientSecret,
        }
        : {}),
      ...init.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = asRecord(payload);
    const providerResponse = asRecord(errorPayload.response);
    const responseMessages = Array.isArray(providerResponse.message)
      ? providerResponse.message
      : [];
    const message = responseMessages[0] ?? errorPayload.message ??
      errorPayload.error;
    const detail = typeof message === "string"
      ? message
      : message && typeof message === "object"
      ? JSON.stringify(message).slice(0, 500)
      : "";
    throw new EvolutionRequestError(
      detail || `Evolution API respondió ${response.status}`,
      response.status,
    );
  }
  return payload;
};

const metaConfiguration = () => {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const graphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION")?.trim();
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE")?.trim() ||
    "es";
  if (!accessToken || !phoneNumberId || !graphVersion) {
    throw new Error("WhatsApp Cloud API todavía no está configurada");
  }
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("WHATSAPP_GRAPH_VERSION no es válida");
  }
  return { accessToken, phoneNumberId, graphVersion, templateLanguage };
};

const metaRequest = async (body: JsonRecord) => {
  const { accessToken, phoneNumberId, graphVersion } = metaConfiguration();
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const result = asRecord(payload);
    const error = asRecord(result.error);
    const detail = typeof error.message === "string"
      ? error.message
      : `Meta Cloud API respondió ${response.status}`;
    throw new EvolutionRequestError(detail.slice(0, 500), response.status);
  }
  const providerId = records(asRecord(payload).messages)[0]?.id;
  if (!providerId) {
    throw new Error("Meta Cloud API no devolvió el identificador del mensaje");
  }
  return String(providerId);
};

export function normalizeWhatsAppNumber(phone: string): string {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Los celulares peruanos se registran habitualmente con 9 dígitos.
  // Evolution/WhatsApp requiere el código de país: 51 + celular.
  if (/^9\d{8}$/.test(digits)) digits = `51${digits}`;
  return digits;
}

export type WhatsAppReplyButton = { id: string; text: string };

export function appointmentButtons(
  type: string,
  configured: WhatsAppReplyButton[] = [],
): WhatsAppReplyButton[] {
  if (configured.length) return configured;
  if (type === "CITA_CONFIRMACION" || type === "CITA_REPROGRAMACION") {
    return [
      { id: "CONFIRMO", text: "Confirmar" },
      { id: "CANCELAR", text: "Cancelar" },
      { id: "REPROGRAMAR", text: "Otra fecha" },
    ];
  }
  if (type === "CITA_RECORDATORIO" || type === "CITA_RECORDATORIO_2H") {
    return [
      { id: "CONFIRMO", text: "Confirmar" },
      { id: "CANCELAR", text: "Cancelar" },
      { id: "REPROGRAMAR", text: "Otra fecha" },
    ];
  }
  if (type === "CITA_CANCELACION") {
    return [{ id: "RESERVAR", text: "Nueva cita" }];
  }
  return [];
}

const metaTemplateFor = (type?: string, configured?: string) => {
  if (type === "CITA_CONFIRMACION") {
    return Deno.env.get("WHATSAPP_APPOINTMENT_TEMPLATE")?.trim() ||
      Deno.env.get("WHATSAPP_TEMPLATE_CITA_CONFIRMACION")?.trim();
  }
  const key = type ? `WHATSAPP_TEMPLATE_${type}` : "";
  const environmentTemplate = key ? Deno.env.get(key)?.trim() : undefined;
  if (environmentTemplate) return environmentTemplate;
  return configured && configured !== type ? configured : undefined;
};

async function sendMetaWhatsApp(
  phone: string,
  content: string,
  options: WhatsAppSendOptions,
) {
  const number = normalizeWhatsAppNumber(phone);
  if (!/^[1-9][0-9]{9,14}$/.test(number)) {
    throw new Error("El celular no incluye un código de país válido");
  }
  const templateName = metaTemplateFor(options.type, options.templateName);
  const buttons = options.buttons ?? [];
  if (templateName) {
    const { templateLanguage } = metaConfiguration();
    const parameters = (options.templateParameters ?? []).map((value) => ({
      type: "text",
      text: String(value ?? "").slice(0, 1024),
    }));
    const components: JsonRecord[] = [];
    if (parameters.length) components.push({ type: "body", parameters });
    buttons.slice(0, 3).forEach((button, index) =>
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(index),
        parameters: [{ type: "payload", payload: button.id }],
      })
    );
    return metaRequest({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: number,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components,
      },
    });
  }
  if (buttons.length > 0 && buttons.length <= 3) {
    return metaRequest({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: number,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: content.slice(0, 1024) },
        action: {
          buttons: buttons.map((button) => ({
            type: "reply",
            reply: {
              id: button.id.slice(0, 256),
              title: button.text.slice(0, 20),
            },
          })),
        },
      },
    });
  }
  return metaRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: number,
    type: "text",
    text: { preview_url: false, body: content.slice(0, 4096) },
  });
}

export async function sendWhatsApp(
  phone: string,
  content: string,
  buttonsOrOptions: WhatsAppReplyButton[] | WhatsAppSendOptions = [],
): Promise<string> {
  const options: WhatsAppSendOptions = Array.isArray(buttonsOrOptions)
    ? { buttons: buttonsOrOptions }
    : buttonsOrOptions;
  if (whatsappProvider() === "meta") {
    return sendMetaWhatsApp(phone, content, options);
  }
  const { instance } = configuration();
  const number = normalizeWhatsAppNumber(phone);
  if (number.length < 10) {
    throw new Error("El celular no incluye un código de país válido");
  }
  const buttons = options.buttons ?? [];
  const evolutionButtons = buttons.map((button) => {
    const action =
      button.id.match(/^appointment_(confirm|cancel|reschedule):/i)?.[1]
        ?.toLowerCase() ?? button.id.toUpperCase();
    const text = action === "confirm" || action === "CONFIRMO"
      ? "Aceptar cita"
      : action === "cancel" || action === "CANCELAR"
      ? "Cancelar"
      : action === "reschedule" || action === "REPROGRAMAR"
      ? "Reprogramar"
      : button.text;
    return { ...button, text };
  });
  // Baileys on older Evolution releases can accept sendButtons without delivering
  // it. Text is the reliable default; enable native buttons only after a real
  // device-to-device delivery test with the installed provider version.
  if (
    Deno.env.get("EVOLUTION_INTERACTIVE_BUTTONS") === "true" &&
    evolutionButtons.length > 0 && evolutionButtons.length <= 3
  ) {
    const valid = evolutionButtons.every((button) =>
      (/^[A-Z0-9_]{1,40}$/.test(button.id) ||
        /^appointment_(confirm|cancel|reschedule):[1-9][0-9]{0,18}$/i.test(
          button.id,
        )) &&
      button.text.length > 0 && button.text.length <= 20
    );
    if (valid) {
      try {
        const interactive = await evolutionRequest(
          `/message/sendButtons/${encodeURIComponent(instance)}`,
          {
            method: "POST",
            body: JSON.stringify({
              number,
              title: content,
              description: "Elige una opción o responde por texto.",
              footer: "Dental Americana",
              buttons: evolutionButtons.map((button) => ({
                type: "reply",
                displayText: button.text,
                id: button.id,
              })),
            }),
          },
        );
        const result = asRecord(interactive);
        const providerId = asRecord(result.key).id ??
          asRecord(asRecord(result.message).key).id ?? result.id;
        if (providerId) return String(providerId);
        throw new Error(
          "Evolution no devolvió el identificador del botón interactivo",
        );
      } catch (error) {
        // Only a definite provider rejection permits a safe text fallback.
        if (
          !(error instanceof EvolutionRequestError) || error.status < 400 ||
          error.status >= 500
        ) throw error;
      }
    }
  }
  const payload = await evolutionRequest(
    `/message/sendText/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number,
        text: content,
        delay: 500,
        linkPreview: false,
      }),
    },
  );
  const result = asRecord(payload);
  const providerId = asRecord(result.key).id ??
    asRecord(asRecord(result.message).key).id ??
    result.id;
  if (!providerId) {
    throw new Error("Evolution API no devolvió el identificador del mensaje");
  }
  return String(providerId);
}

export async function connectionState(): Promise<
  {
    status: EvolutionConnectionStatus;
    provider: WhatsAppProvider;
    phone?: string;
    detail?: string;
  }
> {
  if (whatsappProvider() === "meta") {
    try {
      metaConfiguration();
      return {
        status: "CONECTADO",
        provider: "meta",
        detail: "Meta Cloud API configurada",
      };
    } catch (error) {
      return {
        status: "ERROR",
        provider: "meta",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const { instance } = configuration();
  try {
    const payload = await evolutionRequest(
      `/instance/connectionState/${encodeURIComponent(instance)}`,
    );
    const result = asRecord(payload);
    const providerInstance = asRecord(result.instance);
    const raw = String(providerInstance.state ?? result.state ?? "")
      .toLowerCase();
    const status: EvolutionConnectionStatus =
      raw === "open" || raw === "connected"
        ? "CONECTADO"
        : raw === "connecting"
        ? "CONECTANDO"
        : "DESCONECTADO";
    const phone = providerInstance.owner ?? providerInstance.number;
    return {
      status,
      provider: "evolution",
      phone: phone == null ? undefined : String(phone),
      detail: raw || undefined,
    };
  } catch (error) {
    return {
      status: "ERROR",
      provider: "evolution",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function connectInstance() {
  if (whatsappProvider() === "meta") {
    throw new Error(
      "Meta Cloud API se vincula desde Meta Business y no utiliza código QR",
    );
  }
  const { instance } = configuration();
  return evolutionRequest(`/instance/connect/${encodeURIComponent(instance)}`);
}

export async function findChats(): Promise<JsonRecord[]> {
  if (whatsappProvider() === "meta") return [];
  const { instance } = configuration();
  const payload = await evolutionRequest(
    `/chat/findChats/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      body: "{}",
    },
  );
  return records(payload);
}

export async function findMessages(limit = 500): Promise<JsonRecord[]> {
  if (whatsappProvider() === "meta") return [];
  const { instance } = configuration();
  const payload = await evolutionRequest(
    `/chat/findMessages/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      body: JSON.stringify({ page: 1, offset: limit }),
    },
  );
  const messages = asRecord(payload).messages;
  if (Array.isArray(messages)) return records(messages);
  return records(asRecord(messages).records);
}

export async function createInstance() {
  if (whatsappProvider() === "meta") {
    throw new Error(
      "Configure el webhook de Meta Cloud API desde Meta for Developers",
    );
  }
  const { instance } = configuration();
  const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!webhookSecret || !supabaseUrl) {
    throw new Error("Falta configurar el secreto del webhook");
  }
  return evolutionRequest("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        enabled: true,
        url: `${supabaseUrl}/functions/v1/whatsapp-webhook?token=${
          encodeURIComponent(webhookSecret)
        }`,
        byEvents: false,
        base64: false,
        events: [
          "QRCODE_UPDATED",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "CONNECTION_UPDATE",
        ],
      },
    }),
  });
}

export function qrFromPayload(payload: unknown) {
  const result = asRecord(payload);
  const qr = asRecord(result.qrcode ?? result);
  const base64 = String(qr?.base64 ?? "");
  return {
    qrCode: base64
      ? (base64.startsWith("data:image")
        ? base64
        : `data:image/png;base64,${base64}`)
      : null,
    pairingCode: qr?.pairingCode ? String(qr.pairingCode) : null,
    code: qr?.code ? String(qr.code) : null,
  };
}
