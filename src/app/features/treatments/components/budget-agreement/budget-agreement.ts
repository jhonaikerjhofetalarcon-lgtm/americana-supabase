import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, timeout } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { canLeaveEditor } from '../../../../core/navigation/pending-changes.guard';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { ModalDirective } from '../../../../shared/ui/modal/modal.directive';
import { SignaturePadComponent } from '../../../../shared/ui/signature-pad/signature-pad';
import { TreatmentApiService } from '../../data-access/treatment-api.service';
import { SignedBudget, TreatmentPlan } from '../../models/treatment.models';

@Component({
  selector: 'app-budget-agreement',
  imports: [CurrencyPipe, DatePipe, ModalDirective, SignaturePadComponent],
  templateUrl: './budget-agreement.html', styleUrl: './budget-agreement.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetAgreementComponent {
  readonly plan = input.required<TreatmentPlan>();
  readonly updated = output<void>();
  private readonly api = inject(TreatmentApiService);
  private readonly errors = inject(SupabaseErrorService);
  private readonly destroyRef = inject(DestroyRef);
  readonly canWrite = inject(AuthService).hasPermission('TRATAMIENTO_ESCRIBIR');
  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly document = signal<SignedBudget | null>(null);
  readonly reviewPlan = signal<TreatmentPlan | null>(null);
  readonly signature = signal('');
  readonly confirmed = signal(false);
  private requestId = 0;
  constructor() { this.destroyRef.onDestroy(() => document.body.classList.remove('printing-budget')); }
  hasUnsavedChanges(): boolean { return this.visible() && !this.document() && !!this.signature(); }
  isSavingChanges(): boolean { return this.saving(); }
  open(): void {
    if (this.saving() || !canLeaveEditor(this)) return;
    const requestId = ++this.requestId;
    this.visible.set(true); this.loading.set(true); this.error.set('');
    this.document.set(null); this.reviewPlan.set(null); this.signature.set(''); this.confirmed.set(false);
    forkJoin({ agreement: this.api.budgetAgreement(this.plan().id), plan: this.api.get(this.plan().id) })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ agreement, plan }) => {
          if (requestId !== this.requestId) return;
          this.loading.set(false); this.document.set(agreement); this.reviewPlan.set(agreement?.plan ?? plan);
        }, error: (e: unknown) => {
          if (requestId !== this.requestId) return;
          this.loading.set(false); this.error.set(this.errors.toUserMessage(e, 'No se pudo abrir el presupuesto.'));
        },
      });
  }
  canSign(): boolean {
    return this.canWrite && !this.document() && ['PRESENTADO','ACEPTADO','EN_PROCESO','COMPLETADO'].includes(this.reviewPlan()?.status ?? '');
  }
  save(): void {
    const plan = this.reviewPlan();
    if (!plan || !this.canSign() || this.saving() || !this.signature() || !this.confirmed()) return;
    if (this.signature().length > 150000) { this.error.set('La firma es demasiado grande. Bórrala y vuelve a firmar.'); return; }
    this.saving.set(true); this.error.set('');
    this.api.signBudget(plan.id, plan.version, this.signature()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.saving.set(false); this.document.set(result); this.reviewPlan.set(result.plan);
        this.signature.set(''); this.updated.emit();
      }, error: (e: unknown) => {
        this.saving.set(false); this.error.set(this.errors.toUserMessage(e, 'No se pudo guardar la firma.'));
      },
    });
  }
  close(): void {
    if (!canLeaveEditor(this)) return;
    this.requestId++; this.visible.set(false); this.signature.set('');
  }
  print(): void {
    if (!this.document()) return;
    const cleanup = () => document.body.classList.remove('printing-budget');
    document.body.classList.add('printing-budget');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print(); setTimeout(cleanup, 60000);
  }
}
