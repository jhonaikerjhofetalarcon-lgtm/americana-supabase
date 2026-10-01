import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideActivity, LucideAlertTriangle, LucideArrowLeft, LucideBriefcaseMedical,
  LucideCalendarPlus, LucideCheck, LucideDownload, LucideEdit3, LucideFilePlus2,
  LucideFiles, LucideHeartPulse, LucideHistory, LucideLoaderCircle, LucideMail,
  LucideMapPin, LucidePhone, LucidePill, LucidePlus, LucidePower, LucidePrinter,
  LucideShieldAlert, LucideUpload, LucideUserRound,
} from '@lucide/angular';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { PatientApiService } from '../../data-access/patient-api.service';
import {
  AllergyPayload, AllergySeverity, AllergyStatus, HistoryPayload, HistoryStatus,
  HistoryType, MedicationPayload, PatientDetail, PatientFile, PatientFileCategory,
} from '../../models/patient.models';
import { Observable, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';

type DetailTab = 'summary' | 'histories' | 'medication' | 'files';

@Component({
  selector: 'app-patient-detail',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe, LucideActivity,
    LucideAlertTriangle, LucideArrowLeft, LucideBriefcaseMedical, LucideCalendarPlus,
    LucideCheck, LucideDownload, LucideEdit3, LucideFilePlus2, LucideFiles,
    LucideHeartPulse, LucideHistory, LucideLoaderCircle, LucideMail, LucideMapPin,
    LucidePhone, LucidePill, LucidePlus, LucidePower, LucidePrinter,
    LucideShieldAlert, LucideUpload, LucideUserRound],
  templateUrl: './patient-detail.html',
  styleUrl: './patient-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientDetailPage implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(PatientApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);

  readonly patient = signal<PatientDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly downloadingId = signal<number | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly tab = signal<DetailTab>('summary');
  readonly openForm = signal<'contact' | 'history' | 'allergy' | 'medication' | 'file' | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly canWritePatient = signal(this.auth.hasPermission('PACIENTE_ESCRIBIR'));
  readonly canWriteClinical = signal(this.auth.hasPermission('CLINICA_ESCRIBIR'));
  readonly canReadClinical = this.auth.hasPermission('CLINICA_LEER');
  readonly activeAllergies = computed(() => this.patient()?.allergies.filter((item) => item.status === 'ACTIVA') ?? []);
  readonly fullName = computed(() => {
    const p = this.patient();
    return p ? [p.firstNames, p.paternalSurname, p.maternalSurname].filter(Boolean).join(' ') : '';
  });

  readonly contactForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    relationship: ['', [Validators.required, Validators.maxLength(60)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9+ ()-]{6,20}$/)]],
    primary: [false],
  });
  readonly historyForm = this.fb.group({
    type: this.fb.control<HistoryType>('MEDICO'), description: ['', [Validators.required, Validators.maxLength(500)]],
    status: this.fb.control<HistoryStatus>('ACTIVO'), observation: ['', Validators.maxLength(1000)], reportedDate: [''],
  });
  readonly allergyForm = this.fb.group({
    substance: ['', [Validators.required, Validators.maxLength(150)]], reaction: ['', Validators.maxLength(300)],
    severity: this.fb.control<AllergySeverity>('LEVE'), status: this.fb.control<AllergyStatus>('ACTIVA'),
    observation: ['', Validators.maxLength(1000)],
  });
  readonly medicationForm = this.fb.group({
    medication: ['', [Validators.required, Validators.maxLength(180)]], dose: ['', Validators.maxLength(100)],
    frequency: ['', Validators.maxLength(100)], reason: ['', Validators.maxLength(250)],
    startDate: [''], endDate: [''], current: [true],
  });
  readonly fileForm = this.fb.group({
    category: this.fb.control<PatientFileCategory>('DOCUMENTO'), description: ['', Validators.maxLength(300)],
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      void this.router.navigate(['/sistema/pacientes']);
      return;
    }
    this.load(id);
  }

  setTab(tab: DetailTab): void { this.tab.set(tab); this.openForm.set(null); this.clearMessages(); }
  toggleForm(form: typeof this.openForm extends { set(value: infer T): void } ? T : never): void {
    this.openForm.set(this.openForm() === form ? null : form);
    this.clearMessages();
  }

  addContact(): void {
    if (!this.valid(this.contactForm)) return;
    const p = this.patient()!;
    this.run(this.api.addEmergencyContact(p.id, this.contactForm.getRawValue()), 'Contacto de emergencia agregado.', () => {
      this.contactForm.reset({ fullName: '', relationship: '', phone: '', primary: false });
    });
  }

  addHistory(): void {
    if (!this.valid(this.historyForm)) return;
    const value = this.historyForm.getRawValue();
    const payload: HistoryPayload = { ...value, observation: this.empty(value.observation), reportedDate: this.empty(value.reportedDate) };
    this.run(this.api.addHistory(this.patient()!.id, payload), 'Antecedente registrado.', () => {
      this.historyForm.reset({ type: 'MEDICO', description: '', status: 'ACTIVO', observation: '', reportedDate: '' });
    });
  }

  addAllergy(): void {
    if (!this.valid(this.allergyForm)) return;
    const value = this.allergyForm.getRawValue();
    const payload: AllergyPayload = { ...value, reaction: this.empty(value.reaction), observation: this.empty(value.observation) };
    this.run(this.api.addAllergy(this.patient()!.id, payload), 'Alergia registrada.', () => {
      this.allergyForm.reset({ substance: '', reaction: '', severity: 'LEVE', status: 'ACTIVA', observation: '' });
    });
  }

  addMedication(): void {
    if (!this.valid(this.medicationForm)) return;
    const value = this.medicationForm.getRawValue();
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      this.error.set('La fecha final del medicamento no puede ser anterior al inicio.');
      return;
    }
    const payload: MedicationPayload = {
      ...value, dose: this.empty(value.dose), frequency: this.empty(value.frequency), reason: this.empty(value.reason),
      startDate: this.empty(value.startDate), endDate: this.empty(value.endDate),
    };
    this.run(this.api.addMedication(this.patient()!.id, payload), 'Medicamento registrado.', () => {
      this.medicationForm.reset({ medication: '', dose: '', frequency: '', reason: '', startDate: '', endDate: '', current: true });
    });
  }

  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && file.size > 10 * 1024 * 1024) {
      this.selectedFile.set(null); this.error.set('El archivo supera el límite de 10 MB.'); input.value = ''; return;
    }
    if (file && !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      this.selectedFile.set(null);
      this.error.set('Solo se permiten archivos PDF, JPG o PNG.');
      input.value = '';
      return;
    }
    this.selectedFile.set(file); this.clearMessages();
  }

  upload(): void {
    const file = this.selectedFile();
    if (!file) { this.error.set('Selecciona un archivo PDF, JPG o PNG.'); return; }
    const value = this.fileForm.getRawValue();
    this.run(this.api.uploadFile(this.patient()!.id, file, value.category, this.empty(value.description) ?? undefined), 'Archivo adjuntado.', () => {
      this.fileForm.reset({ category: 'DOCUMENTO', description: '' }); this.selectedFile.set(null);
    });
  }

  download(file: PatientFile): void {
    const patient = this.patient();
    if (!patient || this.downloadingId()) return;
    this.downloadingId.set(file.id); this.error.set('');
    this.api.downloadFile(patient.id, file.id)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response: HttpResponse<Blob>) => {
        const blob = response.body;
        if (blob) {
          const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
          anchor.href = url; anchor.download = file.originalName; anchor.click();
          globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
        }
        this.downloadingId.set(null);
      },
      error: (error: unknown) => {
        this.downloadingId.set(null);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo descargar el archivo.'));
      },
    });
  }

  changeStatus(): void {
    const p = this.patient();
    if (!p || this.saving()) return;
    const action = p.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Deseas ${action} la ficha de ${this.fullName()}?`)) return;
    this.saving.set(true); this.clearMessages();
    this.api.changeStatus(p.id, !p.active, p.version)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => { this.patient.set(updated); this.saving.set(false); this.success.set(`Paciente ${updated.active ? 'reactivado' : 'desactivado'}.`); },
      error: (error: unknown) => this.handleError(error, 'No se pudo cambiar el estado del paciente.'),
    });
  }

  print(): void { window.print(); }

  private load(id: number): void {
    this.loading.set(true); this.error.set('');
    this.api.get(id).pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (patient) => { this.patient.set(patient); this.loading.set(false); },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo cargar la ficha del paciente.'));
      },
    });
  }

  private run<T>(request: Observable<T>, message: string, reset: () => void): void {
    if (this.saving()) return;
    this.saving.set(true); this.clearMessages();
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { reset(); this.openForm.set(null); this.saving.set(false); this.success.set(message); this.load(this.patient()!.id); },
      error: (error) => this.handleError(error, 'No se pudo guardar la información.'),
    });
  }

  private valid(form: { invalid: boolean; markAllAsTouched(): void }): boolean {
    this.clearMessages();
    if (!form.invalid) return true;
    form.markAllAsTouched(); this.error.set('Completa correctamente los campos obligatorios.'); return false;
  }

  private handleError(error: unknown, fallback: string): void {
    this.saving.set(false);
    this.error.set(this.errors.toUserMessage(error, fallback));
  }
  private clearMessages(): void { this.error.set(''); this.success.set(''); }
  private empty(value: string): string | null { return value.trim() || null; }
}
