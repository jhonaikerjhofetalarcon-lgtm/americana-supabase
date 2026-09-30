import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { OdontogramApiService } from './odontogram-api.service';

describe('OdontogramApiService', () => {
  it('sends the current odontogram version when registering a finding', async () => {
    const odontogram = {
      id: 9,
      encounterId: 3,
      patientId: 4,
      dentitionType: 'PERMANENTE',
      status: 'BORRADOR',
      generalObservation: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: '2026-09-10T10:00:00Z',
      updatedAt: '2026-09-10T10:00:00Z',
      version: 6,
      findings: [],
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 9, error: null })
      .mockResolvedValueOnce({ data: [odontogram], error: null });
    const single = vi.fn().mockResolvedValue({ data: { atencion_id: 3 }, error: null });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client: { rpc, from } } }],
    });
    const service = TestBed.inject(OdontogramApiService);

    await firstValueFrom(
      service.addFinding(9, {
        tooth: '11',
        surface: 'VESTIBULAR',
        condition: 'CARIES',
        treatmentState: 'INDICADO',
        observation: null,
        version: 5,
      }),
    );

    expect(rpc).toHaveBeenNthCalledWith(1, 'registrar_hallazgo_odontograma', {
      odontograma_id: 9,
      datos: {
        tooth: '11',
        surface: 'VESTIBULAR',
        condition: 'CARIES',
        treatmentState: 'INDICADO',
        observation: null,
        version: 5,
      },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'listar_odontogramas', { atencion_id: 3 });
  });
});
