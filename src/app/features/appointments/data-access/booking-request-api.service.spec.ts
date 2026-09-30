import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { BookingRequestApiService } from './booking-request-api.service';

describe('BookingRequestApiService', () => {
  let service: BookingRequestApiService;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null }));
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client: { rpc } } }],
    });
    service = TestBed.inject(BookingRequestApiService);
  });

  it('creates only a review request from the public form', async () => {
    const payload = {
      fullName: 'Ana Torres', documentNumber: null, mobile: '999999999', email: null,
      service: 'Evaluación general', preferredDate: null, preferredShift: 'INDIFERENTE',
      message: null, privacyConsent: true,
    };
    await firstValueFrom(service.publicCreate(payload));
    expect(rpc).toHaveBeenCalledWith('crear_solicitud_cita', { datos: payload });
  });

  it('links a reviewed request to an existing appointment', async () => {
    await firstValueFrom(service.manage(8, 'AGENDADO', 2, 'Validado', 44));
    expect(rpc).toHaveBeenCalledWith('gestionar_solicitud_cita', {
      solicitud_id: 8,
      datos: { status: 'AGENDADO', version: 2, observation: 'Validado', appointmentId: 44 },
    });
  });
});
