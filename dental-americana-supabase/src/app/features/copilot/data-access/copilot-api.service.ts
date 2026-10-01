import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import { AiDraft, AiDraftType, ChatMessage, ChatReply } from '../models/copilot.models';

@Injectable({ providedIn: 'root' })
export class CopilotApiService {
  private readonly api = inject(SupabaseApiService);
  chat(encounterId: number | null, messages: ChatMessage[]): Observable<ChatReply> {
    return this.api.invoke<ChatReply>(
      'copilot-chat',
      { encounterId, messages },
      {
        errorMessage: 'No se pudo obtener una respuesta de DentalIA. Inténtalo nuevamente.',
      },
    );
  }
  list(encounterId: number): Observable<AiDraft[]> {
    return this.rpc<AiDraft[]>('listar_borradores_ia', { atencion_id: encounterId }, []);
  }
  generate(encounterId: number, type: AiDraftType): Observable<AiDraft> {
    return this.api.invoke<AiDraft>(
      'copilot-generate',
      { encounterId, type },
      {
        errorMessage: 'No se pudo generar el borrador.',
      },
    );
  }
  edit(id: number, version: number, content: string): Observable<AiDraft> {
    return this.rpc<AiDraft>('revisar_borrador_ia', {
      borrador_id: id,
      accion: 'EDITAR',
      version_actual: version,
      valor: content,
    });
  }
  approve(id: number, version: number): Observable<AiDraft> {
    return this.rpc<AiDraft>('revisar_borrador_ia', {
      borrador_id: id,
      accion: 'APROBAR',
      version_actual: version,
      valor: null,
    });
  }
  reject(id: number, version: number, reason: string): Observable<AiDraft> {
    return this.rpc<AiDraft>('revisar_borrador_ia', {
      borrador_id: id,
      accion: 'RECHAZAR',
      version_actual: version,
      valor: reason,
    });
  }
  private rpc<T>(name: string, args: Record<string, unknown>, fallback?: T): Observable<T> {
    const options =
      fallback === undefined
        ? { errorMessage: 'No se pudo completar la operación de DentalIA.' }
        : { errorMessage: 'No se pudo completar la operación de DentalIA.', fallback };
    return this.api.rpc<T>(name, args, options);
  }
}
