import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppointmentApiService } from '../../../appointments/data-access/appointment-api.service';
import { Appointment } from '../../../appointments/models/appointment.models';
import { PatientApiService } from '../../../patients/data-access/patient-api.service';
import { ClinicalApiService } from '../../data-access/clinical-api.service';
import { ClinicalEncounter } from '../../models/clinical.models';
import { ClinicalWorkspace } from './clinical-workspace';

describe('Atención: continuidad y protección del paciente', () => {
  const encounter = { id: 3, patientId: 8, appointmentId: 42, status: 'BORRADOR', version: 1 } as ClinicalEncounter;
  let page: ClinicalWorkspace;
  let context: Record<string, string>;
  let start: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let finalize: ReturnType<typeof vi.fn>;
  let getAppointment: ReturnType<typeof vi.fn>;
  let listAppointments: ReturnType<typeof vi.fn>;
  let response: Subject<ClinicalEncounter>;

  beforeEach(() => {
    context = {};
    response = new Subject();
    start = vi.fn(() => response.asObservable());
    get = vi.fn(() => of(encounter));
    update = vi.fn((_id, payload) => of({ ...encounter, ...payload, version: 2 }));
    finalize = vi.fn(() => of({ ...encounter, status: 'FINALIZADA', version: 3 }));
    getAppointment = vi.fn(() => of({ id: 42, patientId: 8 } as Appointment));
    listAppointments = vi.fn(() => of([] as Appointment[]));
    TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: { get snapshot() { return { queryParamMap: convertToParamMap(context) }; } } },
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: ClinicalApiService, useValue: { get, start, update, finalize, search: () => of([]) } },
      { provide: AppointmentApiService, useValue: { get: getAppointment, list: listAppointments } },
      { provide: PatientApiService, useValue: { get: () => of({ id: 8, allergies: [] }) } },
    ] });
    page = TestBed.runInInjectionContext(() => new ClinicalWorkspace());
  });
  afterEach(() => vi.restoreAllMocks());

  it('permite retomar una consulta sin cita sin crear otro borrador', () => {
    const walkIn = { ...encounter, appointmentId: undefined };
    page.encounters.set([walkIn]);
    page.startWalkIn({ id: 8 } as never);
    expect(page.walkInEncounters().map((item) => item.id)).toEqual([3]);
    expect(page.current()?.id).toBe(3);
    expect(start).not.toHaveBeenCalled();
  });

  it('retoma la atención exacta al volver desde odontograma, tratamiento o caja', () => {
    context = { encounterId: '3', appointmentId: '42' };
    page.ngOnInit();
    expect(get).toHaveBeenCalledWith(3);
    expect(page.current()?.id).toBe(3);
    expect(start).not.toHaveBeenCalled();
    expect(getAppointment).not.toHaveBeenCalled();
  });
  it('abre la cita enviada por Mi jornada', () => {
    context = { appointmentId: '42' };
    page.ngOnInit();
    expect(getAppointment).toHaveBeenCalledWith(42);
    expect(start).toHaveBeenCalledWith(8, 42);
    response.next(encounter);
    expect(page.current()?.appointmentId).toBe(42);
  });
  it('no pierde un borrador al cancelar el cambio de paciente', () => {
    page.open(encounter);
    page.form.controls.diagnosis.setValue('Texto pendiente');
    page.form.markAsDirty();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    page.open({ ...encounter, id: 4, patientId: 9 });
    page.close();
    page.openAppointment({ id: 43, patientId: 9 } as Appointment);
    expect(page.current()?.id).toBe(3);
    expect(page.form.controls.diagnosis.value).toBe('Texto pendiente');
    expect(start).not.toHaveBeenCalled();
  });
  it('bloquea el cierre mientras el servidor procesa la atención', () => {
    page.open(encounter);
    page.saving.set(true);
    page.close();
    expect(page.current()?.id).toBe(3);
  });
  it('no reinicia la ficha al pulsar otra vez la cita actual', () => {
    page.open(encounter);
    page.form.controls.diagnosis.setValue('Texto pendiente');
    page.form.markAsDirty();
    page.openAppointment({ id: 42, patientId: 8 } as Appointment);
    expect(page.form.controls.diagnosis.value).toBe('Texto pendiente');
    expect(start).not.toHaveBeenCalled();
  });
  it('mantiene disponible la atención cuando falla la carga de las citas', () => {
    listAppointments.mockReturnValue(throwError(() => new Error('Agenda sin respuesta')));
    page.ngOnInit();
    expect(page.loading()).toBe(false);
    expect(page.workdayWarning()).toContain('No se pudieron cargar las citas');
    page.open(encounter);
    expect(page.current()?.id).toBe(3);
  });
  it('guarda la historia antes de abrir el presupuesto', () => {
    page.open(encounter);
    page.form.controls.diagnosis.setValue('Cambio pendiente');
    page.form.markAsDirty();
    page.setSection('plan');
    expect(update).toHaveBeenCalledWith(3, expect.objectContaining({ diagnosis: 'Cambio pendiente', version: 1 }));
    expect(page.section()).toBe('plan');
    expect(page.form.dirty).toBe(false);
  });
  it('no cambia de sección cuando el borrador contiene un valor inválido', () => {
    page.open(encounter);
    page.form.controls.temperature.setValue(70);
    page.form.markAsDirty();
    page.setSection('odontogram');
    expect(update).not.toHaveBeenCalled();
    expect(page.section()).toBe('history');
    expect(page.tab()).toBe('vitals');
    expect(page.error()).toContain('fuera de rango');
  });
  it('conserva la historia en pantalla si falla el guardado al cambiar de sección', () => {
    page.open(encounter);
    page.form.controls.diagnosis.setValue('Cambio pendiente');
    page.form.markAsDirty();
    update.mockReturnValue(throwError(() => new Error('Red sin respuesta')));
    page.setSection('plan');
    expect(page.section()).toBe('history');
    expect(page.form.dirty).toBe(true);
    expect(page.form.controls.diagnosis.value).toBe('Cambio pendiente');
  });
  it('lleva al primer campo pendiente al finalizar', () => {
    page.open(encounter);
    page.tab.set('closure');
    page.finalize();
    expect(page.tab()).toBe('anamnesis');
    expect(page.error()).toContain('Motivo de consulta');
    expect(finalize).not.toHaveBeenCalled();
  });
  it('guarda los cambios y finaliza con la versión actualizada en un solo paso', () => {
    page.open(encounter);
    page.form.patchValue({ consultationReason: 'Dolor', dentalExam: 'Caries', diagnosis: 'Caries dental', workPlan: 'Restauración', patientConsent: true });
    page.form.markAsDirty();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    page.finalize();
    expect(update).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(3, 2);
    expect(page.current()?.status).toBe('FINALIZADA');
  });
});
