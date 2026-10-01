import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { ClinicalApiService } from '../../../clinical/data-access/clinical-api.service';
import { ClinicalEncounter } from '../../../clinical/models/clinical.models';
import { OdontogramApiService } from '../../data-access/odontogram-api.service';
import { Odontogram, OdontogramFinding } from '../../models/odontogram.models';
import { OdontogramEditor } from './odontogram-editor';

describe('OdontogramEditor: edición y respuestas pendientes', () => {
  const finding: OdontogramFinding = {
    id: 31,
    tooth: '11',
    surface: 'VESTIBULAR',
    condition: 'CARIES',
    treatmentState: 'INDICADO',
    createdAt: '2026-09-10T10:00:00Z',
    updatedAt: '2026-09-10T10:00:00Z',
    version: 1,
  };
  const permanent: Odontogram = {
    id: 9,
    encounterId: 3,
    patientId: 4,
    dentitionType: 'PERMANENTE',
    status: 'BORRADOR',
    generalObservation: 'Nota guardada',
    createdAt: '2026-09-10T10:00:00Z',
    updatedAt: '2026-09-10T10:00:00Z',
    version: 5,
    findings: [finding],
  };
  const primary: Odontogram = {
    ...permanent,
    id: 10,
    dentitionType: 'INFANTIL',
    generalObservation: 'Nota infantil',
    findings: [],
  };
  const encounter: ClinicalEncounter = {
    id: 3,
    patientId: 4,
    patientHistoryNumber: 'HC-PRUEBA',
    patientName: 'Paciente de prueba',
    patientAge: 12,
    dentistId: 1,
    dentistName: 'Profesional de prueba',
    encounterDate: '2026-09-10',
    status: 'BORRADOR',
    discharged: false,
    patientConsent: true,
    createdAt: '2026-09-10T10:00:00Z',
    updatedAt: '2026-09-10T10:00:00Z',
    version: 1,
  };
  let page: OdontogramEditor;
  let response: Subject<Odontogram>;
  let api: {
    initialize: ReturnType<typeof vi.fn>;
    addFinding: ReturnType<typeof vi.fn>;
    removeFinding: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    response = new Subject<Odontogram>();
    api = {
      initialize: vi.fn(() => response.asObservable()),
      addFinding: vi.fn(() => response.asObservable()),
      removeFinding: vi.fn(() => response.asObservable()),
      observe: vi.fn(() => response.asObservable()),
      approve: vi.fn(() => response.asObservable()),
      list: vi.fn(() => of([permanent])),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: OdontogramApiService, useValue: api },
        { provide: ClinicalApiService, useValue: { get: () => of(encounter) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '3' } } } },
        { provide: Router, useValue: {} },
        { provide: AuthService, useValue: { hasPermission: () => true } },
        {
          provide: SupabaseErrorService,
          useValue: { toUserMessage: (_error: unknown, fallback: string) => fallback },
        },
      ],
    });
    // Exercise local editor state with controllable responses and no remote or lifecycle calls.
    page = TestBed.runInInjectionContext(() => new OdontogramEditor());
    page.encounter.set(encounter);
    page.items.set([permanent, primary]);
    page.current.set(permanent);
    page.observation.setValue(permanent.generalObservation!);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it('selecciona superficies sin guardar automáticamente al abrir el editor', () => {
    page.markSurface('26', 'OCLUSAL');
    expect(page.quickMark()).toBe(false);
    expect(page.selectedTooth()).toBe('26');
    expect(page.form.controls.surface.value).toBe('OCLUSAL');
    expect(api.addFinding).not.toHaveBeenCalled();
  });

  it('muestra condiciones frecuentes sin ocultar una condición menos habitual ya seleccionada', () => {
    expect(page.visibleConditions().map((option) => option.value)).toEqual([
      'CARIES', 'RESTAURACION', 'CORONA', 'AUSENTE',
    ]);
    page.chooseCondition('IMPLANTE');
    expect(page.visibleConditions().map((option) => option.value)).toContain('IMPLANTE');
    page.showAllConditions.set(true);
    expect(page.visibleConditions().length).toBe(page.conditionOptions.length);
  });

  it('distingue un error de carga de un odontograma inexistente y permite reintentar', () => {
    api.list.mockReturnValueOnce(throwError(() => new Error('Consulta fallida')));
    page.ngOnInit();
    expect(page.loadFailed()).toBe(true);
    expect(page.loading()).toBe(false);
    expect(page.error()).toContain('No se pudo cargar');

    page.retry();
    expect(page.loadFailed()).toBe(false);
    expect(page.current()?.id).toBe(permanent.id);
  });

  it('conserva el detalle pendiente y evita aplicarlo a otra pieza', () => {
    page.form.controls.observation.setValue('Dolor en la pieza 11');
    page.selectTooth('21');
    expect(page.selectedTooth()).toBe('11');
    expect(page.form.controls.observation.value).toBe('Dolor en la pieza 11');
    expect(page.error()).toContain('antes de cambiar de pieza');

    page.quickMark.set(true);
    page.markSurface('21', 'MESIAL');
    expect(page.selectedTooth()).toBe('11');
    expect(api.addFinding).not.toHaveBeenCalled();

    page.discardFindingDetail();
    expect(page.error()).toBe('');
    page.markSurface('21', 'MESIAL');
    expect(page.selectedTooth()).toBe('21');
    expect(api.addFinding).toHaveBeenCalledWith(9, expect.objectContaining({
      tooth: '21',
      observation: null,
    }));
  });

  it('registra la superficie, condición y estado elegidos al activar marcado directo', () => {
    page.quickMark.set(true);
    page.chooseCondition('RESTAURACION');
    page.chooseTreatmentState('EXISTENTE');
    page.markSurface('26', 'OCLUSAL');
    expect(api.addFinding).toHaveBeenCalledWith(9, {
      tooth: '26',
      surface: 'OCLUSAL',
      condition: 'RESTAURACION',
      treatmentState: 'EXISTENTE',
      observation: null,
      version: 5,
    });
  });

  it('registra ausente, extracción indicada e implante sobre la pieza completa', () => {
    page.quickMark.set(true);
    page.chooseCondition('AUSENTE');
    page.markSurface('26', 'OCLUSAL');
    expect(api.addFinding).toHaveBeenCalledWith(9, expect.objectContaining({
      tooth: '26', condition: 'AUSENTE', surface: 'GENERAL',
    }));
  });

  it('permite consultar las superficies sin escribir un odontograma aprobado', () => {
    page.current.set({ ...permanent, status: 'APROBADO' });
    page.quickMark.set(true);
    page.markSurface('21', 'MESIAL');
    expect(page.selectedTooth()).toBe('21');
    expect(page.editable()).toBe(false);
    expect(api.addFinding).not.toHaveBeenCalled();
  });

  it('filtra cuadrantes conservando el orden de las piezas en ambas denticiones', () => {
    expect(page.visibleArches().flatMap((arch) => arch.teeth).length).toBe(32);
    page.focusQuadrant(3);
    expect(page.visibleArches()).toEqual([
      {
        label: 'Arcada inferior',
        teeth: ['31', '32', '33', '34', '35', '36', '37', '38'],
      },
    ]);
    expect(page.selectedTooth()).toBe('31');
    page.moveTooth(-1);
    expect(page.selectedTooth()).toBe('38');
    page.moveTooth(1);
    expect(page.selectedTooth()).toBe('31');

    page.switchDentition('INFANTIL');
    expect(page.visibleArches().flatMap((arch) => arch.teeth).length).toBe(20);
    page.focusQuadrant(4);
    expect(page.visibleArches()).toEqual([
      {
        label: 'Arcada inferior',
        teeth: ['85', '84', '83', '82', '81'],
      },
    ]);
    expect(page.selectedTooth()).toBe('85');
  });

  it('mantiene dentición y pieza mientras se registra un hallazgo', () => {
    page.form.controls.observation.setValue('Detalle de la pieza 11');
    page.add();
    page.switchDentition('INFANTIL');
    page.selectTooth('21');

    expect(page.dentition()).toBe('PERMANENTE');
    expect(page.selectedTooth()).toBe('11');
    expect(page.form.controls.observation.value).toBe('Detalle de la pieza 11');
    expect(api.initialize).not.toHaveBeenCalled();

    response.next({ ...permanent, version: 6 });
    expect(page.current()?.dentitionType).toBe(page.dentition());
    expect(page.saving()).toBe(false);
  });

  it('no crea una dentición solo por verla y permite crearla de forma explícita', () => {
    page.items.set([permanent]);
    page.focusedQuadrant.set(1);
    page.switchDentition('INFANTIL');

    expect(page.current()).toBeNull();
    expect(page.focusedQuadrant()).toBe(0);
    expect(page.selectedTooth()).toBe('51');
    expect(api.initialize).not.toHaveBeenCalled();

    page.createDentition();
    expect(api.initialize).toHaveBeenCalledWith(3, 'INFANTIL');

    response.error(new Error('Error simulado'));
    expect(page.current()).toBeNull();
    expect(page.saving()).toBe(false);
    expect(page.error()).toContain('No se pudo crear');
  });

  it('no muestra la creación tardía de otra dentición', () => {
    page.items.set([permanent]);
    page.switchDentition('INFANTIL');
    page.createDentition();
    // Simulate a subsequent view change while the old response is still in flight.
    page.dentition.set('PERMANENTE');
    page.current.set(permanent);
    response.next(primary);

    expect(page.current()).toBe(permanent);
    expect(page.items()).toContain(primary);
  });

  it('actualiza la colección sin reemplazar la dentición visible con una respuesta tardía', () => {
    page.add();
    page.dentition.set('INFANTIL');
    page.current.set(primary);
    page.observation.setValue(primary.generalObservation!);
    response.next({ ...permanent, version: 6 });

    expect(page.current()).toBe(primary);
    expect(page.observation.value).toBe(primary.generalObservation);
    expect(page.items().find((item) => item.id === permanent.id)?.version).toBe(6);
  });

  it.each(['registrar', 'retirar'])(
    'preserva la nota general sin guardar al %s un hallazgo',
    (action) => {
      page.observation.setValue('Borrador pendiente');
      expect(page.observation.pristine).toBe(true);
      if (action === 'registrar') page.add();
      else page.remove(finding);
      response.next({ ...permanent, findings: [], version: 6 });

      expect(page.observation.value).toBe('Borrador pendiente');
      expect(page.hasPendingObservation()).toBe(true);
      expect(page.current()?.version).toBe(6);
    },
  );

  it('usa el texto confirmado por el servidor al guardar una nota sin nuevas ediciones', () => {
    page.observation.setValue(' Nueva nota ');
    page.saveObservation();
    expect(api.observe).toHaveBeenCalledWith(9, ' Nueva nota ', 5);
    response.next({ ...permanent, generalObservation: 'Nueva nota', version: 6 });

    expect(page.observation.value).toBe('Nueva nota');
    expect(page.hasPendingObservation()).toBe(false);
    expect(page.observation.pristine).toBe(true);
  });

  it.each(['Edición posterior', permanent.generalObservation!])(
    'conserva una edición durante el guardado aunque vuelva al texto anterior: %s',
    (laterDraft) => {
      page.observation.setValue('Nota enviada');
      page.saveObservation();
      page.observation.setValue(laterDraft);
      response.next({ ...permanent, generalObservation: 'Nota enviada', version: 6 });

      expect(page.current()?.generalObservation).toBe('Nota enviada');
      expect(page.observation.value).toBe(laterDraft);
      expect(page.hasPendingObservation()).toBe(true);
      expect(page.observation.dirty).toBe(true);
    },
  );

  it('impide cambiar de dentición o aprobar hasta guardar o descartar la nota', () => {
    page.observation.setValue('Nota pendiente');
    page.switchDentition('INFANTIL');
    expect(page.dentition()).toBe('PERMANENTE');
    expect(page.error()).toContain('Guarda o descarta');

    page.approve();
    expect(api.approve).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(page.error()).toContain('antes de aprobar');

    page.discardObservation();
    expect(page.observation.value).toBe(permanent.generalObservation);
    expect(page.hasPendingObservation()).toBe(false);
    page.switchDentition('INFANTIL');
    expect(page.current()).toBe(primary);
    expect(page.observation.value).toBe(primary.generalObservation);
  });

  it('impide filtrar otra pieza y aprobar con un detalle de hallazgo pendiente', () => {
    page.form.controls.observation.setValue('Detalle pendiente de la pieza 11');
    page.focusQuadrant(2);
    expect(page.focusedQuadrant()).toBe(0);
    expect(page.selectedTooth()).toBe('11');

    page.switchDentition('INFANTIL');
    expect(page.dentition()).toBe('PERMANENTE');

    page.approve();
    expect(api.approve).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(page.error()).toContain('detalle del hallazgo');
  });

  it('preserva la nota general y permite volver a guardarla si falla la solicitud', () => {
    page.observation.setValue('Nota pendiente');
    page.saveObservation();
    response.error(new Error('Error simulado'));

    expect(page.observation.value).toBe('Nota pendiente');
    expect(page.current()?.generalObservation).toBe(permanent.generalObservation);
    expect(page.hasPendingObservation()).toBe(true);
    expect(page.saving()).toBe(false);
  });

  it('explica el límite del hallazgo y no envía un formulario inválido', () => {
    page.form.controls.observation.setValue('a'.repeat(501));
    page.add();

    expect(api.addFinding).not.toHaveBeenCalled();
    expect(page.error()).toContain('500 caracteres');
    expect(page.form.controls.observation.touched).toBe(true);
  });

  it('explica el límite de la nota general y no envía un valor inválido', () => {
    page.observation.setValue('a'.repeat(4001));
    page.saveObservation();

    expect(api.observe).not.toHaveBeenCalled();
    expect(page.error()).toContain('4000 caracteres');
    expect(page.observation.touched).toBe(true);
  });
});
