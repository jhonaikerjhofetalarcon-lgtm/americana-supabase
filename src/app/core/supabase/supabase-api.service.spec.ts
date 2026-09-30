import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseApiService } from './supabase-api.service';
import { SupabaseClientService } from './supabase-client.service';

describe('SupabaseApiService', () => {
  let rpc: ReturnType<typeof vi.fn>;
  let invoke: ReturnType<typeof vi.fn>;
  let service: SupabaseApiService;

  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
    invoke = vi.fn(() => Promise.resolve({ data: { ok: true }, error: null }));
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client: { rpc, functions: { invoke } } } }],
    });
    service = TestBed.inject(SupabaseApiService);
  });

  it('supports an explicit null fallback', async () => {
    await expect(firstValueFrom(service.rpc<null>('caja_actual', {}, { fallback: null })))
      .resolves.toBeNull();
  });

  it('invokes Edge Functions through one shared adapter', async () => {
    await expect(firstValueFrom(service.invoke<{ ok: boolean }>('health', {})))
      .resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('health', { body: {} });
  });
});
