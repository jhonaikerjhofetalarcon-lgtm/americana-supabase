import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { AuthService } from '../../../../core/auth/auth.service';
import { canLeaveEditor } from '../../../../core/navigation/pending-changes.guard';
import { ModalDirective } from '../../../../shared/ui/modal/modal.directive';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { TreatmentApiService } from '../../../treatments/data-access/treatment-api.service';
import { TreatmentPlan } from '../../../treatments/models/treatment.models';
import { FinanceApiService } from '../../data-access/finance-api.service';
import {
  Account,
  CashSession,
  Payment,
  PaymentMethod,
  SignedPaymentAgreement,
} from '../../models/finance.models';

@Component({
  selector: 'app-payment-agreement',
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, ModalDirective],
  templateUrl: './payment-agreement.html',
  styleUrl: './payment-agreement.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentAgreementComponent {
  readonly canWrite = inject(AuthService).hasPermission('FINANZA_ESCRIBIR');
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(FinanceApiService);
  private readonly treatmentApi = inject(TreatmentApiService);
  private readonly errors = inject(SupabaseErrorService);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;
  readonly account = input<Account | null>(null);
  readonly receiptPayment = input<Payment | null>(null);
  readonly autoOpen = input(false);
  readonly paymentBlocked = input(false);
  readonly paid = output<SignedPaymentAgreement>();
  readonly closed = output<void>();
  readonly refreshRequested = output<void>();
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly mode = signal<'payment' | 'receipt' | null>(null);
  readonly plan = signal<TreatmentPlan | null>(null);
  readonly methods = signal<PaymentMethod[]>([]);
  readonly cash = signal<CashSession | null>(null);
  readonly previous = signal<Payment[]>([]);
  readonly receipt = signal<SignedPaymentAgreement | null>(null);
  readonly signed = signal(false);
  readonly openingAmount = this.fb.control(0, [Validators.required, Validators.min(0)]);
  private openedAccountId: number | null = null;
  private loadId = 0;
  private receiptRequestId = 0;
  private operationId = crypto.randomUUID();
  private drawing = false;
  readonly form = this.fb.group({
    methodId: this.fb.control<number | null>(null, Validators.required),
    amount: [0, [Validators.required, Validators.min(0.01)]],
    reference: ['', Validators.maxLength(120)],
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.signed() && !this.saving()) {
        this.clearSignature();
        this.error.set('Cambiaste los datos del pago. Revisa el importe y solicita una nueva firma.');
      }
    });
    effect(() => {
      const account = this.account();
      const autoOpen = this.autoOpen();
      if (account) {
        untracked(() => {
          this.load(account);
          if (autoOpen && this.openedAccountId !== account.id) {
            this.openedAccountId = account.id;
            this.openPayment();
          }
        });
      }
    });
    effect(() => {
      const payment = this.receiptPayment();
      if (payment) untracked(() => this.showReceipt(payment));
    });
  }

  private load(account: Account): void {
    const loadId = ++this.loadId;
    this.clearSignature();
    this.plan.set(null);
    this.error.set('');
    this.loading.set(true);
    forkJoin({
      plan: this.treatmentApi.get(account.planId),
      methods: this.api.methods(),
      cash: this.api.currentCash(),
      previous: this.api.signedPaymentsForPlan(account.planId),
    })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (this.account()?.id !== account.id || loadId !== this.loadId) return;
          this.plan.set(result.plan);
          this.methods.set(result.methods);
          this.cash.set(result.cash);
          this.previous.set(result.previous);
          if (this.mode() === 'payment' && this.form.controls.methodId.value == null) {
            this.form.controls.methodId.setValue(result.methods[0]?.id ?? null);
          }
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (loadId !== this.loadId) return;
          this.loading.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo preparar el cobro.'));
        },
      });
  }
  openPayment(): void {
    const account = this.account();
    if (!this.canWrite || this.paymentBlocked() || this.saving() || !account || account.balance <= 0 || account.status === 'ANULADA') return;
    this.operationId = crypto.randomUUID();
    this.form.reset({
      methodId: this.methods()[0]?.id ?? null,
      amount: account.balance,
      reference: '',
    });
    this.signed.set(false);
    this.error.set('');
    this.mode.set('payment');
    setTimeout(() => this.clearSignature());
  }
  reload(): void {
    if (this.saving()) return;
    this.refreshRequested.emit();
    const account = this.account();
    if (account) this.load(account);
  }
  close(): void {
    if (!canLeaveEditor(this)) return;
    this.receiptRequestId++;
    this.mode.set(null);
    this.error.set('');
    this.closed.emit();
  }
  showReceipt(payment: Payment): void {
    if (!canLeaveEditor(this)) return;
    const requestId = ++this.receiptRequestId;
    this.error.set('');
    this.receipt.set(null);
    this.mode.set('receipt');
    this.api
      .signedAgreement(payment.id)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.receiptRequestId) return;
          if (result) this.receipt.set(result);
          else this.error.set('Este pago no tiene una constancia firmada.');
        },
        error: (error: unknown) => {
          if (requestId === this.receiptRequestId)
            this.error.set(this.errors.toUserMessage(error, 'No se pudo abrir la constancia.'));
        },
      });
  }
  needsReference(): boolean {
    return (
      this.methods().find((item) => item.id === this.form.controls.methodId.value)
        ?.referenceRequired ?? false
    );
  }
  balanceAfter(): number {
    return Math.max(
      0,
      (this.account()?.balance ?? 0) - (Number(this.form.controls.amount.value) || 0),
    );
  }
  pointerDown(event: PointerEvent): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas || this.saving()) return;
    canvas.setPointerCapture(event.pointerId);
    this.drawing = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const point = this.point(event, canvas);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.1, point.y + 0.1);
    ctx.stroke();
    this.signed.set(true);
  }
  pointerMove(event: PointerEvent): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas || !this.drawing || this.saving()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const point = this.point(event, canvas);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  pointerUp(): void {
    this.drawing = false;
  }
  clearSignature(): void {
    if (this.saving()) return;
    this.signed.set(false);
    this.drawing = false;
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    if (ctx) {
      ctx.strokeStyle = '#18364d';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    this.signed.set(false);
  }
  openCash(): void {
    if (!this.canWrite) return;
    if (this.saving() || this.openingAmount.invalid) {
      this.openingAmount.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .openCash(this.openingAmount.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cash) => {
          this.cash.set(cash);
          this.saving.set(false);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo abrir la caja.'));
        },
      });
  }
  save(): void {
    const account = this.account(),
      plan = this.plan();
    if (!this.canWrite || this.paymentBlocked() || !account || !plan || this.saving() || this.loading() || this.mode() !== 'payment') return;
    if (!this.cash()) {
      this.error.set('Abre la caja antes de registrar el adelanto.');
      return;
    }
    if (this.form.invalid || !this.signed()) {
      this.form.markAllAsTouched();
      this.error.set('Indica el monto, el método de pago y solicita la firma del paciente.');
      return;
    }
    const value = this.form.getRawValue();
    if (value.amount > account.balance) {
      this.error.set('El adelanto supera el saldo pendiente.');
      return;
    }
    if (this.needsReference() && !value.reference.trim()) {
      this.error.set('Este método requiere número de operación o referencia.');
      return;
    }
    const signatureData = this.signatureCanvas?.nativeElement.toDataURL('image/png') ?? '';
    if (signatureData.length > 150000) {
      this.error.set('La firma es demasiado grande. Bórrala y vuelve a firmar.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .signedAdvance({
        accountId: account.id,
        accountVersion: account.version,
        planVersion: plan.version,
        paymentMethodId: value.methodId!,
        amount: value.amount,
        reference: value.reference.trim() || null,
        signatureData,
        operationId: this.operationId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.receipt.set(result);
          this.mode.set('receipt');
          this.paid.emit(result);
          this.load(account);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo registrar el adelanto.'));
        },
      });
  }
  print(): void {
    if (!this.receipt()) return;
    document.body.classList.add('printing-agreement');
    const cleanup = () => {
      document.body.classList.remove('printing-agreement');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 60000);
  }
  hasUnsavedChanges(): boolean {
    return this.mode() === 'payment' && (this.form.dirty || this.signed());
  }
  isSavingChanges(): boolean {
    return this.saving();
  }
  private point(event: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  }
}
