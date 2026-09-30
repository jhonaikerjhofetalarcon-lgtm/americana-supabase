import { inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, Observable, of, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../supabase/request-timeout';
import { AppointmentApiService } from '../../features/appointments/data-access/appointment-api.service';
import { BookingRequestApiService } from '../../features/appointments/data-access/booking-request-api.service';
import { Appointment as ApiAppointment } from '../../features/appointments/models/appointment.models';
import { FinanceApiService } from '../../features/finance/data-access/finance-api.service';
import { FinanceDashboard } from '../../features/finance/models/finance.models';
import { MessagingApiService } from '../../features/messaging/data-access/messaging-api.service';
import { FollowUp } from '../../features/messaging/models/messaging.models';
import { AuthService } from '../auth/auth.service';
import { SupabaseErrorService } from '../supabase/supabase-error.service';
import {
  Appointment,
  AppointmentStatus,
  DashboardMetric,
  PendingTask,
} from '../models/dashboard.models';
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly auth = inject(AuthService);
  private readonly appointmentApi = inject(AppointmentApiService);
  private readonly bookingApi = inject(BookingRequestApiService);
  private readonly financeApi = inject(FinanceApiService);
  private readonly messagingApi = inject(MessagingApiService);
  private readonly errors = inject(SupabaseErrorService);
  private requestId = 0;
  readonly metrics = signal<DashboardMetric[]>([]);
  readonly appointments = signal<Appointment[]>([]);
  readonly pending = signal<PendingTask[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly warnings = signal<string[]>([]);
  load(): void {
    const requestId = ++this.requestId;
    const { from, to } = this.todayRange();
    this.loading.set(true);
    this.error.set('');
    this.warnings.set([]);
    const available = <T>(request: Observable<T>, label: string): Observable<T | null> =>
      request.pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), catchError(() => {
        if (requestId === this.requestId) this.warnings.update((items) => [...items, label]);
        return of(null);
      }));
    const appointmentRequest = this.auth.hasPermission('CITA_LEER')
      ? this.appointmentApi.list(from, to)
      : of<ApiAppointment[]>([]);
    const financeRequest = this.auth.hasPermission('FINANZA_LEER')
      ? this.financeApi.dashboard(from, to)
      : of<FinanceDashboard | null>(null);
    const followRequest = this.auth.hasPermission('SEGUIMIENTO_LEER')
      ? this.messagingApi.followUps()
      : of<FollowUp[]>([]);
    forkJoin({
      appointments: available(appointmentRequest, 'Agenda no disponible'),
      finance: available(financeRequest, 'Finanzas no disponibles'),
      followups: available(followRequest, 'Seguimientos no disponibles'),
      requests: this.auth.hasPermission('CITA_LEER')
        ? available(this.bookingApi.list(), 'Solicitudes no disponibles') : of(null),
      messaging: this.auth.hasPermission('SEGUIMIENTO_LEER')
        ? available(this.messagingApi.workdaySummary(), 'Pendientes de WhatsApp no disponibles') : of(null),
    }).subscribe({
      next: (r) => {
        if (requestId !== this.requestId) return;
        const visible = (r.appointments ?? []).filter(
          (a) => a.status !== 'CANCELADA' && a.status !== 'NO_ASISTIO',
        );
        this.appointments.set(
          visible
            .filter((appointment) => appointment.status !== 'COMPLETADA')
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((a) => this.mapAppointment(a)),
        );
        const alerts = (r.followups ?? []).filter((f) => f.status === 'ALERTA');
        this.metrics.set([
          {
            label: 'Citas de hoy',
            value: r.appointments === null ? '—' : String(visible.length),
            detail: `${visible.filter((a) => a.status === 'CONFIRMADA').length} confirmadas`,
            tone: 'blue',
          },
          {
            label: 'En espera',
            value: r.appointments === null ? '—' : String(
              visible.filter((a) => a.status === 'EN_ESPERA' || a.status === 'EN_ATENCION').length,
            ),
            detail: 'Pacientes en clínica',
            tone: 'green',
          },
          {
            label: 'Por confirmar',
            value: r.appointments === null ? '—' : String(visible.filter((a) => a.status === 'PENDIENTE_CONFIRMACION').length),
            detail: 'Requieren contacto',
            tone: 'amber',
          },
          r.finance
            ? {
                label: 'Ingresos del día',
                value: this.money(r.finance.income),
                detail: `Resultado ${this.money(r.finance.net)}`,
                tone: 'rose',
              }
            : {
                label: 'Alertas activas',
                value: String(alerts.length),
                detail: 'Seguimientos por revisar',
                tone: 'rose',
              },
        ]);
        const tasks: PendingTask[] = [];
        const requests = (r.requests ?? []).filter((request) => request.status === 'PENDIENTE' || request.status === 'CONTACTADO');
        if (requests.length) tasks.push({ id: -1, title: 'Solicitudes por agendar',
          detail: `${requests.length} solicitudes pendientes o contactadas`, kind: 'approval', route: '/sistema/agenda/solicitudes' });
        if (r.messaging?.failedMessages) tasks.push({ id: -2, title: 'Envíos de WhatsApp fallidos',
          detail: `${r.messaging.failedMessages} mensajes requieren revisión antes de reintentar`, kind: 'alert', route: '/sistema/seguimientos' });
        if (r.messaging?.unreadConversations) tasks.push({ id: -3, title: 'WhatsApp sin leer',
          detail: `${r.messaging.unreadConversations} conversaciones con mensajes nuevos`, kind: 'alert', route: '/sistema/seguimientos' });
        if (r.messaging?.reviewConversations) tasks.push({ id: -4, title: 'Conversaciones derivadas',
          detail: `${r.messaging.reviewConversations} conversaciones necesitan tu revisión`, kind: 'alert', route: '/sistema/seguimientos' });
        alerts.slice(0, 3).forEach((f) =>
          tasks.push({
            id: f.id,
            title: 'Seguimiento con alerta',
            detail: `${f.patientName}: ${f.alertReason || 'Requiere revisión'}`,
            kind: 'alert',
            route: '/sistema/seguimientos',
          }),
        );
        if (r.finance?.receivable)
          tasks.push({
            id: 900001,
            title: 'Cuentas por cobrar',
            detail: `Saldo pendiente ${this.money(r.finance.receivable)}`,
            kind: 'payment',
            route: '/sistema/finanzas',
          });
        visible
          .filter((a) => a.status === 'PENDIENTE_CONFIRMACION')
          .slice(0, 3)
          .forEach((a) =>
            tasks.push({
              id: 100000 + a.id,
              title: 'Cita por confirmar',
              detail: `${a.patientName} · ${this.time(a.start)}`,
              kind: 'approval',
              route: '/sistema/agenda',
            }),
          );
        this.pending.set(tasks);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (requestId !== this.requestId) return;
        this.loading.set(false);
        this.error.set(
          this.errors.toUserMessage(error, 'No se pudo actualizar el resumen del día.'),
        );
      },
    });
  }
  private mapAppointment(a: ApiAppointment): Appointment {
    const status = this.status(a.status);
    return {
      id: a.id,
      patientId: a.patientId,
      time: this.time(a.start),
      patient: a.patientName,
      initials: a.patientName
        .split(/\s+/)
        .slice(0, 2)
        .map((x) => x[0])
        .join('')
        .toUpperCase(),
      service: a.appointmentTypeName,
      reason: a.reason,
      status,
      duration: `${a.durationMinutes} min`,
      phone: a.patientMobile || 'Sin celular',
      tone:
        status === 'En espera' || status === 'En atención'
          ? 'green'
          : status === 'Por confirmar'
            ? 'amber'
            : status === 'Finalizada'
              ? 'purple'
              : 'blue',
    };
  }
  private status(v: string): AppointmentStatus {
    return (
      (
        {
          PENDIENTE_CONFIRMACION: 'Por confirmar',
          CONFIRMADA: 'Confirmada',
          EN_ESPERA: 'En espera',
          EN_ATENCION: 'En atención',
          COMPLETADA: 'Finalizada',
          CANCELADA: 'Cancelada',
          NO_ASISTIO: 'No asistió',
        } as Record<string, AppointmentStatus>
      )[v] || 'Por confirmar'
    );
  }
  private time(v: string): string {
    return new Date(v).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }
  private money(v: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
  private todayRange(): { from: string; to: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
}
