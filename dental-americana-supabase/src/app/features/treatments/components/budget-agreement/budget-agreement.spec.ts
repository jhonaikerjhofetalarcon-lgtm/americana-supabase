import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { TreatmentApiService } from '../../data-access/treatment-api.service';
import { SignedBudget, TreatmentPlan } from '../../models/treatment.models';
import { BudgetAgreementComponent } from './budget-agreement';

describe('Presupuesto firmado', () => {
  const plan = { id: 5, status: 'PRESENTADO', version: 2, total: 300, items: [] } as unknown as TreatmentPlan;
  let page: BudgetAgreementComponent;
  let sign: ReturnType<typeof vi.fn>;
  let response: Subject<SignedBudget>;
  let get: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    response = new Subject<SignedBudget>();
    sign = vi.fn(() => response);
    get = vi.fn(() => of(plan));
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: TreatmentApiService, useValue: { get, budgetAgreement: () => of(null), signBudget: sign } },
    ] });
    const fixture = TestBed.createComponent(BudgetAgreementComponent);
    fixture.componentRef.setInput('plan', plan);
    page = fixture.componentInstance;
    page.open();
  });
  afterEach(() => vi.restoreAllMocks());
  it('exige firma y conformidad antes de aceptar', () => {
    page.save();
    page.signature.set('data:image/png;base64,AAAA'); page.save();
    expect(sign).not.toHaveBeenCalled();
    page.confirmed.set(true); page.save(); page.save();
    expect(sign).toHaveBeenCalledExactlyOnceWith(5, 2, 'data:image/png;base64,AAAA');
    expect(page.isSavingChanges()).toBe(true);
  });
  it('protege la firma y el guardado al cerrar', () => {
    page.signature.set('firma');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    page.close(); expect(page.visible()).toBe(true);
    page.saving.set(true); page.close(); expect(page.visible()).toBe(true);
  });
  it('muestra la copia devuelta por el servidor y no vuelve a firmar', () => {
    page.signature.set('firma'); page.confirmed.set(true); page.save();
    response.next({ plan: { ...plan, status: 'ACEPTADO' }, signatureData: 'firma', signedAt: '2026-09-29', registeredBy: 1, currentStatus: 'ACEPTADO' });
    expect(page.document()?.plan.status).toBe('ACEPTADO');
    expect(page.canSign()).toBe(false); expect(page.hasUnsavedChanges()).toBe(false);
    expect(page.saving()).toBe(false);
  });
  it('elimina la firma anterior al actualizar y no permite firmar si falla la consulta', () => {
    page.signature.set('firma anterior');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    get.mockReturnValue(throwError(() => new Error('Sin conexión')));
    page.open();
    expect(page.signature()).toBe(''); expect(page.reviewPlan()).toBeNull();
    expect(page.canSign()).toBe(false); expect(page.error()).toBeTruthy();
  });
});
