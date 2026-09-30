import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, of, Subject } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { PatientApiService } from '../../../patients/data-access/patient-api.service';
import { PageResponse, PatientDetail, PatientSummary } from '../../../patients/models/patient.models';
import { AppointmentApiService } from '../../data-access/appointment-api.service';
import { BookingRequestApiService } from '../../data-access/booking-request-api.service';
import { Appointment, AvailabilitySlot } from '../../models/appointment.models';
import { BookingRequest } from '../../models/booking-request.models';
import { Agenda } from './agenda';

describe('Agenda: apertura de pantalla', () => {
  it('renderiza la agenda y permite abrir nueva cita tras cargar los datos iniciales', async () => {
    await TestBed.configureTestingModule({
      imports: [Agenda],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: PatientApiService, useValue: {} },
        { provide: BookingRequestApiService, useValue: {} },
        { provide: AppointmentApiService, useValue: {
          types: () => of([{ id: 2, code: 'CONSULTA', name: 'Consulta', durationMinutes: 30, color: '#123456' }]),
          professionals: () => of([{ id: 3, fullName: 'Dra. López' }]),
          list: () => of([]),
          availability: () => of([]),
        } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Agenda);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Organiza el día');
    expect(fixture.componentInstance.loading()).toBe(false);

    fixture.componentInstance.openNew();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.appointment-modal')).not.toBeNull();
  });

  it('muestra las citas aunque la configuración no responda y permite reintentar', async () => {
    const types = vi.fn().mockReturnValueOnce(NEVER).mockReturnValueOnce(of([
      { id: 2, code: 'CONSULTA', name: 'Consulta', durationMinutes: 30, color: '#123456' },
    ]));
    await TestBed.configureTestingModule({
      imports: [Agenda],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: PatientApiService, useValue: {} },
        { provide: BookingRequestApiService, useValue: {} },
        { provide: AppointmentApiService, useValue: {
          types,
          professionals: () => of([{ id: 3, fullName: 'Dra. López' }]),
          list: () => of([]),
          availability: () => of([]),
        } },
      ],
    }).compileComponents();

    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(Agenda);
      fixture.detectChanges();
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('Día disponible');
      expect(fixture.componentInstance.canCreate()).toBe(false);

      await vi.advanceTimersByTimeAsync(15001);
      fixture.detectChanges();
      expect(fixture.componentInstance.loadingConfiguration()).toBe(false);
      expect(fixture.componentInstance.configurationError()).toContain('tardó demasiado');

      fixture.componentInstance.loadConfiguration();
      fixture.detectChanges();
      expect(fixture.componentInstance.canCreate()).toBe(true);
      expect(fixture.componentInstance.configurationError()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sale de la carga y permite actualizar si la lista de citas no responde', async () => {
    const list = vi.fn().mockReturnValueOnce(NEVER).mockReturnValueOnce(of([]));
    await TestBed.configureTestingModule({
      imports: [Agenda],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: PatientApiService, useValue: {} },
        { provide: BookingRequestApiService, useValue: {} },
        { provide: AppointmentApiService, useValue: {
          types: () => of([{ id: 2, code: 'CONSULTA', name: 'Consulta', durationMinutes: 30, color: '#123456' }]),
          professionals: () => of([{ id: 3, fullName: 'Dra. López' }]),
          list,
          availability: () => of([]),
        } },
      ],
    }).compileComponents();

    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(Agenda);
      fixture.detectChanges();
      expect(fixture.componentInstance.loading()).toBe(true);

      await vi.advanceTimersByTimeAsync(15001);
      fixture.detectChanges();
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.componentInstance.error()).toContain('tardó demasiado');

      fixture.componentInstance.load();
      fixture.detectChanges();
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.componentInstance.error()).toBe('');
      expect(list).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Agenda: reprogramación', () => {
  const appointment: Appointment = {
    id: 42, patientId: 8, patientHistoryNumber: 'HC-8', patientName: 'Ana Torres',
    professionalId: 3, professionalName: 'Dra. López', appointmentTypeId: 2,
    appointmentTypeName: 'Evaluación', appointmentTypeColor: '#1769e0', durationMinutes: 30,
    start: '2026-09-14T10:00:00', end: '2026-09-14T10:30:00', status: 'CONFIRMADA',
    reason: 'Control', source: 'RECEPCION', confirmationSent: false,
    reminderScheduled: false, reminderSent: false, createdAt: '2026-09-13T10:00:00',
    updatedAt: '2026-09-13T10:00:00', version: 4,
  };
  let agenda: Agenda;
  let update: ReturnType<typeof vi.fn>;
  let availability: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    update = vi.fn(() => of(appointment));
    availability = vi.fn(() => of<AvailabilitySlot[]>([]));
    await TestBed.configureTestingModule({
      imports: [Agenda],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: PatientApiService, useValue: {} },
        { provide: BookingRequestApiService, useValue: {} },
        { provide: AppointmentApiService, useValue: { update, availability, list: () => of([]) } },
      ],
    }).compileComponents();
    agenda = TestBed.createComponent(Agenda).componentInstance;
    agenda.openEdit(appointment);
  });

  it.each([
    ['fecha', { date: '2026-09-15' }],
    ['odontólogo', { professionalId: 9 }],
    ['tipo de cita', { appointmentTypeId: 7 }],
  ] as const)('exige elegir un horario al cambiar %s', (_, changes) => {
    agenda.form.patchValue(changes);
    agenda.loadSlots();
    agenda.save();

    expect(agenda.selectedStart()).toBe('');
    expect(update).not.toHaveBeenCalled();
    expect(agenda.error()).toContain('horario');
  });

  it('permite editar el motivo sin cambiar el horario de la cita actual', () => {
    agenda.form.controls.reason.setValue('Control de seguimiento');
    agenda.save();

    expect(update).toHaveBeenCalledWith(appointment.id, expect.objectContaining({
      start: appointment.start,
      professionalId: appointment.professionalId,
      appointmentTypeId: appointment.appointmentTypeId,
      reason: 'Control de seguimiento',
      version: appointment.version,
    }));
  });

  it('envía el horario elegido para la nueva fecha', () => {
    const slot: AvailabilitySlot = {
      start: '2026-09-15T11:00:00', end: '2026-09-15T11:30:00', available: true,
    };
    availability.mockReturnValue(of([slot]));
    agenda.form.controls.date.setValue('2026-09-15');
    agenda.loadSlots();
    agenda.chooseSlot(slot);
    agenda.save();

    expect(availability).toHaveBeenLastCalledWith(3, '2026-09-15', 2);
    expect(update).toHaveBeenCalledWith(appointment.id, expect.objectContaining({
      start: slot.start, patientId: appointment.patientId, version: appointment.version,
    }));
  });
});

