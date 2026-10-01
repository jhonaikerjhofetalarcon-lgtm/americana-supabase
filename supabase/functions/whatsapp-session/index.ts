import { requirePermission } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/client.ts";
import {
  corsHeaders,
  errorMessage,
  errorResponse,
  HttpError,
  json,
  readJsonObject,
} from "../_shared/http.ts";
import {
  connectInstance,
  connectionState,
  createInstance,
  qrFromPayload,
} from "../_shared/whatsapp.ts";

const persist = async (status: string, phone?: string, detail?: string) => {
  const result = await serviceClient().from("whatsapp_instancia_estado").upsert(
    {
      id: 1,
      estado: status,
      numero: phone ?? null,
      nombre_instancia: Deno.env.get("EVOLUTION_INSTANCE_NAME") ?? null,
      detalle: detail ?? null,
      actualizado_en: new Date().toISOString(),
    },
  );
  if (result.error) {
    console.error(
      "No se pudo guardar el estado de WhatsApp",
      result.error.message,
    );
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (request.method !== "POST") {
      return json({ message: "Método no permitido" }, 405);
    }
    const body = await readJsonObject(request);
    if (body.action === "connect") {
      await requirePermission(request, "SEGUIMIENTO_ESCRIBIR");
      await persist("CONECTANDO");
      let payload;
      try {
        payload = await connectInstance();
      } catch (error) {
        const detail = errorMessage(error).toLowerCase();
        if (!detail.includes("not found") && !detail.includes("404")) {
          throw error;
        }
        payload = await createInstance();
      }
      return json({
        status: "CONECTANDO",
        provider: "evolution",
        ...qrFromPayload(payload),
      });
    }
    await requirePermission(request, "SEGUIMIENTO_LEER");
    const state = await connectionState();
    await persist(state.status, state.phone, state.detail);
    return json(state);
  } catch (error) {
    if (!(error instanceof HttpError)) {
      await persist("ERROR", undefined, errorMessage(error));
    }
    return errorResponse(error, 502);
  }
});
