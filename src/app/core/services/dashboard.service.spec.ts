import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppointmentApiService } from '../../features/appointments/data-access/appointment-api.service';
import { BookingRequestApiService } from '../../features/appointments/data-access/booking-request-api.service';
import { FinanceApiService } from '../../features/finance/data-access/finance-api.service';
import { MessagingApiService } from '../../features/messaging/data-access/messaging-api.service';
import { AuthService } from '../auth/auth.service';
import { DashboardService } from './dashboard.service';

describe('Mi jornada: resumen operativo', () => {
  let service: DashboardService;
  let appointments: ReturnType<typeof vi.fn>;
  let summary: ReturnType<typeof vi.fn>;
  let booking: ReturnType<typeof vi.fn>;
  let hasPermission: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    const appointment = { id: 42, patientId: 8, patientName: 'Paciente de prueba',
      start: '2026-09-15T10:00:00', status: 'CONFIRMADA', durationMinutes: 30 };
    appointments = vi.fn(() => of([appointment, { ...appointment, id: 43, status: 'COMPLETADA' }]));
    summary = vi.fn(() => of({ unreadConversations: 4, failedMessages: 2, reviewConversations: 1 }));
    booking = vi.fn(() => of([{ status: 'PENDIENTE' }, { status: 'CONTACTADO' }, { status: 'AGENDADO' }]));
    hasPermission = vi.fn(() => true);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { hasPermission } },
      { provide: AppointmentApiService, useValue: { list: appointments } },
      { provide: BookingRequestApiService, useValue: { list: booking } },
      { provide: FinanceApiService, useValue: { dashboard: () => of(null) } },
      { provide: MessagingApiService, useValue: { workdaySummary: summary, followUps: () => of([]) } },
    ] });
    service = TestBed.inject(DashboardService);
  });
  it('prioriza pendientes reales y no ofrece como próxima una cita completada', () => {
    service.load();
    expect(service.appointments().map((item) => item.id)).toEqual([42]);
    expect(service.metrics()[0].value).toBe('2');
    expect(service.pending().find((task) => task.id === -1)?.detail).toContain('2 solicitudes');
    expect(service.pending().find((task) => task.id === -2)?.detail).toContain('2 mensajes');
    expect(service.pending().find((task) => task.id === -3)?.detail).toContain('4 conversaciones');
  });
  it('mantiene la agenda si falla WhatsApp y avisa de información parcial', () => {
    summary.mockReturnValue(throwError(() => new Error('Error simulado')));
    service.load();
    expect(service.appointments()).toHaveLength(1);
    expect(service.loading()).toBe(false);
    expect(service.warnings()).toContain('Pendientes de WhatsApp no disponibles');
    expect(service.pending().some((task) => task.id === -2)).toBe(false);
  });
  it('muestra un valor desconocido, no cero, cuando no pudo consultar la agenda', () => {
    appointments.mockReturnValue(throwError(() => new Error('Error simulado')));
    service.load();
    expect(service.metrics()[0].value).toBe('—');
    expect(service.warnings()).toContain('Agenda no disponible');
    expect(service.pending().some((task) => task.id === -2)).toBe(true);
  });
  it('no consulta módulos para los que el usuario carece de permiso', () => {
    hasPermission.mockReturnValue(false);
    service.load();
    expect(appointments).not.toHaveBeenCalled();
    expect(booking).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
  });
});
