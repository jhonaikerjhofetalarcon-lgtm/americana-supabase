import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { CopilotApiService } from './copilot-api.service';

describe('CopilotApiService', () => {
  let service: CopilotApiService;
  let rpc: ReturnType<typeof vi.fn>;
  let invoke: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: { id: 5 }, error: null }));
    invoke = vi.fn(() => Promise.resolve({ data: { id: 8 }, error: null }));
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseClientService, useValue: { client: { rpc, functions: { invoke } } } },
      ],
    });
    service = TestBed.inject(CopilotApiService);
  });
  it('generates a traceable draft inside an Edge Function', async () => {
    await firstValueFrom(service.generate(12, 'VERIFICACION_CIERRE'));
    expect(invoke).toHaveBeenCalledWith('copilot-generate', {
      body: { encounterId: 12, type: 'VERIFICACION_CIERRE' },
    });
  });
  it('sends patient context and message history to the chat Edge Function', async () => {
    const messages = [{ role: 'user' as const, content: 'Resume la atención' }];
    await firstValueFrom(service.chat(12, messages));
    expect(invoke).toHaveBeenCalledWith('copilot-chat', {
      body: { encounterId: 12, messages },
    });
  });
  it('sends optimistic version on professional approval', async () => {
    await firstValueFrom(service.approve(5, 2));
    expect(rpc).toHaveBeenCalledWith('revisar_borrador_ia', {
      borrador_id: 5,
      accion: 'APROBAR',
      version_actual: 2,
      valor: null,
    });
  });
});
