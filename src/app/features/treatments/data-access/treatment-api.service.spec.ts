import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { TreatmentApiService } from './treatment-api.service';

describe('TreatmentApiService', () => {
  it('records explicit patient acceptance with optimistic concurrency', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 12, error: null })
      .mockResolvedValueOnce({ data: { id: 12, status: 'ACEPTADO' }, error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client: { rpc } } }],
    });
    const service = TestBed.inject(TreatmentApiService);

    await firstValueFrom(service.status(12, 'ACEPTADO', true, 4));

    expect(rpc).toHaveBeenNthCalledWith(1, 'gestionar_plan', {
      accion: 'ESTADO',
      datos: { planId: 12, status: 'ACEPTADO', patientAcceptance: true, version: 4 },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'obtener_plan', { plan_id: 12 });
  });

  it('marks a treatment evolution as professionally confirmed', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 12, error: null })
      .mockResolvedValueOnce({ data: { id: 12, status: 'EN_PROCESO' }, error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client: { rpc } } }],
    });
    const service = TestBed.inject(TreatmentApiService);

    await firstValueFrom(
      service.evolution(12, 8, {
        encounterId: 3,
        procedure: 'Profilaxis completa',
        observations: null,
        nextSession: null,
      }),
    );

    expect(rpc).toHaveBeenNthCalledWith(1, 'gestionar_plan', {
      accion: 'EVOLUCION',
      datos: {
        planId: 12,
        itemId: 8,
        encounterId: 3,
        procedure: 'Profilaxis completa',
        observations: null,
        nextSession: null,
        professionalConfirmation: true,
      },
    });
  });
});
