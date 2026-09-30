import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { MessagingApiService } from './messaging-api.service';

describe('MessagingApiService', () => {
  let service: MessagingApiService;
  let rpc: ReturnType<typeof vi.fn>;
  let invoke: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    from = vi.fn();
    rpc = vi.fn(() => Promise.resolve({ data: { id: 9 }, error: null }));
    invoke = vi.fn(() => Promise.resolve({ data: { chats: 3, messages: 8 }, error: null }));
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseClientService, useValue: { client: { rpc, from, functions: { invoke } } } },
      ],
    });
    service = TestBed.inject(MessagingApiService);
  });

  function countQuery(count: number | null, error: unknown = null) {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: Promise.resolve({ count, error }).then.bind(Promise.resolve({ count, error })),
    };
    return query;
  }

  it('counts pending work without downloading conversation contents', async () => {
    const unread = countQuery(2);
    const failed = countQuery(3);
    const review = countQuery(1);
    from.mockReturnValueOnce(unread).mockReturnValueOnce(failed).mockReturnValueOnce(review);
    expect(await firstValueFrom(service.workdaySummary())).toEqual({
      unreadConversations: 2, failedMessages: 3, reviewConversations: 1,
    });
    expect(from.mock.calls).toEqual([
      ['conversaciones_whatsapp'], ['mensajes_whatsapp'], ['conversaciones_whatsapp'],
    ]);
    for (const query of [unread, failed, review]) {
      expect(query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    }
    expect(unread.gt).toHaveBeenCalledWith('no_leidos', 0);
    expect(failed.eq.mock.calls).toEqual([['estado', 'FALLIDO'], ['direccion', 'SALIENTE']]);
    expect(review.eq).toHaveBeenCalledWith('estado', 'DERIVADA');
  });

  it('does not report zero pending work if the count could not be loaded', async () => {
    from.mockReturnValue(countQuery(null));
    await expect(firstValueFrom(service.workdaySummary())).rejects.toThrow(
      'No se pudieron consultar los pendientes de WhatsApp.',
    );
  });
  it('marks a follow-up as professionally reviewed', async () => {
    await firstValueFrom(service.review(9, 3));
    expect(rpc).toHaveBeenCalledWith('revisar_seguimiento', {
      seguimiento_id: 9,
      version_actual: 3,
      confirmacion: true,
    });
  });
  it('synchronizes the Evolution API history through an Edge Function', async () => {
    await firstValueFrom(service.sync());
    expect(invoke).toHaveBeenCalledWith('whatsapp-sync', { body: {} });
  });

  it('requests a new QR through the protected session function', async () => {
    await firstValueFrom(service.connect());
    expect(invoke).toHaveBeenCalledWith('whatsapp-session', {
      body: { action: 'connect' },
    });
  });

  it('sends manual messages only through the Edge Function', async () => {
    await firstValueFrom(service.send(42, 'Hola paciente'));
    expect(invoke).toHaveBeenCalledWith('whatsapp-send', {
      body: { patientId: 42, content: 'Hola paciente', scheduledFor: null },
    });
  });

  it('retries a failed message by its identifier', async () => {
    await firstValueFrom(service.retry(81));
    expect(invoke).toHaveBeenCalledWith('whatsapp-send', {
      body: { retryMessageId: 81 },
    });
  });

  it('passes the normalized empty search to the conversations RPC', async () => {
    await firstValueFrom(service.conversations());
    expect(rpc).toHaveBeenCalledWith('listar_conversaciones_whatsapp', { busqueda: null });
  });

  it('loads a bounded conversation page using the cursor', async () => {
    await firstValueFrom(service.conversationsPage('Ana', { at: '2026-09-12T10:00:00Z', id: 12 }));
    expect(rpc).toHaveBeenCalledWith('listar_conversaciones_whatsapp_paginadas', {
      busqueda: 'Ana', antes_de: '2026-09-12T10:00:00Z', antes_id: 12, tamano: 30,
    });
  });

  it('loads older messages without requesting the entire chat', async () => {
    await firstValueFrom(service.conversationMessagesPage(7, { at: '2026-09-12T09:00:00Z', id: 88 }));
    expect(rpc).toHaveBeenCalledWith('listar_mensajes_conversacion_paginados', {
      conversacion_id: 7, antes_de: '2026-09-12T09:00:00Z', antes_id: 88, tamano: 50,
    });
  });
});
