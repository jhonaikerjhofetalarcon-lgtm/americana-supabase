import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAlertTriangle, LucideArrowLeft, LucideCheck, LucideChevronRight, LucideSave, LucideShieldCheck, LucideUserRound } from '@lucide/angular';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { ModalDirective } from '../../../../shared/ui/modal/modal.directive';
import { PatientApiService } from '../../data-access/patient-api.service';
import { DocumentType, DuplicateCandidate, PatientDetail, PatientPayload, PatientSex } from '../../models/patient.models';

@Component({
  selector: 'app-patient-form',
  imports: [ModalDirective, ReactiveFormsModule, RouterLink, LucideAlertTriangle, LucideArrowLeft, LucideCheck,
    LucideChevronRight, LucideSave, LucideShieldCheck, LucideUserRound],
  templateUrl: './patient-form.html',
  styleUrl: './patient-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientForm implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(PatientApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  readonly patientId = signal<number | null>(null);
  readonly existing = signal<PatientDetail | null>(null);
  readonly loading = signal(false);
  readonly loadingPatient = signal(false);
  readonly error = signal('');
  readonly duplicates = signal<DuplicateCandidate[]>([]);
  readonly duplicateReviewOpen = signal(false);
  readonly title = computed(() => this.patientId() ? 'Editar paciente' : 'Nuevo paciente');

  readonly form = this.fb.group({
    documentType: this.fb.control<DocumentType>('DNI'), documentNumber: ['', [Validators.maxLength(20)]],
    firstNames: ['', [Validators.required, Validators.maxLength(100)]],
    paternalSurname: ['', [Validators.required, Validators.maxLength(80)]], maternalSurname: ['', Validators.maxLength(80)],
    birthDate: ['', Validators.required], sex: this.fb.control<PatientSex>('FEMENINO'), birthPlace: ['', Validators.maxLength(150)],
    occupation: ['', Validators.maxLength(120)], maritalStatus: [''], educationLevel: [''], religion: [''], ethnicSelfIdentification: [''],
    mobile: ['', Validators.pattern(/^[0-9+ ()-]{0,20}$/)], whatsappConsent: [false],
    phone: ['', Validators.pattern(/^[0-9+ ()-]{0,20}$/)],
    email: ['', Validators.email], address: ['', Validators.maxLength(250)],
    responsibleName: [''], responsibleDocument: [''], responsibleRelationship: [''], responsiblePhone: [''],
    emergencyName: [''], emergencyRelationship: [''], emergencyPhone: [''],
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isFinite(id) && id > 0) { this.patientId.set(id); this.load(id); }
  }

  isMinor(): boolean {
    const date = this.form.controls.birthDate.value;
    if (!date) return false;
    const birth = new Date(`${date}T00:00:00`); const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
    return age < 18;
  }

  documentChanged(): void {
    const type = this.form.controls.documentType.value;
    if (type === 'SIN_DOCUMENTO') this.form.controls.documentNumber.setValue('');
  }

  submit(force = false): void {
    if (this.loading() || this.loadingPatient()) return;
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); this.error.set('Revisa los campos obligatorios y los datos marcados.'); return; }
    if (this.isMinor() && (!this.form.controls.responsibleName.value || !this.form.controls.responsibleRelationship.value || !this.form.controls.responsiblePhone.value)) {
      this.error.set('Los pacientes menores de edad requieren responsable, parentesco y teléfono.'); return;
    }
    if (this.form.controls.whatsappConsent.value && !this.form.controls.mobile.value.trim()) {
      this.error.set('Registra el celular antes de autorizar mensajes por WhatsApp.');
      return;
    }
    const id = this.patientId();
    if (id && !this.existing()) return;
    if (!id && !force) {
      const value = this.form.getRawValue();
      this.loading.set(true);
      this.api.duplicates(value.documentNumber, value.mobile, value.birthDate, value.paternalSurname)
        .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (items) => {
          this.loading.set(false); this.duplicates.set(items);
          if (items.length) this.duplicateReviewOpen.set(true); else this.persist();
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(this.errors.toUserMessage(
            error,
            'No se pudo comprobar si el paciente ya existe.',
          ));
        },
      });
      return;
    }
    this.duplicateReviewOpen.set(false); this.persist();
  }

  private persist(): void {
    const payload = this.payload(); const id = this.patientId();
    this.loading.set(true); this.error.set('');
    const request = id ? this.api.update(id, { ...payload, version: this.existing()!.version }) : this.api.create(payload);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (patient) => { this.loading.set(false); void this.router.navigate(['/sistema/pacientes', patient.id]); },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo guardar la ficha.'));
      },
    });
  }

  private payload(): PatientPayload {
    const v = this.form.getRawValue(); const empty = (value: string) => value.trim() || null;
    const emergency = v.emergencyName.trim() && v.emergencyPhone.trim() ? {
      fullName: v.emergencyName.trim(), relationship: v.emergencyRelationship.trim(), phone: v.emergencyPhone.trim(), primary: true,
    } : null;
    return {
      documentType: v.documentType, documentNumber: v.documentType === 'SIN_DOCUMENTO' ? null : empty(v.documentNumber),
      firstNames: v.firstNames.trim(), paternalSurname: v.paternalSurname.trim(), maternalSurname: empty(v.maternalSurname),
      birthDate: v.birthDate, sex: v.sex, birthPlace: empty(v.birthPlace), occupation: empty(v.occupation),
      maritalStatus: empty(v.maritalStatus), educationLevel: empty(v.educationLevel), religion: empty(v.religion),
      ethnicSelfIdentification: empty(v.ethnicSelfIdentification), mobile: empty(v.mobile),
      whatsappConsent: v.whatsappConsent, phone: empty(v.phone),
      email: empty(v.email), address: empty(v.address), responsibleName: empty(v.responsibleName),
      responsibleDocument: empty(v.responsibleDocument), responsibleRelationship: empty(v.responsibleRelationship),
      responsiblePhone: empty(v.responsiblePhone), emergencyContact: this.patientId() ? undefined : emergency,
    };
  }

  private load(id: number): void {
    this.loadingPatient.set(true);
    this.api.get(id).pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => {
        this.existing.set(p); this.loadingPatient.set(false);
        this.form.patchValue({
          documentType: p.documentType, documentNumber: p.documentNumber ?? '', firstNames: p.firstNames,
          paternalSurname: p.paternalSurname, maternalSurname: p.maternalSurname ?? '', birthDate: p.birthDate,
          sex: p.sex, birthPlace: p.birthPlace ?? '', occupation: p.occupation ?? '', maritalStatus: p.maritalStatus ?? '',
          educationLevel: p.educationLevel ?? '', religion: p.religion ?? '', ethnicSelfIdentification: p.ethnicSelfIdentification ?? '',
          mobile: p.mobile ?? '', whatsappConsent: p.whatsappConsent, phone: p.phone ?? '',
          email: p.email ?? '', address: p.address ?? '',
          responsibleName: p.responsibleName ?? '', responsibleDocument: p.responsibleDocument ?? '',
          responsibleRelationship: p.responsibleRelationship ?? '', responsiblePhone: p.responsiblePhone ?? '',
        });
      },
      error: (error: unknown) => {
        this.loadingPatient.set(false);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo cargar el paciente.'));
      },
    });
  }
}
