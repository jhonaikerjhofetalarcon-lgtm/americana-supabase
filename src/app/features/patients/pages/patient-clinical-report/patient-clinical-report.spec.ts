import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import {
  PatientClinicalReportService,
  PatientClinicalReport,
} from '../../data-access/patient-clinical-report.service';
import { PatientApiService } from '../../data-access/patient-api.service';
import { PatientClinicalReportPage } from './patient-clinical-report';

describe('Vista imprimible de historia clínica', () => {
  const report = {
    patientId: 8,
    generatedAt: '2026-09-15T12:00:00Z',
    encounters: [],
    excludedEncounters: 1,
    odontograms: [],
    plans: [],
    appointments: [],
    treatmentsIncluded: false,
    appointmentsIncluded: false,
    patient: {
      id: 8,
      firstNames: '<script>Prueba</script>',
      paternalSurname: 'Paciente',
      historyNumber: 'HC-8',
      documentType: 'SIN_DOCUMENTO',
      sex: 'FEMENINO',
      birthDate: '1990-01-01',
      age: 36,
      emergencyContacts: [],
      histories: [],
      medications: [],
      allergies: [],
      files: [],
    },
  } as unknown as PatientClinicalReport;
  let load: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    load = vi.fn().mockReturnValue(of(report));
    await TestBed.configureTestingModule({
      imports: [PatientClinicalReportPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '8' }) } },
        },
        { provide: PatientClinicalReportService, useValue: { load } },
        { provide: PatientApiService, useValue: { downloadFile: vi.fn() } },
      ],
    }).compileComponents();
  });
  afterEach(() => vi.restoreAllMocks());
  it('identifica borradores excluidos y permisos faltantes, escapando texto del paciente', () => {
    const fixture = TestBed.createComponent(PatientClinicalReportPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('script')).toBeNull();
    expect(element.textContent).toContain('<script>Prueba</script>');
    expect(element.textContent).toContain('1 atenciones en borrador o anuladas');
    expect(element.textContent).toContain('no tiene permiso para consultar tratamientos');
    expect(element.textContent).toContain('originales se entregan por separado');
  });
  it('no permite imprimir mientras carga o después de un fallo', () => {
    load.mockReturnValue(new Subject<PatientClinicalReport>());
    const fixture = TestBed.createComponent(PatientClinicalReportPage);
    fixture.detectChanges();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fixture.componentInstance.print();
    expect(print).not.toHaveBeenCalled();
    load.mockReturnValue(throwError(() => new Error('Error de consulta')));
    fixture.componentInstance.load();
    fixture.detectChanges();
    fixture.componentInstance.print();
    expect(print).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('article')).toBeNull();
    expect(fixture.nativeElement.querySelector('button.primary').disabled).toBe(true);
  });
  it('abre el diálogo de impresión solo cuando el informe está listo', () => {
    const fixture = TestBed.createComponent(PatientClinicalReportPage);
    fixture.detectChanges();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fixture.nativeElement.querySelector('button.primary').click();
    expect(print).toHaveBeenCalledOnce();
  });
  it('muestra un error y deja de cargar si el identificador no es válido', () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { paramMap: convertToParamMap({ id: 'no-valido' }) } },
    });
    const fixture = TestBed.createComponent(PatientClinicalReportPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toContain('identificador');
    expect(load).not.toHaveBeenCalled();
  });
});