describe('Agenda: siguiente control desde la atención', () => {
  it('precarga paciente, profesional y fecha sin crear la cita hasta confirmarla', async () => {
    const create = vi.fn();
    const patient = { id: 8, active: true, firstNames: 'Ana', paternalSurname: 'Torres',
      mobile: '999999999', allergies: [], whatsappConsent: true } as unknown as PatientDetail;
    await TestBed.configureTestingModule({ imports: [Agenda], providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({
        patientId: '8', professionalId: '3', date: '2030-10-20', control: '1',
      }) } } },
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: PatientApiService, useValue: { get: () => of(patient) } },
      { provide: BookingRequestApiService, useValue: {} },
      { provide: AppointmentApiService, useValue: {
        create, types: () => of([{ id: 2 }]), professionals: () => of([{ id: 3 }]),
        list: () => of([]), availability: () => of([]),
      } },
    ] }).compileComponents();
    const page = TestBed.createComponent(Agenda).componentInstance;
    page.ngOnInit();
    expect(page.modalOpen()).toBe(true);
    expect(page.selectedPatient()?.id).toBe(8);
    expect(page.selectedPatient()?.fullName).toBe('Ana Torres');
    expect(page.form.controls.professionalId.value).toBe(3);
    expect(page.form.controls.date.value).toBe('2030-10-20');
    expect(page.form.controls.reason.value).toBe('Control');
    expect(page.selectedStart()).toBe('');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('Agenda: búsqueda automática desde solicitudes', () => {
  const request: BookingRequest = {
    id: 12, fullName: 'Ana Torres', mobile: '999999999', service: 'Evaluación',
    preferredShift: 'INDIFERENTE', status: 'PENDIENTE',
    createdAt: '2026-09-14T10:00:00', updatedAt: '2026-09-14T10:00:00', version: 0,
  };
  const patient: PatientSummary = {
    id: 8, historyNumber: 'HC-8', documentType: 'SIN_DOCUMENTO', fullName: 'Ana Torres',
    birthDate: '1990-01-01', age: 36, sex: 'FEMENINO', mobile: '999999999',
    whatsappConsent: false, activeAllergies: 0, active: true, createdAt: '', version: 0,
  };
  const pageOf = (item: PatientSummary): PageResponse<PatientSummary> => ({
    content: [item], page: 0, size: 8, totalElements: 1, totalPages: 1, first: true, last: true,
  });
  let agenda: Agenda;
  let firstResponse: Subject<PageResponse<PatientSummary>>;
  let secondResponse: Subject<PageResponse<PatientSummary>>;

  beforeEach(async () => {
    firstResponse = new Subject();
    secondResponse = new Subject();
    const search = vi.fn()
      .mockReturnValueOnce(firstResponse.asObservable())
      .mockReturnValueOnce(secondResponse.asObservable());
    await TestBed.configureTestingModule({
      imports: [Agenda],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: PatientApiService, useValue: { search } },
        { provide: BookingRequestApiService, useValue: {} },
        { provide: AppointmentApiService, useValue: { availability: () => of([]) } },
      ],
    }).compileComponents();
    agenda = TestBed.createComponent(Agenda).componentInstance;
  });

  it('ignora la respuesta de una solicitud cerrada al abrir una cita nueva', () => {
    agenda.openNew(request);
    agenda.closeModal();
    agenda.openNew();
    firstResponse.next(pageOf(patient));

    expect(agenda.selectedPatient()).toBeNull();
    expect(agenda.form.controls.patientSearch.value).toBe('');
    expect(agenda.patientResults()).toEqual([]);
  });

  it('no sustituye el paciente de la solicitud actual con una respuesta anterior', () => {
    const other = { ...patient, id: 9, fullName: 'Luis Pérez', mobile: '988888888' };
    agenda.openNew(request);
    agenda.openNew({ ...request, id: 13, fullName: other.fullName, mobile: other.mobile });
    secondResponse.next(pageOf(other));
    firstResponse.next(pageOf(patient));

    expect(agenda.selectedPatient()?.id).toBe(other.id);
    expect(agenda.form.controls.patientSearch.value).toBe(other.fullName);
  });

  it('conserva una selección manual si la búsqueda automática falla después', () => {
    const other = { ...patient, id: 9, fullName: 'Luis Pérez' };
    agenda.openNew(request);
    agenda.selectPatient(other);
    firstResponse.error(new Error('Fallo de red simulado'));

    expect(agenda.selectedPatient()?.id).toBe(other.id);
    expect(agenda.form.controls.patientSearch.value).toBe(other.fullName);
    expect(agenda.searchingPatients()).toBe(false);
  });
});
