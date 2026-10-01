import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideAlertTriangle,
  LucideArrowLeft,
  LucideArrowRight,
  LucideCalendarDays,
  LucideCheck,
  LucideChevronDown,
  LucideClock3,
  LucideEdit3,
  LucideLoaderCircle,
  LucideMessageCircle,
  LucidePhone,
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideSlidersHorizontal,
  LucideUserRound,
  LucideX,
} from '@lucide/angular';
import { forkJoin, Observable, TimeoutError, timeout } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { ModalDirective } from '../../../../shared/ui/modal/modal.directive';
import { PatientApiService } from '../../../patients/data-access/patient-api.service';
import { PatientSummary } from '../../../patients/models/patient.models';
import { AppointmentApiService } from '../../data-access/appointment-api.service';
import { BookingRequestApiService } from '../../data-access/booking-request-api.service';
import {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  AvailabilitySlot,
  Professional,
} from '../../models/appointment.models';
import { BookingRequest } from '../../models/booking-request.models';

@Component({
  selector: 'app-agenda',
  imports: [
    ModalDirective,
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    LucideAlertTriangle,
    LucideArrowLeft,
    LucideArrowRight,
    LucideCalendarDays,
    LucideCheck,
    LucideChevronDown,
    LucideClock3,
    LucideEdit3,
    LucideLoaderCircle,
    LucideMessageCircle,
    LucidePhone,
    LucidePlus,
    LucideRefreshCw,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideUserRound,
    LucideX,
  ],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Agenda implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AppointmentApiService);
  private readonly bookingApi = inject(BookingRequestApiService);
  private readonly patientsApi = inject(PatientApiService);
  private readonly auth = inject(AuthService);
  private readonly errors = inject(SupabaseErrorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly appointments = signal<Appointment[]>([]);
  readonly types = signal<AppointmentType[]>([]);
  readonly professionals = signal<Professional[]>([]);
  readonly loading = signal(true);
  readonly loadingConfiguration = signal(true);
  readonly configurationError = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selectedDate = signal(this.dateKey(new Date()));
  readonly professionalFilter = signal<number | undefined>(undefined);
  readonly statusFilter = signal<AppointmentStatus | ''>('');
  readonly modalOpen = signal(false);
  readonly editing = signal<Appointment | null>(null);
  readonly patientResults = signal<PatientSummary[]>([]);
  readonly selectedPatient = signal<PatientSummary | null>(null);
  readonly searchingPatients = signal(false);
  readonly availability = signal<AvailabilitySlot[]>([]);
  readonly loadingSlots = signal(false);
  readonly selectedStart = signal('');
  readonly bookingRequest = signal<BookingRequest | null>(null);
  readonly canWrite = signal(this.auth.hasPermission('CITA_ESCRIBIR'));
  readonly canCreate = computed(() =>
    this.canWrite() && !this.loadingConfiguration() &&
    this.types().length > 0 && this.professionals().length > 0,
  );
  private patientSearchTimer?: ReturnType<typeof setTimeout>;
  private agendaRequestId = 0;
  private patientSearchRequestId = 0;
  private slotsRequestId = 0;

  readonly weekDays = computed(() => {
    const selected = this.parseDate(this.selectedDate());
    const monday = new Date(selected);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    return Array.from({ length: 7 }, (_, index) => {
      const value = new Date(monday);
      value.setDate(monday.getDate() + index);
      return value;
    });
  });
  readonly selectedAppointments = computed(() =>
    this.appointments()
      .filter((item) => this.dateKey(new Date(item.start)) === this.selectedDate())
      .sort((a, b) => a.start.localeCompare(b.start)),
  );
  readonly dayCounts = computed(
    () =>
      new Map(
        this.weekDays().map((day) => [
          this.dateKey(day),
          this.appointments().filter(
            (item) => this.dateKey(new Date(item.start)) === this.dateKey(day),
          ).length,
        ]),
      ),
  );
  readonly dayLabel = computed(() => this.parseDate(this.selectedDate()));
  readonly summary = computed(() => ({
    total: this.selectedAppointments().length,
    confirmed: this.selectedAppointments().filter((item) => item.status === 'CONFIRMADA').length,
    waiting: this.selectedAppointments().filter(
      (item) => item.status === 'EN_ESPERA' || item.status === 'EN_ATENCION',
    ).length,
    pending: this.selectedAppointments().filter((item) => item.status === 'PENDIENTE_CONFIRMACION')
      .length,
  }));

  readonly form = this.fb.group({
    patientSearch: [''],
    professionalId: this.fb.control<number | null>(null, Validators.required),
    appointmentTypeId: this.fb.control<number | null>(null, Validators.required),
    date: [this.selectedDate(), Validators.required],
    reason: ['', [Validators.required, Validators.maxLength(500)]],
    notes: ['', Validators.maxLength(1000)],
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => clearTimeout(this.patientSearchTimer));
    this.load();
    this.loadConfiguration();
  }

  loadConfiguration(): void {
    this.loadingConfiguration.set(true);
    this.configurationError.set('');
    forkJoin({ types: this.api.types(), professionals: this.api.professionals() })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ types, professionals }) => {
        this.types.set(types);
        this.professionals.set(professionals);
        this.loadingConfiguration.set(false);
        if (!types.length || !professionals.length) {
          this.configurationError.set(
            !types.length && !professionals.length
              ? 'No hay tipos de cita ni odontólogos disponibles para programar.'
              : !types.length
                ? 'No hay tipos de cita disponibles para programar.'
                : 'No hay odontólogos disponibles para programar.',
          );
          return;
        }
        this.loadBookingRequest();
        if (!this.route.snapshot.queryParamMap.has('solicitud')) this.loadPatientContext();
      },
      error: (error: unknown) => {
        this.loadingConfiguration.set(false);
        this.configurationError.set(
          error instanceof TimeoutError
            ? 'La configuración de la agenda tardó demasiado en responder.'
            : this.errors.toUserMessage(error, 'No se pudo cargar la configuración de la agenda.'),
        );
      },
    });
  }

  load(): void {
    const requestId = ++this.agendaRequestId;
    const fromDate = this.weekDays()[0];
    const toDate = new Date(this.weekDays()[6]);
    toDate.setDate(toDate.getDate() + 1);
    this.loading.set(true);
    this.error.set('');
    this.api
      .list(
        fromDate.toISOString(),
        toDate.toISOString(),
        this.professionalFilter(),
        this.statusFilter(),
      )
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          if (requestId !== this.agendaRequestId) return;
          this.appointments.set(items);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.agendaRequestId) return;
          this.loading.set(false);
          this.error.set(error instanceof TimeoutError
            ? 'La consulta de citas tardó demasiado. Pulsa Actualizar agenda para reintentar.'
            : this.errors.toUserMessage(error, 'No se pudieron cargar las citas de la semana.'));
        },
      });
  }

  selectDay(date: Date): void {
    this.selectedDate.set(this.dateKey(date));
  }
  moveWeek(delta: number): void {
    const date = this.parseDate(this.selectedDate());
    date.setDate(date.getDate() + delta * 7);
    this.selectedDate.set(this.dateKey(date));
    this.load();
  }
  today(): void {
    this.selectedDate.set(this.dateKey(new Date()));
    this.load();
  }
  applyFilters(professional: string, status: string): void {
    this.professionalFilter.set(professional ? Number(professional) : undefined);
    this.statusFilter.set(status as AppointmentStatus | '');
    this.load();
  }

  openNew(request?: BookingRequest): void {
    this.invalidatePatientSearch();
    const preferredDate =
      request?.preferredDate && request.preferredDate >= this.dateKey(new Date())
        ? request.preferredDate
        : this.selectedDate();
    if (request) this.selectedDate.set(preferredDate);
    this.bookingRequest.set(request ?? null);
    this.editing.set(null);
    this.selectedPatient.set(null);
    this.patientResults.set([]);
    this.selectedStart.set('');
    this.availability.set([]);
    this.form.reset({
      patientSearch: request?.fullName ?? '',
      professionalId: this.professionals()[0]?.id ?? null,
      appointmentTypeId: this.types()[0]?.id ?? null,
      date: preferredDate,
      reason: request?.service ?? '',
      notes: request
        ? [
            request.message,
            `Solicitud #${request.id} · turno ${this.label(request.preferredShift)}`,
          ]
            .filter(Boolean)
            .join('\n')
        : '',
    });
    this.modalOpen.set(true);
    this.clearMessages();
    this.loadSlots();
    if (request) this.findPatientForRequest(request);
  }

  openEdit(item: Appointment): void {
    this.invalidatePatientSearch();
    this.bookingRequest.set(null);
    const patient: PatientSummary = {
      id: item.patientId,
      historyNumber: item.patientHistoryNumber,
      documentType: 'SIN_DOCUMENTO',
      fullName: item.patientName,
      birthDate: '',
      age: 0,
      sex: 'NO_ESPECIFICA',
      mobile: item.patientMobile,
      whatsappConsent: false,
      activeAllergies: 0,
      active: true,
      createdAt: '',
      version: 0,
    };
    this.editing.set(item);
    this.selectedPatient.set(patient);
    this.selectedStart.set(item.start);
    this.form.reset({
      patientSearch: item.patientName,
      professionalId: item.professionalId,
      appointmentTypeId: item.appointmentTypeId,
      date: this.dateKey(new Date(item.start)),
      reason: item.reason,
      notes: item.notes ?? '',
    });
    this.modalOpen.set(true);
    this.clearMessages();
    this.loadSlots();
  }

  closeModal(): void {
    if (this.saving()) return;
    this.invalidatePatientSearch();
    this.slotsRequestId++;
    this.loadingSlots.set(false);
    this.modalOpen.set(false);
    this.bookingRequest.set(null);
    this.clearBookingQuery();
  }

  searchPatients(query: string): void {
    this.invalidatePatientSearch();
    const requestId = this.patientSearchRequestId;
    this.form.controls.patientSearch.setValue(query);
    this.selectedPatient.set(null);
    this.selectedStart.set('');
    if (query.trim().length < 2) {
      this.patientResults.set([]);
      this.searchingPatients.set(false);
      return;
    }
    this.patientSearchTimer = setTimeout(() => {
      this.searchingPatients.set(true);
      this.patientsApi
        .search({
          q: query.trim(),
          active: true,
          page: 0,
          size: 8,
          sort: 'fullName',
          direction: 'asc',
        })
        .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            if (requestId !== this.patientSearchRequestId) return;
            this.patientResults.set(result.content);
            this.searchingPatients.set(false);
          },
          error: () => {
            if (requestId !== this.patientSearchRequestId) return;
            this.patientResults.set([]);
            this.searchingPatients.set(false);
            this.error.set('No se pudo buscar pacientes. Inténtalo nuevamente.');
          },
        });
    }, 250);
  }

  selectPatient(patient: PatientSummary): void {
    this.invalidatePatientSearch();
    this.selectedPatient.set(patient);
    this.patientResults.set([]);
    this.form.controls.patientSearch.setValue(patient.fullName);
  }

  loadSlots(): void {
    const requestId = ++this.slotsRequestId;
    const professionalId = this.form.controls.professionalId.value;
    const typeId = this.form.controls.appointmentTypeId.value;
    const date = this.form.controls.date.value;
    const editing = this.editing();
    const keepCurrentSlot = editing &&
      professionalId === editing.professionalId &&
      typeId === editing.appointmentTypeId &&
      date === this.dateKey(new Date(editing.start));
    this.selectedStart.set(keepCurrentSlot ? editing.start : '');
    this.availability.set([]);
    if (!professionalId || !typeId || !date) {
      this.loadingSlots.set(false);
      return;
    }
    this.loadingSlots.set(true);
    this.api.availability(professionalId, date, typeId)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (slots) => {
        if (requestId !== this.slotsRequestId) return;
        this.availability.set(slots);
        this.loadingSlots.set(false);
      },
      error: (error: unknown) => {
        if (requestId !== this.slotsRequestId) return;
        this.loadingSlots.set(false);
        this.error.set(error instanceof TimeoutError
          ? 'La consulta de horarios tardó demasiado. Cambia la fecha para reintentar.'
          : this.errors.toUserMessage(error, 'No se pudo consultar la disponibilidad.'));
      },
    });
  }

  chooseSlot(slot: AvailabilitySlot): void {
    if (slot.available) this.selectedStart.set(slot.start);
  }

  save(): void {
    if (this.saving()) return;
    this.clearMessages();
    const patient = this.selectedPatient();
    const bookingRequest = this.bookingRequest();
    if (this.form.invalid || (!patient && !bookingRequest) || !this.selectedStart()) {
      this.form.markAllAsTouched();
      this.error.set(
        bookingRequest
          ? 'Selecciona odontólogo, tipo, horario y motivo para agendar la solicitud.'
          : 'Selecciona paciente, odontólogo, tipo, horario y motivo.',
      );
      return;
    }
    const value = this.form.getRawValue();
    const editing = this.editing();
    const payload = {
      professionalId: value.professionalId!,
      appointmentTypeId: value.appointmentTypeId!,
      start: this.selectedStart(),
      reason: value.reason.trim(),
      notes: value.notes.trim() || null,
      source: bookingRequest ? ('WEB' as const) : ('RECEPCION' as const),
    };
    this.saving.set(true);
    let request: Observable<Appointment>;
    if (editing) {
      request = this.api.update(editing.id, {
        ...payload,
        patientId: patient!.id,
        version: editing.version,
      });
    } else if (bookingRequest) {
      request = this.api.createFromRequest(bookingRequest.id, bookingRequest.version, {
        ...payload,
        patientId: patient?.id ?? null,
      });
    } else {
      request = this.api.create({ ...payload, patientId: patient!.id });
    }
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.success.set(
          editing
            ? 'Cita reprogramada correctamente.'
            : bookingRequest
              ? 'Cita creada y solicitud vinculada correctamente.'
              : 'Cita creada correctamente.',
        );
        this.bookingRequest.set(null);
        this.clearBookingQuery();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo guardar la cita.'));
      },
    });
  }

  advance(item: Appointment): void {
    if (item.status === 'EN_ESPERA' || item.status === 'EN_ATENCION') {
      void this.router.navigate(['/sistema/atencion'], { queryParams: { appointmentId: item.id } });
      return;
    }
    const next = this.nextStatus(item.status);
    if (!next) return;
    this.updateStatus(item, next.status, undefined, next.success);
  }

  cancel(item: Appointment): void {
    const reason = window.prompt('Indica el motivo de cancelación:');
    if (!reason?.trim()) return;
    this.updateStatus(item, 'CANCELADA', reason.trim(), 'Cita cancelada.');
  }

  noShow(item: Appointment): void {
    if (!window.confirm(`¿Registrar que ${item.patientName} no asistió?`)) return;
    this.updateStatus(item, 'NO_ASISTIO', 'Paciente no asistió', 'Inasistencia registrada.');
  }

  nextActionLabel(status: AppointmentStatus): string {
    return (
      (
        {
          PENDIENTE_CONFIRMACION: 'Confirmar',
          CONFIRMADA: 'Registrar llegada',
          EN_ESPERA: 'Iniciar atención',
          EN_ATENCION: 'Abrir historia',
        } as Partial<Record<AppointmentStatus, string>>
      )[status] ?? ''
    );
  }

  statusLabel(status: AppointmentStatus): string {
    return status.replaceAll('_', ' ').toLowerCase();
  }
  label(value: string): string {
    return value.replaceAll('_', ' ').toLowerCase();
  }
  isToday(date: Date): boolean {
    return this.dateKey(date) === this.dateKey(new Date());
  }
  trackAppointment(_: number, item: Appointment): number {
    return item.id;
  }

  private updateStatus(
    item: Appointment,
    status: AppointmentStatus,
    reason: string | undefined,
    success: string,
  ): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.clearMessages();
    this.api.changeStatus(item.id, status, item.version, reason)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(success);
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo actualizar la cita.'));
      },
    });
  }

  private nextStatus(
    status: AppointmentStatus,
  ): { status: AppointmentStatus; success: string } | null {
    return (
      (
        {
          PENDIENTE_CONFIRMACION: { status: 'CONFIRMADA', success: 'Cita confirmada.' },
          CONFIRMADA: { status: 'EN_ESPERA', success: 'Llegada registrada.' },
          EN_ESPERA: { status: 'EN_ATENCION', success: 'Atención iniciada.' },
          EN_ATENCION: { status: 'COMPLETADA', success: 'Cita completada.' },
        } as Partial<Record<AppointmentStatus, { status: AppointmentStatus; success: string }>>
      )[status] ?? null
    );
  }
  private clearMessages(): void {
    this.error.set('');
    this.success.set('');
  }
  private loadBookingRequest(): void {
    const requestId = Number(this.route.snapshot.queryParamMap.get('solicitud'));
    if (!requestId || !this.canWrite()) return;
    this.bookingApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        const request = items.find((item) => item.id === requestId);
        if (!request) {
          this.error.set('No se encontró la solicitud seleccionada.');
          this.clearBookingQuery();
          return;
        }
        if (request.status === 'AGENDADO' || request.status === 'DESCARTADO') {
          this.error.set('La solicitud seleccionada ya fue finalizada.');
          this.clearBookingQuery();
          return;
        }
        this.openNew(request);
      },
      error: () => {
        this.error.set('No se pudo cargar la solicitud para agendarla.');
      },
    });
  }
  private loadPatientContext(): void {
    const query = this.route.snapshot.queryParamMap;
    const patientId = Number(query.get('patientId'));
    if (!this.canWrite() || !Number.isSafeInteger(patientId) || patientId <= 0) return;
    const requestId = ++this.patientSearchRequestId;
    this.patientsApi.get(patientId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (patient) => {
        if (requestId !== this.patientSearchRequestId) return;
        if (!patient.active) {
          this.error.set('El paciente está inactivo. Revisa su ficha antes de agendar.');
          return;
        }
        this.openNew();
        this.selectPatient({
          ...patient,
          fullName: [patient.firstNames, patient.paternalSurname, patient.maternalSurname].filter(Boolean).join(' '),
          activeAllergies: patient.allergies.filter((allergy) => allergy.status === 'ACTIVA').length,
        });
        const professionalId = Number(query.get('professionalId'));
        if (this.professionals().some((professional) => professional.id === professionalId))
          this.form.controls.professionalId.setValue(professionalId);
        const date = query.get('date') ?? '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && this.dateKey(this.parseDate(date)) === date
          && date >= this.dateKey(new Date())) this.form.controls.date.setValue(date);
        if (query.get('control') === '1') this.form.controls.reason.setValue('Control');
        this.loadSlots();
      },
      error: (error: unknown) => {
        if (requestId === this.patientSearchRequestId)
          this.error.set(this.errors.toUserMessage(error, 'No se pudo precargar al paciente.'));
      },
    });
  }
  private findPatientForRequest(request: BookingRequest): void {
    this.invalidatePatientSearch();
    const requestId = this.patientSearchRequestId;
    const query = request.mobile || request.documentNumber || request.fullName;
    this.searchingPatients.set(true);
    this.patientsApi
      .search({ q: query, active: true, page: 0, size: 8, sort: 'fullName', direction: 'asc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.patientSearchRequestId) return;
          this.searchingPatients.set(false);
          const mobile = this.comparablePhone(request.mobile);
          const exact = result.content.find(
            (patient) => this.comparablePhone(patient.mobile) === mobile,
          );
          if (exact || result.content.length === 1) {
            this.selectPatient(exact ?? result.content[0]);
          } else {
            this.patientResults.set(result.content);
            if (!result.content.length) {
              this.form.controls.patientSearch.setValue(request.fullName);
            }
          }
        },
        error: () => {
          if (requestId !== this.patientSearchRequestId) return;
          this.searchingPatients.set(false);
          this.form.controls.patientSearch.setValue(request.fullName);
        },
      });
  }
  private invalidatePatientSearch(): void {
    clearTimeout(this.patientSearchTimer);
    this.patientSearchRequestId++;
    this.searchingPatients.set(false);
    this.patientResults.set([]);
  }
  private clearBookingQuery(): void {
    if (!['solicitud', 'patientId', 'professionalId', 'date', 'control']
      .some((key) => this.route.snapshot.queryParamMap.has(key))) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { solicitud: null, patientId: null, professionalId: null, date: null, control: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  private comparablePhone(value?: string): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    return /^9\d{8}$/.test(digits) ? `51${digits}` : digits;
  }
  dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  private parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}
