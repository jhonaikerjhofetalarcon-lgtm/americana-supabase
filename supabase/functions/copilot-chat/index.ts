import { requirePermission } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, HttpError, json, readJsonObject, requireMethod } from '../_shared/http.ts';
import { ChatContext, parseChat, replyToChat } from './chat.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    requireMethod(request, 'POST');
    const client = await requirePermission(request, 'IA_ESCRIBIR');
    const { encounterId, messages } = parseChat(await readJsonObject(request));
    let context: ChatContext | null = null;
    if (encounterId !== null) {
      const result = await client.rpc('contexto_copiloto', { atencion_id: encounterId, tipo: 'RESUMEN_HISTORIA' });
      if (result.error) throw new HttpError(result.error.code === '42501' ? 403 : 400, result.error.message);
      if (!result.data) throw new HttpError(404, 'Atención no encontrada');
      context = result.data as unknown as ChatContext;
    }
    return json(await replyToChat(messages, context, {
      enabled: Deno.env.get('EXTERNAL_AI_ENABLED') === 'true',
      geminiKey: Deno.env.get('GEMINI_API_KEY'),
      geminiModel: Deno.env.get('GEMINI_MODEL'),
      apiKey: Deno.env.get('AI_API_KEY'),
      apiUrl: Deno.env.get('AI_API_URL'),
      model: Deno.env.get('AI_MODEL'),
    }));
  } catch (error) {
    return errorResponse(error);
  }
});
