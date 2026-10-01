import { inject, Injectable } from '@angular/core';
import { defer, map, Observable } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import {
  AutomationSetting,
  Conversation,
  FollowUp,
  InboxPage,
  Message,
  WhatsAppSession,
} from '../models/messaging.models';

@Injectable({ providedIn: 'root' })
export class MessagingApiService {
  private static readonly errorMessage = 'No se pudo completar la operación de WhatsApp.';
  private readonly api = inject(SupabaseApiService);
  private readonly supabase = this.api.client;

  conversations(search = ''): Observable<Conversation[]> {
    return this.rpc<Conversation[]>(
      'listar_conversaciones_whatsapp',
      { busqueda: search || null },
      [],
    );
  }
  conversationsPage(
    search = '',
    before?: { at: string; id: number },
    size = 30,
  ): Observable<InboxPage<Conversation>> {
    return this.rpc<InboxPage<Conversation>>('listar_conversaciones_whatsapp_paginadas', {
      busqueda: search || null,
      antes_de: before?.at ?? null,
      antes_id: before?.id ?? null,
      tamano: size,
    });
  }
  conversationMessages(id: number): Observable<Message[]> {
    return this.rpc<Message[]>('listar_mensajes_conversacion', { conversacion_id: id }, []);
  }
  conversationMessagesPage(
    id: number,
    before?: { at: string; id: number },
    size = 50,
  ): Observable<InboxPage<Message>> {
    return this.rpc<InboxPage<Message>>('listar_mensajes_conversacion_paginados', {
      conversacion_id: id,
      antes_de: before?.at ?? null,
      antes_id: before?.id ?? null,
      tamano: size,
    });
  }
  followUps(): Observable<FollowUp[]> {
    return this.rpc<FollowUp[]>('listar_seguimientos', {}, []);
  }
  workdaySummary(): Observable<{
    unreadConversations: number;
    failedMessages: number;
    reviewConversations: number;
  }> {
    return defer(async () => {
      const results = await Promise.all([
        this.supabase
          .from('conversaciones_whatsapp')
          .select('id', { count: 'exact', head: true })
          .gt('no_leidos', 0),
        this.supabase
          .from('mensajes_whatsapp')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'FALLIDO')
          .eq('direccion', 'SALIENTE'),
        this.supabase
          .from('conversaciones_whatsapp')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'DERIVADA'),
      ]);
      for (const result of results) {
        if (result.error || result.count === null)
          this.api.fail(result.error, 'No se pudieron consultar los pendientes de WhatsApp.');
      }
      return {
        unreadConversations: results[0].count!,
        failedMessages: results[1].count!,
        reviewConversations: results[2].count!,
      };
    });
  }
  markRead(id: number): Observable<void> {
    return this.rpc<void>('marcar_conversacion_leida', { conversacion_id: id });
  }
  session(): Observable<WhatsAppSession> {
    return this.invoke<WhatsAppSession>('whatsapp-session', {});
  }
  connect(): Observable<WhatsAppSession> {
    return this.invoke<WhatsAppSession>('whatsapp-session', { action: 'connect' });
  }
  sync(): Observable<{ chats: number; messages: number }> {
    return this.invoke<{ chats: number; messages: number }>('whatsapp-sync', {});
  }
  send(patientId: number, content: string, scheduledFor?: string): Observable<Message> {
    return this.invoke<Message>('whatsapp-send', {
      patientId,
      content,
      scheduledFor: scheduledFor || null,
    });
  }
  retry(messageId: number): Observable<Message> {
    return this.invoke<Message>('whatsapp-send', { retryMessageId: messageId });
  }
  automationSettings(): Observable<AutomationSetting[]> {
    return this.rpc<AutomationSetting[]>('listar_configuracion', {}, []).pipe(
      map((settings) =>
        settings.filter((setting) => setting.key.startsWith('whatsapp.automatizacion.')),
      ),
    );
  }
  updateAutomationSetting(
    key: string,
    active: boolean,
    version: number,
  ): Observable<AutomationSetting> {
    return this.rpc<AutomationSetting>('actualizar_configuracion', {
      clave: key,
      valor: String(active),
      version_actual: version,
    });
  }
  review(id: number, version: number): Observable<FollowUp> {
    return this.rpc<FollowUp>('revisar_seguimiento', {
      seguimiento_id: id,
      version_actual: version,
      confirmacion: true,
    });
  }
  realtime(): Observable<void> {
    return new Observable((subscriber) => {
      const channel = this.supabase
        .channel(`dental-whatsapp-ui-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes_whatsapp' }, () =>
          subscriber.next(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversaciones_whatsapp' },
          () => subscriber.next(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'whatsapp_instancia_estado' },
          () => subscriber.next(),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () =>
          subscriber.next(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'seguimientos_postconsulta' },
          () => subscriber.next(),
        )
        .subscribe();
      return () => {
        void this.supabase.removeChannel(channel);
      };
    });
  }
  private invoke<T>(name: string, body: Record<string, unknown>) {
    return this.api.invoke<T>(name, body, {
      errorMessage: MessagingApiService.errorMessage,
    });
  }
  private rpc<T>(name: string, args: Record<string, unknown>, fallback?: T) {
    const options =
      fallback === undefined
        ? { errorMessage: MessagingApiService.errorMessage }
        : { errorMessage: MessagingApiService.errorMessage, fallback };
    return this.api.rpc<T>(name, args, options);
  }
}
