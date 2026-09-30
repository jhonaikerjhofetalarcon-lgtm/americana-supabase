import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { TreatmentApiService } from '../../../treatments/data-access/treatment-api.service';
import { FinanceApiService } from '../../data-access/finance-api.service';
import { PaymentAgreementComponent } from './payment-agreement';

describe('Adelanto firmado: integridad del importe y continuidad', () => {
  let page: PaymentAgreementComponent;
  let getPlan: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    getPlan = vi.fn(() => of({ id: 5, version: 1, items: [] }));
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: TreatmentApiService, useValue: { get: getPlan } },
      { provide: FinanceApiService, useValue: {
        methods: () => of([{ id: 1, name: 'Efectivo' }]), currentCash: () => of({ id: 2 }),
        signedPaymentsForPlan: () => of([]),
      } },
    ] });
    const fixture = TestBed.createComponent(PaymentAgreementComponent);
    fixture.componentRef.setInput('account', { id: 7, planId: 5, balance: 300, status: 'PENDIENTE' });
    fixture.detectChanges();
    page = fixture.componentInstance;
    page.openPayment();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['amount', 'methodId', 'reference'] as const)('exige otra firma al cambiar %s', (field) => {
    page.signed.set(true);
    if (field === 'reference') page.form.controls.reference.setValue('OPERACION-2');
    else page.form.controls[field].setValue(2);
    expect(page.signed()).toBe(false);
    expect(page.error()).toContain('nueva firma');
  });

  it('conserva la firma si el usuario cancela el cierre', () => {
    page.signed.set(true);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    page.close();
    expect(page.mode()).toBe('payment');
    expect(page.signed()).toBe(true);
  });

  it('no permite cerrar o borrar la firma durante el registro', () => {
    page.signed.set(true);
    page.saving.set(true);
    page.close();
    page.clearSignature();
    expect(page.mode()).toBe('payment');
    expect(page.signed()).toBe(true);
  });

  it('no reutiliza el presupuesto ni la firma si falla la actualización', () => {
    page.signed.set(true);
    getPlan.mockReturnValue(throwError(() => new Error('Servicio no disponible')));
    page.reload();
    expect(page.plan()).toBeNull();
    expect(page.signed()).toBe(false);
    expect(page.loading()).toBe(false);
    expect(page.error()).toBeTruthy();
  });
});
