import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideActivity,
  LucideAlertTriangle,
  LucideArrowLeft,
  LucideCalendarDays,
  LucideCheck,
  LucideClipboardCheck,
  LucideFileHeart,
  LucideHeartPulse,
  LucideHistory,
  LucideLoaderCircle,
  LucideSave,
  LucideSearch,
  LucideShieldAlert,
  LucideStethoscope,
} from '@lucide/angular';
import { catchError, forkJoin, of, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  canLeaveEditor,
  protectBeforeUnload,
} from '../../../../core/navigation/pending-changes.guard';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { AppointmentApiService } from '../../../appointments/data-access/appointment-api.service';
import { Appointment } from '../../../appointments/models/appointment.models';
import { PatientApiService } from '../../../patients/data-access/patient-api.service';
import { PatientDetail, PatientSummary } from '../../../patients/models/patient.models';
import { ClinicalApiService } from '../../data-access/clinical-api.service';
import { ClinicalEncounter, ClinicalPayload } from '../../models/clinical.models';
import { TreatmentPlanPage } from '../../../treatments/pages/treatment-plan/treatment-plan';
import { OdontogramEditor } from '../../../odontogram/pages/odontogram-editor/odontogram-editor';

type ClinicalTab = 'anamnesis' | 'vitals' | 'exam' | 'assessment' | 'closure';
type AttentionSection = 'history' | 'odontogram' | 'plan';
const CLINICAL_TABS: ClinicalTab[] = ['anamnesis', 'vitals', 'exam', 'assessment', 'closure'];

