import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideAlertTriangle,
  LucideArrowDownRight,
  LucideArrowUpRight,
  LucideBanknote,
  LucideCheck,
  LucideCircleDollarSign,
  LucideClock3,
  LucideFileDown,
  LucideLandmark,
  LucideLoaderCircle,
  LucideLockKeyhole,
  LucidePlus,
  LucideReceipt,
  LucideRefreshCw,
  LucideWalletCards,
  LucideX,
} from '@lucide/angular';
import { forkJoin, Observable, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { canLeaveEditor, protectBeforeUnload } from '../../../../core/navigation/pending-changes.guard';
import { ModalDirective } from '../../../../shared/ui/modal/modal.directive';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { FinanceApiService } from '../../data-access/finance-api.service';
import { PaymentAgreementComponent } from '../../components/payment-agreement/payment-agreement';
import {
  Account,
  CashSession,
  Expense,
  FinanceDashboard,
  Payment,
  PaymentMethod,
} from '../../models/finance.models';
type FinanceTab = 'accounts' | 'payments' | 'expenses';
@Component({
  selector: 'app-finance-dashboard',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  imports: [
    ModalDirective,
    PaymentAgreementComponent,
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    LucideAlertTriangle,
    LucideArrowDownRight,
    LucideArrowUpRight,
    LucideBanknote,
    LucideCheck,
    LucideCircleDollarSign,
    LucideClock3,
    LucideFileDown,
    LucideLandmark,
    LucideLoaderCircle,
    LucideLockKeyhole,
    LucidePlus,
    LucideReceipt,
    LucideRefreshCw,
    LucideWalletCards,
    LucideX,
  ],
  templateUrl: './finance-dashboard.html',
  styleUrl: './finance-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceDashboardPage implements OnInit {
  readonly paymentEditors = viewChildren(PaymentAgreementComponent);
  hasUnsavedChanges(): boolean {
    return this.paymentEditors().some((editor) => editor.hasUnsavedChanges()) ||
      (this.modal() === 'void' && this.voidReason.dirty) ||
      (this.modal() === 'expense' && this.expenseForm.dirty) ||
      ((this.modal() === 'open' || this.modal() === 'close') && this.cashForm.dirty);
  }
  isSavingChanges(): boolean {
    return this.saving() || this.paymentEditors().some((editor) => editor.isSavingChanges());
  }
  beforeUnload(event: Event): void {
    protectBeforeUnload(event, this);
  }
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  private readonly route = inject(ActivatedRoute);
  private loadRequestId = 0;
  readonly dashboard = signal<FinanceDashboard | null>(null);
  readonly accounts = signal<Account[]>([]);
  readonly contextPatientId = signal<number | null>(null);
  readonly returnEncounterId = signal<number | null>(null);
  readonly contextAccounts = computed(() =>
    this.accounts().filter(
      (account) => !this.contextPatientId() || account.patientId === this.contextPatientId(),
    ),
  );
  readonly contextPayments = computed(() =>
    this.payments().filter(
      (payment) => !this.contextPatientId() || payment.patientId === this.contextPatientId(),
    ),
  );
  readonly contextPatientName = computed(
    () =>
      this.contextAccounts()[0]?.patientName ??
      this.contextPayments()[0]?.patientName ??
      'Paciente #' + this.contextPatientId(),
  );
  readonly contextBalance = computed(() =>
    this.contextAccounts()
      .filter((account) => account.status === 'PENDIENTE' || account.status === 'PARCIAL')
      .reduce((sum, account) => sum + account.balance, 0),
  );
  readonly methods = signal<PaymentMethod[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly cash = signal<CashSession | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly tab = signal<FinanceTab>('accounts');
  readonly modal = signal<'expense' | 'open' | 'close' | 'void' | null>(null);
  readonly voidTarget = signal<Payment | null>(null);
  readonly voidReason = this.fb.control('', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]);
  readonly voidConfirmed = signal(false);
  readonly selectedAccount = signal<Account | null>(null);
  readonly selectedReceiptPayment = signal<Payment | null>(null);
  readonly canWrite = signal(this.auth.hasPermission('FINANZA_ESCRIBIR'));
  readonly expenseForm = this.fb.group({
    category: ['Insumos', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    provider: ['', Validators.maxLength(150)],
    documentReference: ['', Validators.maxLength(80)],
    methodId: this.fb.control<number | null>(null, Validators.required),
    amount: [0, Validators.min(0.01)],
  });
  readonly cashForm = this.fb.group({
    amount: [0, [Validators.min(0), Validators.max(9_999_999_999.99)]],
    observation: ['', Validators.maxLength(1000)],
  });
  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((query) => {
      const patientId = Number(query.get('patientId'));
      const encounterId = Number(query.get('encounterId'));
      this.contextPatientId.set(
        Number.isSafeInteger(patientId) && patientId > 0 ? patientId : null,
      );
      this.returnEncounterId.set(
        Number.isSafeInteger(encounterId) && encounterId > 0 ? encounterId : null,
      );
      this.tab.set('accounts');
    });
    this.load();
  }
  downloadReceipt(payment: Payment): void {
    this.selectedReceiptPayment.set(payment);
  }
  canVoid(payment: Payment): boolean {
    return this.canWrite() && payment.status === 'REGISTRADO' && this.cash()?.id === payment.cashSessionId &&
      payment.version !== undefined && !this.loading() && !this.error();
  }
  openVoid(payment: Payment): void {
    if (!this.canVoid(payment) || this.isSavingChanges() || !canLeaveEditor(this)) return;
    this.voidTarget.set(payment); this.voidReason.reset(''); this.voidConfirmed.set(false);
    this.modal.set('void'); this.clear();
  }
  saveVoid(): void {
    const payment = this.voidTarget();
    if (!payment || !this.canWrite() || this.saving() || !this.voidConfirmed()) return;
    const reason = this.voidReason.value.trim();
    if (this.voidReason.invalid || reason.length < 5) {
      this.voidReason.markAsTouched(); this.error.set('Indica un motivo de al menos 5 caracteres.'); return;
    }
    this.run(this.api.voidPayment(payment.id, payment.version ?? -1, reason), 'Pago anulado. Se restableció el saldo y quedó registrado el ajuste de caja.');
  }
  load(): void {
    const requestId = ++this.loadRequestId;
    const { from, to } = this.range();
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      dashboard: this.api.dashboard(from, to),
      accounts: this.api.accounts(),
      methods: this.api.methods(),
      payments: this.api.payments(from, to),
      expenses: this.api.expenses(from, to),
      cash: this.api.currentCash(),
    })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (requestId !== this.loadRequestId) return;
          this.dashboard.set(r.dashboard);
          this.accounts.set(r.accounts);
          this.selectedAccount.update((selected) =>
            selected ? (r.accounts.find((account) => account.id === selected.id) ?? null) : null,
          );
          this.methods.set(r.methods);
          this.payments.set(r.payments);
          this.expenses.set(r.expenses);
          this.cash.set(r.cash);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.loadRequestId) return;
          this.loading.set(false);
          this.error.set(
            this.errors.toUserMessage(error, 'No se pudo cargar la información financiera.'),
          );
        },
      });
  }
  openPayment(a: Account): void {
    if (!this.canWrite() || this.saving() || this.loading() || this.error()) return;
    if (!this.cash()) {
      this.error.set('Abra la caja antes de registrar pagos.');
      return;
    }
    this.selectedAccount.set(a);
    this.selectedReceiptPayment.set(null);
    this.clear();
  }
  openExpense(): void {
    if (!this.canWrite() || this.saving()) return;
    if (!this.cash()) {
      this.error.set('Abra la caja antes de registrar gastos.');
      return;
    }
    this.expenseForm.reset({
      category: 'Insumos',
      description: '',
      provider: '',
      documentReference: '',
      methodId: this.methods()[0]?.id ?? null,
      amount: 0,
    });
    this.modal.set('expense');
    this.clear();
  }
  openCash(): void {
    if (!this.canWrite() || this.cash() || this.saving()) return;
    this.cashForm.reset({ amount: 0, observation: '' });
    this.modal.set('open');
    this.clear();
  }
  closeCash(): void {
    if (!this.canWrite() || !this.cash() || this.saving()) return;
    this.cashForm.reset({ amount: this.cash()?.expectedAmount ?? 0, observation: '' });
    this.modal.set('close');
    this.clear();
  }
  saveExpense(): void {
    if (!this.cash() || !this.canWrite() || this.saving() || this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }
    const v = this.expenseForm.getRawValue();
    const method = this.methods().find((item) => item.id === v.methodId);
    if (method?.referenceRequired && !v.documentReference.trim()) {
      this.error.set('Este método requiere documento o número de operación.');
      return;
    }
    this.run(
      this.api.expense({
        category: v.category.trim(),
        description: v.description.trim(),
        provider: v.provider.trim() || null,
        documentReference: v.documentReference.trim() || null,
        paymentMethodId: v.methodId!,
        amount: v.amount,
      }),
      'Gasto registrado en caja.',
    );
  }
  saveCash(): void {
    const mode = this.modal();
    if (
      !this.canWrite() ||
      this.saving() ||
      this.cashForm.invalid ||
      !['open', 'close'].includes(mode ?? '')
    ) {
      this.cashForm.markAllAsTouched();
      return;
    }
    if (mode === 'close' && !this.cash()) {
      this.error.set('No existe una caja abierta para cerrar.');
      return;
    }
    const v = this.cashForm.getRawValue();
    const request =
      mode === 'open'
        ? this.api.openCash(v.amount)
        : this.api.closeCash(
            this.cash()?.id ?? 0,
            v.amount,
            v.observation.trim() || null,
            this.cash()?.version ?? -1,
          );
    this.run(request, mode === 'open' ? 'Caja abierta.' : 'Caja cerrada y conciliada.');
  }
  downloadReport(): void {
    if (this.exporting()) return;
    const { from, to } = this.range();
    this.exporting.set(true);
    this.api
      .exportReport(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const a = document.createElement('a');
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = 'Reporte_Dental_Americana.csv';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.exporting.set(false);
        },
        error: (error: unknown) => {
          this.exporting.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo exportar el reporte.'));
        },
      });
  }
  closeModal(): void {
    if (canLeaveEditor(this)) this.modal.set(null);
  }
  expenseMethodNeedsReference(): boolean {
    return (
      this.methods().find((x) => x.id === this.expenseForm.controls.methodId.value)
        ?.referenceRequired ?? false
    );
  }
  label(v: string): string {
    return v.replaceAll('_', ' ').toLowerCase();
  }
  private run<T>(request: Observable<T>, message: string): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.clear();
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.modal.set(null);
        this.success.set(message);
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.error.set(this.errors.toUserMessage(e, 'No se pudo registrar la operación.'));
      },
    });
  }
  private range() {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  private clear() {
    this.error.set('');
    this.success.set('');
  }
}
