import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { ClinicalApiService } from './clinical-api.service';

describe('ClinicalApiService', () => {
  let service: ClinicalApiService;
  let rpc: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    rpc = vi.fn()
      .mockResolvedValueOnce({ data: 7, error: null })
      .mockResolvedValueOnce({ data: { id: 7 }, error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseClientService, useValue: { client: { rpc } } }] });
    service = TestBed.inject(ClinicalApiService);
  });

  it('starts a walk-in encounter without inventing an appointment', async () => {
    await firstValueFrom(service.start(24));
    expect(rpc).toHaveBeenNthCalledWith(1, 'iniciar_atencion', { paciente_id: 24, cita_id: null });
    expect(rpc).toHaveBeenNthCalledWith(2, 'obtener_atencion', { atencion_id: 7 });
  });

  it('requires explicit professional confirmation when finalizing', async () => {
    await firstValueFrom(service.finalize(7, 4));
    expect(rpc).toHaveBeenNthCalledWith(1, 'finalizar_atencion', {
      atencion_id: 7, version_actual: 4, confirmar_aprobacion: true,
    });
  });
});