@Component({
  selector: 'app-clinical-workspace',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  imports: [
    ReactiveFormsModule,
    TreatmentPlanPage,
    OdontogramEditor,
    RouterLink,
    DatePipe,
    LucideActivity,
    LucideAlertTriangle,
    LucideArrowLeft,
    LucideCalendarDays,
    LucideCheck,
    LucideClipboardCheck,
    LucideFileHeart,
    LucideHeartPulse,
    LucideHistory,
    LucideLoaderCircle,
    LucideSave,
    LucideSearch,
    LucideShieldAlert,
    LucideStethoscope,
  ],
  templateUrl: './clinical-workspace.html',
  styleUrl: './clinical-workspace.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicalWorkspace implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly clinicalApi = inject(ClinicalApiService);
  private readonly appointmentApi = inject(AppointmentApiService);
  private readonly patientApi = inject(PatientApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);

  readonly appointments = signal<Appointment[]>([]);
  readonly encounters = signal<ClinicalEncounter[]>([]);
  readonly current = signal<ClinicalEncounter | null>(null);
  readonly patient = signal<PatientDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly tab = signal<ClinicalTab>('anamnesis');
  readonly tabNumber = computed(() => CLINICAL_TABS.indexOf(this.tab()) + 1);
  readonly section = signal<AttentionSection>('history');
  readonly planEditor = viewChild(TreatmentPlanPage);
  readonly odontogramEditor = viewChild(OdontogramEditor);
  readonly searchResults = signal<PatientSummary[]>([]);
  readonly searching = signal(false);
  readonly searchMessage = signal('');
  readonly walkInEncounters = computed(() =>
    this.encounters().filter((item) => !item.appointmentId && item.status !== 'ANULADA'),
  );
  readonly workdayWarning = signal('');
  readonly canWrite = signal(this.auth.hasPermission('CLINICA_ESCRIBIR'));
  readonly canApprove = signal(this.auth.hasPermission('CLINICA_APROBAR'));
  readonly canSchedule = this.auth.hasPermission('CITA_ESCRIBIR');
  readonly canTreatment = this.auth.hasPermission('TRATAMIENTO_LEER');
  private searchTimer?: ReturnType<typeof setTimeout>;
  private workdayRequestId = 0;
  private searchRequestId = 0;
  private patientRequestId = 0;

  readonly activeAllergies = computed(
    () => this.patient()?.allergies.filter((item) => item.status === 'ACTIVA') ?? [],
  );
  readonly relevantHistories = computed(
    () => this.patient()?.histories.filter((item) =>
      ['MEDICO', 'QUIRURGICO'].includes(item.type) && item.status !== 'RESUELTO',
    ) ?? [],
  );
  readonly currentMedications = computed(
    () => this.patient()?.medications.filter((item) => item.current) ?? [],
  );
  readonly worklist = computed(() =>
    this.appointments().filter(
      (item) => !['CANCELADA', 'NO_ASISTIO', 'COMPLETADA'].includes(item.status),
    ),
  );
  completion(): number {
    return Math.round(((5 - this.missingRequirements().length) / 5) * 100);
  }
  missingRequirements(): { label: string; tab: ClinicalTab }[] {
    const value = this.form.getRawValue();
    const missing: { label: string; tab: ClinicalTab }[] = [];
    if (!value.consultationReason?.trim()) missing.push({ label: 'Motivo de consulta', tab: 'anamnesis' });
    if (!value.dentalExam?.trim()) missing.push({ label: 'Examen odontológico', tab: 'exam' });
    if (!value.diagnosis?.trim()) missing.push({ label: 'Diagnóstico', tab: 'assessment' });
    if (!value.workPlan?.trim()) missing.push({ label: 'Plan de trabajo', tab: 'assessment' });
    if (!value.patientConsent) missing.push({ label: 'Conformidad del paciente', tab: 'closure' });
    return missing;
  }

  readonly form = this.fb.group({
    consultationReason: ['', Validators.maxLength(1000)],
    illnessDuration: ['', Validators.maxLength(250)],
    signsSymptoms: ['', Validators.maxLength(1500)],
    chronologicalStory: ['', Validators.maxLength(4000)],
    systolicPressure: this.fb.control<number | null>(null, [
      Validators.min(40),
      Validators.max(300),
    ]),
    diastolicPressure: this.fb.control<number | null>(null, [
      Validators.min(20),
      Validators.max(200),
    ]),
    pulse: this.fb.control<number | null>(null, [Validators.min(20), Validators.max(250)]),
    temperature: this.fb.control<number | null>(null, [Validators.min(30), Validators.max(45)]),
    respiratoryRate: this.fb.control<number | null>(null, [Validators.min(5), Validators.max(80)]),
    weightKg: this.fb.control<number | null>(null, [Validators.min(0.5), Validators.max(500)]),
    heightCm: this.fb.control<number | null>(null, [Validators.min(20), Validators.max(250)]),
    generalExam: ['', Validators.maxLength(4000)],
    dentalExam: ['', Validators.maxLength(4000)],
    diagnosis: ['', Validators.maxLength(4000)],
    workPlan: ['', Validators.maxLength(4000)],
    prognosis: ['', Validators.maxLength(500)],
    evolution: ['', Validators.maxLength(4000)],
    instructions: ['', Validators.maxLength(4000)],
    nextControlDate: [''],
    discharged: [false],
    dischargeObservation: ['', Validators.maxLength(1000)],
    patientConsent: [false],
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.searchTimer);
      this.workdayRequestId++;
      this.searchRequestId++;
      this.patientRequestId++;
    });
    this.loadWorkday();
    const encounterId = Number(this.route.snapshot.queryParamMap.get('encounterId'));
    if (Number.isSafeInteger(encounterId) && encounterId > 0) {
      this.clinicalApi
        .get(encounterId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (encounter) => this.open(encounter),
          error: (error: unknown) =>
            this.error.set(this.errors.toUserMessage(error, 'No se pudo recuperar la atención.')),
        });
      return;
    }
    const appointmentId = Number(this.route.snapshot.queryParamMap.get('appointmentId'));
    if (appointmentId > 0) {
      this.appointmentApi
        .get(appointmentId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (appointment) => this.openAppointment(appointment),
          error: (error: unknown) =>
            this.error.set(
              this.errors.toUserMessage(error, 'No se pudo abrir la cita seleccionada.'),
            ),
        });
    }
  }
  hasEncounter(appointmentId: number): boolean {
    return this.encounters().some((item) => item.appointmentId === appointmentId);
  }

  loadWorkday(): void {
    const requestId = ++this.workdayRequestId;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    this.loading.set(true);
    this.workdayWarning.set('');
    forkJoin({
      appointments: this.appointmentApi.list(start.toISOString(), end.toISOString()).pipe(
        catchError(() => {
          this.workdayWarning.set('No se pudieron cargar las citas. Actualiza para reintentar.');
          return of([] as Appointment[]);
        }),
      ),
      encounters: this.clinicalApi.search(start.toISOString(), end.toISOString()).pipe(
        catchError(() => {
          this.workdayWarning.set(
            'No se pudo consultar la jornada clínica. Actualiza para reintentar.',
          );
          return of([] as ClinicalEncounter[]);
        }),
      ),
    })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ appointments, encounters }) => {
          if (requestId !== this.workdayRequestId) return;
          this.appointments.set(appointments);
          this.encounters.set(encounters);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.workdayRequestId) return;
          this.loading.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo cargar la jornada clínica.'));
        },
      });
  }

  openAppointment(item: Appointment): void {
    if (this.current()?.appointmentId === item.id) return;
    const existing = this.encounters().find((encounter) => encounter.appointmentId === item.id);
    if (existing) {
      this.open(existing);
      return;
    }
    if (!this.canWrite()) {
      this.error.set('No tienes permiso para iniciar una atención.');
      return;
    }
    this.start(item.patientId, item.id);
  }

  searchPatient(query: string): void {
    const requestId = ++this.searchRequestId;
    clearTimeout(this.searchTimer);
    this.searchResults.set([]);
    this.searching.set(false);
    this.searchMessage.set('');
    if (query.trim().length < 2) return;
    this.searchTimer = setTimeout(() => {
      this.searching.set(true);
      this.patientApi
        .search({ q: query.trim(), active: true, page: 0, size: 6 })
        .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            if (requestId !== this.searchRequestId) return;
            this.searchResults.set(result.content);
            if (!result.content.length) this.searchMessage.set('No hay pacientes que coincidan con la búsqueda.');
            this.searching.set(false);
          },
          error: () => {
            if (requestId !== this.searchRequestId) return;
            this.searching.set(false);
            this.searchResults.set([]);
            this.searchMessage.set('No se pudo buscar al paciente. Vuelve a escribir para reintentar.');
          },
        });
    }, 250);
  }

  startWalkIn(patient: PatientSummary): void {
    this.searchResults.set([]);
    const draft = this.encounters().find((item) =>
      item.patientId === patient.id && !item.appointmentId && item.status === 'BORRADOR',
    );
    if (draft) {
      this.open(draft);
      return;
    }
    this.start(patient.id);
  }

  open(encounter: ClinicalEncounter): void {
    if (this.current()?.id === encounter.id || !canLeaveEditor(this)) return;
    this.displayEncounter(encounter);
  }

  private displayEncounter(encounter: ClinicalEncounter): void {
    const requestId = ++this.patientRequestId;
    this.current.set(encounter);
    this.section.set('history');
    this.tab.set('anamnesis');
    this.error.set('');
    this.success.set('');
    this.patient.set(null);
    this.patch(encounter);
    this.patientApi
      .get(encounter.patientId)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (patient) => {
          if (requestId === this.patientRequestId) this.patient.set(patient);
        },
        error: (error: unknown) => {
          if (requestId === this.patientRequestId)
            this.error.set(
              this.errors.toUserMessage(error, 'No se pudo cargar la ficha del paciente.'),
            );
        },
      });
  }

  close(): void {
    if (!canLeaveEditor(this)) return;
    this.patientRequestId++;
    this.current.set(null);
    this.section.set('history');
    this.patient.set(null);
    this.form.reset();
    this.clearMessages();
  }
  backFromRecord(): void {
    if (this.section() !== 'history') this.setSection('history');
    else this.close();
  }
  setTab(tab: ClinicalTab): void {
    if (this.error().startsWith('Para finalizar faltan:')) this.error.set('');
    this.tab.set(tab);
  }
  moveTab(direction: -1 | 1): void {
    const next = CLINICAL_TABS[this.tabNumber() - 1 + direction];
    if (!next) return;
    this.setTab(next);
    requestAnimationFrame(() =>
      document.querySelector('.record-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  setSection(section: AttentionSection): void {
    if (this.section() === section || this.isSavingChanges()) return;
    if (this.section() === 'history' && this.current()?.status === 'BORRADOR' && this.form.dirty) {
      this.save(section);
      return;
    }
    const editor = this.section() === 'plan' ? this.planEditor() : this.odontogramEditor();
    if (editor && !canLeaveEditor(editor)) return;
    this.error.set('');
    this.section.set(section);
  }

  hasUnsavedChanges(): boolean {
    return (
      (this.current()?.status === 'BORRADOR' && this.form.dirty) ||
      (this.planEditor()?.hasUnsavedChanges() ?? false) ||
      (this.odontogramEditor()?.hasUnsavedChanges() ?? false)
    );
  }
  isSavingChanges(): boolean {
    return (
      this.saving() ||
      (this.planEditor()?.isSavingChanges() ?? false) ||
      (this.odontogramEditor()?.isSavingChanges() ?? false)
    );
  }
  beforeUnload(event: Event): void {
    protectBeforeUnload(event, this);
  }

  save(nextSection?: AttentionSection, finishAfterSave = false): void {
    const current = this.current();
    if (!current || current.status !== 'BORRADOR') return;
    if (!this.canWrite() || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los valores clínicos fuera de rango.');
      this.showFirstInvalidTab();
      return;
    }
    this.saving.set(true);
    this.clearMessages();
    this.clinicalApi
      .update(current.id, this.payload(current.version))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.current.set(updated);
          this.patch(updated);
          this.saving.set(false);
          this.success.set('Borrador clínico guardado y versionado.');
          this.replaceEncounter(updated);
          if (finishAfterSave) this.finish(updated);
          else if (nextSection) this.section.set(nextSection);
        },
        error: (error: unknown) => this.handleError(error, 'No se pudo guardar el borrador.'),
      });
  }

  finalize(): void {
    const current = this.current();
    if (!current || !this.canApprove()) return;
    if (current.status !== 'BORRADOR' || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los valores clínicos fuera de rango.');
      this.showFirstInvalidTab();
      return;
    }
    const missing = this.missingRequirements();
    if (missing.length) {
      this.tab.set(missing[0].tab);
      this.error.set(`Para finalizar faltan: ${missing.map((item) => item.label).join(', ')}.`);
      return;
    }
    if (
      !window.confirm(
        'Al finalizar, la historia quedará cerrada y solo podrá consultarse. ¿Confirmas la aprobación profesional?',
      )
    )
      return;
    if (this.form.dirty) {
      this.save(undefined, true);
      return;
    }
    this.finish(current);
  }
  private finish(current: ClinicalEncounter): void {
    this.saving.set(true);
    this.clearMessages();
    this.clinicalApi
      .finalize(current.id, current.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.current.set(updated);
          this.patch(updated);
          this.saving.set(false);
          this.success.set('Historia clínica finalizada y aprobada.');
          this.replaceEncounter(updated);
          this.loadWorkday();
        },
        error: (error: unknown) => this.handleError(error, 'No se pudo finalizar la atención.'),
      });
  }

  private start(patientId: number, appointmentId?: number): void {
    if (this.saving() || !this.canWrite()) return;
    if (!canLeaveEditor(this)) return;
    this.saving.set(true);
    this.clearMessages();
    this.clinicalApi
      .start(patientId, appointmentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (encounter) => {
          this.saving.set(false);
          this.encounters.update((items) => [
            encounter,
            ...items.filter((item) => item.id !== encounter.id),
          ]);
          this.displayEncounter(encounter);
        },
        error: (error: unknown) => this.handleError(error, 'No se pudo iniciar la atención.'),
      });
  }

  private payload(version: number): ClinicalPayload {
    const value = this.form.getRawValue();
    const text = (item: string | null) => item?.trim() || null;
    return {
      consultationReason: text(value.consultationReason),
      illnessDuration: text(value.illnessDuration),
      signsSymptoms: text(value.signsSymptoms),
      chronologicalStory: text(value.chronologicalStory),
      systolicPressure: value.systolicPressure,
      diastolicPressure: value.diastolicPressure,
      pulse: value.pulse,
      temperature: value.temperature,
      respiratoryRate: value.respiratoryRate,
      weightKg: value.weightKg,
      heightCm: value.heightCm,
      generalExam: text(value.generalExam),
      dentalExam: text(value.dentalExam),
      diagnosis: text(value.diagnosis),
      workPlan: text(value.workPlan),
      prognosis: text(value.prognosis),
      evolution: text(value.evolution),
      instructions: text(value.instructions),
      nextControlDate: text(value.nextControlDate),
      discharged: Boolean(value.discharged),
      dischargeObservation: text(value.dischargeObservation),
      patientConsent: Boolean(value.patientConsent),
      version,
    };
  }

  private patch(item: ClinicalEncounter): void {
    this.form.reset(
      {
        consultationReason: item.consultationReason ?? '',
        illnessDuration: item.illnessDuration ?? '',
        signsSymptoms: item.signsSymptoms ?? '',
        chronologicalStory: item.chronologicalStory ?? '',
        systolicPressure: item.systolicPressure ?? null,
        diastolicPressure: item.diastolicPressure ?? null,
        pulse: item.pulse ?? null,
        temperature: item.temperature ?? null,
        respiratoryRate: item.respiratoryRate ?? null,
        weightKg: item.weightKg ?? null,
        heightCm: item.heightCm ?? null,
        generalExam: item.generalExam ?? '',
        dentalExam: item.dentalExam ?? '',
        diagnosis: item.diagnosis ?? '',
        workPlan: item.workPlan ?? '',
        prognosis: item.prognosis ?? '',
        evolution: item.evolution ?? '',
        instructions: item.instructions ?? '',
        nextControlDate: item.nextControlDate ?? '',
        discharged: item.discharged,
        dischargeObservation: item.dischargeObservation ?? '',
        patientConsent: item.patientConsent,
      },
      { emitEvent: false },
    );
    if (item.status !== 'BORRADOR' || !this.canWrite()) this.form.disable({ emitEvent: false });
    else this.form.enable({ emitEvent: false });
    this.form.markAsPristine();
  }
  private replaceEncounter(updated: ClinicalEncounter): void {
    this.encounters.update((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
  private showFirstInvalidTab(): void {
    const controls = this.form.controls;
    const invalid = (names: (keyof typeof controls)[]) =>
      names.some((name) => controls[name].invalid);
    if (invalid(['consultationReason', 'illnessDuration', 'signsSymptoms', 'chronologicalStory']))
      this.tab.set('anamnesis');
    else if (
      invalid([
        'systolicPressure',
        'diastolicPressure',
        'pulse',
        'temperature',
        'respiratoryRate',
        'weightKg',
        'heightCm',
      ])
    )
      this.tab.set('vitals');
    else if (controls.generalExam.invalid || controls.dentalExam.invalid) this.tab.set('exam');
    else if (controls.diagnosis.invalid || controls.workPlan.invalid || controls.prognosis.invalid)
      this.tab.set('assessment');
    else this.tab.set('closure');
  }
  private handleError(error: unknown, fallback: string): void {
    this.saving.set(false);
    this.error.set(this.errors.toUserMessage(error, fallback));
  }
  private clearMessages(): void {
    this.error.set('');
    this.success.set('');
  }
}
