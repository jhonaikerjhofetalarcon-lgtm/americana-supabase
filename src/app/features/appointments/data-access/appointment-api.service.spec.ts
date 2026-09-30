import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { Appointment } from '../models/appointment.models';
import { AppointmentApiService } from './appointment-api.service';

describe('AppointmentApiService', () => {
  let service: AppointmentApiService;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const client = { rpc, from: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client } }],
    });
    service = TestBed.inject(AppointmentApiService);
  });

  it('requests an agenda range with filters through the protected RPC', async () => {
    await firstValueFrom(
      service.list('2026-09-01T05:00:00.000Z', '2026-09-08T05:00:00.000Z', 4, 'CONFIRMADA'),
    );
    expect(rpc).toHaveBeenCalledWith('listar_citas', {
      desde: '2026-09-01T05:00:00.000Z',
      hasta: '2026-09-08T05:00:00.000Z',
      profesional_id: 4,
      estado_filtro: 'CONFIRMADA',
    });
  });

  it('sends optimistic version when changing appointment status', async () => {
    const appointment = { id: 12, status: 'CANCELADA', version: 4 } as Appointment;
    rpc
      .mockResolvedValueOnce({ data: 12, error: null })
      .mockResolvedValueOnce({ data: appointment, error: null });

    await expect(
      firstValueFrom(service.changeStatus(12, 'CANCELADA', 3, 'Paciente solicitó cambio')),
    ).resolves.toEqual(appointment);
    expect(rpc).toHaveBeenNthCalledWith(1, 'cambiar_estado_cita', {
      cita_id: 12,
      nuevo_estado: 'CANCELADA',
      version_actual: 3,
      motivo_value: 'Paciente solicitó cambio',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'obtener_cita', { cita_id: 12 });
  });

  it('creates and links an appointment from a booking request atomically', async () => {
    const appointment = { id: 44, status: 'PENDIENTE_CONFIRMACION' } as Appointment;
    const payload = {
      patientId: 9,
      professionalId: 4,
      appointmentTypeId: 2,
      start: '2026-09-11T14:00:00.000Z',
      reason: 'Evaluación',
      notes: null,
      source: 'WEB' as const,
    };
    rpc
      .mockResolvedValueOnce({ data: 44, error: null })
      .mockResolvedValueOnce({ data: appointment, error: null });

    await expect(firstValueFrom(service.createFromRequest(8, 3, payload))).resolves.toEqual(
      appointment,
    );
    expect(rpc).toHaveBeenNthCalledWith(1, 'crear_cita_desde_solicitud', {
      solicitud_id: 8,
      version_actual: 3,
      datos: payload,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'obtener_cita', { cita_id: 44 });
  });
});
