import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { ClinicalApiService } from '../../../clinical/data-access/clinical-api.service';
import { ClinicalEncounter } from '../../../clinical/models/clinical.models';
import { FinanceApiService } from '../../../finance/data-access/finance-api.service';
import { TreatmentApiService } from '../../data-access/treatment-api.service';
import { TreatmentPlan } from '../../models/treatment.models';
import { TreatmentPlanPage } from './treatment-plan';

describe('Presupuesto desde Atención', () => {
  function editablePlan() {
    const status = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: {} },
      { provide: Router, useValue: {} },
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: ClinicalApiService, useValue: {} },
      { provide: FinanceApiService, useValue: { accountsForPatient: () => throwError(() => new Error('Sin conexión')) } },
      { provide: TreatmentApiService, useValue: { status } },
    ] });
    const page = TestBed.runInInjectionContext(() => new TreatmentPlanPage());
    page.plan.set({ id: 5, patientId: 8, status: 'BORRADOR', items: [], version: 2 } as unknown as TreatmentPlan);
    return { page, status };
  }

  it('impide presentar el presupuesto mientras queda un procedimiento sin agregar', () => {
    const { page, status } = editablePlan();
    page.addOpen.set(true);
    page.itemForm.markAsDirty();
    page.changeStatus('PRESENTADO');
    expect(status).not.toHaveBeenCalled();
    expect(page.error()).toContain('procedimiento pendiente');
  });

  it('rechaza cantidades fraccionadas, piezas inexistentes y evoluciones vacías', () => {
    const { page } = editablePlan();
    page.itemForm.patchValue({ serviceId: 1, quantity: 1.5, tooth: '99', sessions: 0 });
    expect(page.itemForm.controls.quantity.invalid).toBe(true);
    expect(page.itemForm.controls.tooth.invalid).toBe(true);
    expect(page.itemForm.controls.sessions.invalid).toBe(true);
    page.evolutionForm.controls.procedure.setValue('   ');
    expect(page.evolutionForm.invalid).toBe(true);
    page.itemForm.patchValue({ quantity: 1, tooth: '36', sessions: 2 });
    expect(page.itemForm.valid).toBe(true);
  });

  it('informa del fallo al consultar el saldo y termina la carga', () => {
    const { page } = editablePlan();
    page.refreshAccount();
    expect(page.accountLoading()).toBe(false);
    expect(page.accountError()).toBeTruthy();
    expect(page.account()).toBeNull();
  });
  it('permite consultar un plan aceptado aunque el catálogo falle', () => {
    const plan = { id: 5, patientId: 8, status: 'ACEPTADO', items: [], version: 2 } as unknown as TreatmentPlan;
    TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ encounterId: '3' }) } } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: AuthService, useValue: { hasPermission: (permission: string) => permission !== 'FINANZA_LEER' } },
      { provide: ClinicalApiService, useValue: { get: () => of({ id: 3, patientId: 8 } as ClinicalEncounter) } },
      { provide: FinanceApiService, useValue: { accountsForPatient: () => of([]) } },
      { provide: TreatmentApiService, useValue: {
        catalog: () => throwError(() => new Error('Catálogo temporalmente no disponible')),
        listByEncounter: () => of([plan]),
      } },
    ] });
    const page = TestBed.runInInjectionContext(() => new TreatmentPlanPage());
    page.ngOnInit();
    expect(page.loading()).toBe(false);
    expect(page.plan()?.id).toBe(5);
    expect(page.catalogWarning()).toContain('catálogo');
  });
  it('conserva el procedimiento si se cancela el cierre sin guardar', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ encounterId: '3' }) } } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: ClinicalApiService, useValue: {} },
      { provide: FinanceApiService, useValue: { accountsForPatient: () => of([]) } },
      { provide: TreatmentApiService, useValue: {} },
    ] });
    const page = TestBed.runInInjectionContext(() => new TreatmentPlanPage());
    page.addOpen.set(true);
    page.itemForm.controls.description.setValue('Restauración pendiente');
    page.itemForm.markAsDirty();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    page.toggleAdd();
    expect(page.addOpen()).toBe(true);
    expect(page.itemForm.controls.description.value).toBe('Restauración pendiente');
  });
});
