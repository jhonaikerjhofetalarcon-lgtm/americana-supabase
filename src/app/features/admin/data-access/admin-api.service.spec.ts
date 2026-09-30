import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { AdminApiService } from './admin-api.service';

describe('AdminApiService', () => {
  let service: AdminApiService;
  let rpc: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: { key: 'clinica.telefono' }, error: null }));
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client: { rpc } } }],
    });
    service = TestBed.inject(AdminApiService);
  });
  it('updates a setting with optimistic version', async () => {
    await firstValueFrom(service.updateSetting('clinica.telefono', '940 577 075', 4));
    expect(rpc).toHaveBeenCalledWith('actualizar_configuracion', {
      clave: 'clinica.telefono',
      valor: '940 577 075',
      version_actual: 4,
    });
  });
});
