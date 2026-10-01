import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideAlertTriangle,
  LucideArrowLeft,
  LucideCheck,
  LucideClipboardCheck,
  LucideFileText,
  LucideLoaderCircle,
  LucidePlus,
  LucideSave,
  LucideSparkles,
  LucideTrash2,
} from '@lucide/angular';
import { catchError, forkJoin, Observable, of, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { ModalDirective } from '../../../../shared/ui/modal/modal.directive';
import {
  canLeaveEditor,
  protectBeforeUnload,
} from '../../../../core/navigation/pending-changes.guard';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { ClinicalApiService } from '../../../clinical/data-access/clinical-api.service';
import { ClinicalEncounter } from '../../../clinical/models/clinical.models';
import { FinanceApiService } from '../../../finance/data-access/finance-api.service';
import { Account } from '../../../finance/models/finance.models';
import { PaymentAgreementComponent } from '../../../finance/components/payment-agreement/payment-agreement';
import { TreatmentApiService } from '../../data-access/treatment-api.service';
import { BudgetAgreementComponent } from '../../components/budget-agreement/budget-agreement';
import {
  DentalService,
  ItemStatus,
  PlanStatus,
  TreatmentItem,
  TreatmentPlan,
} from '../../models/treatment.models';
@Component({
  selector: 'app-treatment-plan',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  imports: [
    BudgetAgreementComponent,
    ModalDirective,
    PaymentAgreementComponent,
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    LucideAlertTriangle,
    LucideArrowLeft,
    LucideCheck,
    LucideClipboardCheck,
    LucideFileText,
    LucideLoaderCircle,
    LucidePlus,
    LucideSave,
    LucideSparkles,
    LucideTrash2,
  ],
  templateUrl: './treatment-plan.html',
  styleUrl: './treatment-plan.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreatmentPlanPage implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(TreatmentApiService);
  private readonly clinical = inject(ClinicalApiService);
  private readonly finance = inject(FinanceApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  readonly encounter = signal<ClinicalEncounter | null>(null);
  readonly plan = signal<TreatmentPlan | null>(null);
  readonly services = signal<DentalService[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly catalogWarning = signal('');
  readonly success = signal('');
  readonly addOpen = signal(false);
  readonly selectedItem = signal<TreatmentItem | null>(null);
  readonly acceptance = signal(false);
  readonly embeddedEncounterId = input<number | null>(null);
  readonly account = signal<Account | null>(null);
  readonly accountLoading = signal(false);
  readonly accountError = signal('');
  readonly paymentEditor = viewChild(PaymentAgreementComponent);
  readonly budgetEditor = viewChild(BudgetAgreementComponent);
  readonly canFinance = this.auth.hasPermission('FINANZA_LEER');
  readonly canWrite = signal(this.auth.hasPermission('TRATAMIENTO_ESCRIBIR'));
  private loadRequestId = 0;
  private accountRequestId = 0;
  readonly itemForm = this.fb.group({
    serviceId: this.fb.control<number | null>(null, Validators.required),
    tooth: ['', Validators.pattern(/^([1-4][1-8]|[5-8][1-5])$/)],
    description: ['', Validators.maxLength(500)],
    quantity: [1, [Validators.required, Validators.min(1), Validators.max(99), Validators.pattern(/^\d+$/)]],
    unitPrice: [0, [Validators.required, Validators.min(0)]],
    sessions: [1, [Validators.required, Validators.min(1), Validators.max(50), Validators.pattern(/^\d+$/)]],
  });
  readonly planForm = this.fb.group({
    discount: [0, [Validators.required, Validators.min(0)]],
    observations: ['', Validators.maxLength(1000)],
  });
  readonly evolutionForm = this.fb.group({
    procedure: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(4000)]],
    observations: ['', Validators.maxLength(4000)],
    nextSession: [''],
  });
  ngOnInit(): void {
    const id =
      this.embeddedEncounterId() ?? Number(this.route.snapshot.paramMap.get('encounterId'));
    if (!id) {
      void this.router.navigate(['/sistema/atencion']);
      return;
    }
    this.load(id);
  }
  retry(): void {
    const id =
      this.embeddedEncounterId() ?? Number(this.route.snapshot.paramMap.get('encounterId'));
    if (id > 0) this.load(id);
  }
  private load(id: number): void {
    const requestId = ++this.loadRequestId;
    this.loading.set(true);
    this.error.set('');
    this.catalogWarning.set('');
    forkJoin({
      encounter: this.clinical.get(id),
      services: this.api.catalog().pipe(
        catchError(() => {
          this.catalogWarning.set(
            'No se pudo cargar el catálogo de servicios. Puedes ver el plan y reintentar.',
          );
          return of([] as DentalService[]);
        }),
      ),
      plans: this.api.listByEncounter(id),
    })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (requestId !== this.loadRequestId) return;
          this.encounter.set(r.encounter);
          this.services.set(r.services);
          if (r.plans[0]) this.setPlan(r.plans[0]);
          else {
            this.plan.set(null);
            this.account.set(null);
          }
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.loadRequestId) return;
          this.loading.set(false);
          this.error.set(
            this.errors.toUserMessage(error, 'No se pudo cargar el plan de tratamiento.'),
          );
        },
      });
  }
  hasUnsavedChanges(): boolean {
    return (
      (this.plan()?.status === 'BORRADOR' && this.planForm.dirty) ||
      (this.addOpen() && this.itemForm.dirty) ||
      (this.selectedItem() !== null && this.evolutionForm.dirty) ||
      (this.paymentEditor()?.hasUnsavedChanges() ?? false) ||
      (this.budgetEditor()?.hasUnsavedChanges() ?? false)
    );
  }
  isSavingChanges(): boolean {
    return this.saving() || (this.paymentEditor()?.isSavingChanges() ?? false) || (this.budgetEditor()?.isSavingChanges() ?? false);
  }
  beforeUnload(event: Event): void {
    protectBeforeUnload(event, this);
  }
  toggleAdd(): void {
    if (this.saving()) return;
    if (
      this.addOpen() &&
      this.itemForm.dirty &&
      !window.confirm('Hay un procedimiento sin guardar. ¿Descartarlo?')
    )
      return;
    if (this.addOpen()) {
      this.itemForm.reset({
        serviceId: null,
        tooth: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        sessions: 1,
      });
    }
    this.addOpen.update((opened) => !opened);
  }
  closeEvolution(): void {
    if (this.saving()) return;
    if (this.evolutionForm.dirty && !window.confirm('Hay una evolución sin guardar. ¿Descartarla?'))
      return;
    this.selectedItem.set(null);
  }
  create(): void {
    const e = this.encounter();
    if (!e || !this.canWrite() || this.saving()) return;
    this.run(this.api.create(e.patientId, e.id), 'Plan de tratamiento creado.');
  }
  selectService(value: string): void {
    const s = this.services().find((x) => x.id === Number(value));
    if (!s) return;
    this.itemForm.patchValue({
      serviceId: s.id,
      description: s.name,
      unitPrice: s.basePrice,
      sessions: s.suggestedSessions,
    });
  }
  addItem(): void {
    const p = this.plan();
    if (
      !p ||
      !this.canWrite() ||
      p.status !== 'BORRADOR' ||
      this.itemForm.invalid ||
      this.saving()
    ) {
      this.itemForm.markAllAsTouched();
      if (this.itemForm.invalid)
        this.error.set('Elige un servicio, indica cantidad y sesiones enteras, precio y una pieza FDI válida (por ejemplo, 36).');
      return;
    }
    const v = this.itemForm.getRawValue();
    this.run(
      this.api.addItem(p.id, {
        serviceId: v.serviceId!,
        tooth: v.tooth.trim() || null,
        description: v.description.trim() || null,
        quantity: v.quantity,
        unitPrice: v.unitPrice,
        sessions: v.sessions,
      }),
      'Procedimiento agregado.',
      () => {
        this.addOpen.set(false);
        this.itemForm.reset({
          serviceId: null,
          tooth: '',
          description: '',
          quantity: 1,
          unitPrice: 0,
          sessions: 1,
        });
      },
    );
  }
  remove(item: TreatmentItem): void {
    const p = this.plan();
    if (
      !p ||
      !this.canWrite() ||
      p.status !== 'BORRADOR' ||
      this.saving() ||
      !confirm(`¿Retirar ${item.serviceName} del presupuesto?`)
    )
      return;
    this.run(this.api.removeItem(p.id, item.id, item.version), 'Procedimiento retirado.');
  }
  savePlan(): void {
    const p = this.plan();
    if (
      !p ||
      !this.canWrite() ||
      p.status !== 'BORRADOR' ||
      this.planForm.invalid ||
      this.saving()
    ) {
      this.planForm.markAllAsTouched();
      return;
    }
    const v = this.planForm.getRawValue();
    if (v.discount > p.subtotal) {
      this.error.set('El descuento no puede superar el subtotal del presupuesto.');
      return;
    }
    this.run(
      this.api.revise(p.id, v.discount, v.observations.trim() || null, p.version),
      'Presupuesto actualizado.',
      () => this.planForm.reset({ discount: this.plan()!.discount, observations: this.plan()!.observations ?? '' }),
    );
  }
  changeStatus(status: PlanStatus): void {
    const p = this.plan();
    if (!p || !this.canWrite() || this.saving()) return;
    if (this.addOpen() && this.itemForm.dirty) {
      this.error.set('Agrega o cancela el procedimiento pendiente antes de cambiar el estado del presupuesto.');
      return;
    }
    if (status === 'PRESENTADO' && this.planForm.dirty) {
      this.error.set('Guarda los cambios del presupuesto antes de presentarlo.');
      return;
    }
    if (status === 'ACEPTADO') {
      this.budgetEditor()?.open();
      return;
    }
    this.run(
      this.api.status(p.id, status, this.acceptance(), p.version),
      `Plan ${status.replaceAll('_', ' ').toLowerCase()}.`,
    );
  }
  openEvolution(item: TreatmentItem): void {
    const p = this.plan();
    if (
      !p ||
      !this.canWrite() ||
      !['ACEPTADO', 'EN_PROCESO'].includes(p.status) ||
      ['COMPLETADO', 'CANCELADO'].includes(item.status)
    )
      return;
    this.selectedItem.set(item);
    this.evolutionForm.reset({ procedure: '', observations: '', nextSession: '' });
  }
  saveEvolution(): void {
    const p = this.plan(),
      item = this.selectedItem(),
      e = this.encounter();
    if (!p || !item || !e || !this.canWrite() || this.saving() || this.evolutionForm.invalid) {
      this.evolutionForm.markAllAsTouched();
      if (this.evolutionForm.invalid) this.error.set('Escribe el procedimiento realizado antes de guardar la evolución.');
      return;
    }
    const v = this.evolutionForm.getRawValue();
    this.run(
      this.api.evolution(p.id, item.id, {
        encounterId: e.id,
        procedure: v.procedure.trim(),
        observations: v.observations.trim() || null,
        nextSession: v.nextSession || null,
      }),
      'Evolución aprobada y registrada.',
      () => this.selectedItem.set(null),
    );
  }
  completeItem(item: TreatmentItem): void {
    const p = this.plan();
    if (
      !p ||
      !this.canWrite() ||
      this.saving() ||
      item.status !== 'EN_PROCESO' ||
      !item.evolutions.length
    )
      return;
    this.run(
      this.api.itemStatus(p.id, item.id, 'COMPLETADO', item.version),
      'Procedimiento completado.',
    );
  }
  label(v: string): string {
    return v.replaceAll('_', ' ').toLowerCase();
  }
  private setPlan(p: TreatmentPlan): void {
    const unsaved =
      this.planForm.dirty && p.status === 'BORRADOR' ? this.planForm.getRawValue() : null;
    this.plan.set(p);
    this.planForm.reset({ discount: p.discount, observations: p.observations ?? '' });
    this.planForm.markAsPristine();
    if (unsaved) {
      this.planForm.setValue(unsaved);
      this.planForm.markAsDirty();
    }
    if (this.canFinance && ['ACEPTADO', 'EN_PROCESO', 'COMPLETADO'].includes(p.status))
      this.refreshAccount();
    else {
      this.accountRequestId++;
      this.account.set(null);
      this.accountLoading.set(false);
      this.accountError.set('');
    }
  }
  refreshAccount(): void {
    const p = this.plan();
    if (!p || !this.canFinance) return;
    const requestId = ++this.accountRequestId;
    this.accountLoading.set(true);
    this.accountError.set('');
    this.finance
      .accountsForPatient(p.patientId)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => {
          if (requestId !== this.accountRequestId || this.plan()?.id !== p.id) return;
          this.accountLoading.set(false);
          const account = accounts.find((account) => account.planId === p.id) ?? null;
          this.account.set(account);
          if (!account) this.accountError.set('Este plan todavía no tiene una cuenta disponible para cobrar. Actualiza para volver a consultarla.');
        },
        error: (error: unknown) => {
          if (requestId !== this.accountRequestId) return;
          this.accountLoading.set(false);
          this.accountError.set(
            this.errors.toUserMessage(error, 'No se pudo consultar el saldo del plan.'),
          );
        },
      });
  }
  nextStep(): string {
    switch (this.plan()?.status) {
      case 'BORRADOR': return 'Agrega los procedimientos, revisa el total y guarda el presupuesto antes de presentarlo.';
      case 'PRESENTADO': return 'Revisa los importes con el paciente y guarda su firma para aceptar el presupuesto y habilitar los pagos.';
      case 'ACEPTADO': return 'Puedes registrar un adelanto firmado e iniciar el tratamiento desde esta pantalla.';
      case 'EN_PROCESO': return 'Registra la evolución de cada procedimiento y marca los que ya se completaron.';
      case 'COMPLETADO': return 'El tratamiento está completado. Aquí puedes consultar o cobrar el saldo pendiente.';
      case 'RECHAZADO': return 'El paciente rechazó este presupuesto. Sus importes se conservan para consulta.';
      default: return 'Crea el presupuesto de esta atención para registrar procedimientos y pagos.';
    }
  }
  refreshSignedPlan(): void {
    const plan = this.plan();
    if (!plan) return;
    this.api.get(plan.id).pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => { this.setPlan(updated); this.success.set('Presupuesto firmado y guardado.'); },
      error: (e: unknown) => this.error.set(this.errors.toUserMessage(e, 'La firma se guardó, pero no se pudo actualizar el plan. Actualiza la pantalla.')),
    });
  }
  private run(
    request: Observable<TreatmentPlan>,
    message: string,
    done: () => void = () => {},
  ): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => {
        this.setPlan(p);
        this.saving.set(false);
        this.success.set(message);
        done();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.error.set(this.errors.toUserMessage(e, 'No se pudo guardar el cambio.'));
      },
    });
  }
}
