import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideAlertTriangle,
  LucideArrowLeft,
  LucideBaby,
  LucideCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideClipboardCheck,
  LucideHistory,
  LucideLoaderCircle,
  LucideMousePointerClick,
  LucidePalette,
  LucidePlus,
  LucideSave,
  LucideShieldCheck,
  LucideStethoscope,
  LucideTrash2,
} from '@lucide/angular';
import { Observable, timeout } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { protectBeforeUnload } from '../../../../core/navigation/pending-changes.guard';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { ClinicalApiService } from '../../../clinical/data-access/clinical-api.service';
import { ClinicalEncounter } from '../../../clinical/models/clinical.models';
import { OdontogramApiService } from '../../data-access/odontogram-api.service';
import {
  CONDITION_OPTIONS,
  conditionColor,
  centerSurfaceFor,
  surfaceName,
} from '../../models/odontogram-presentation';
import { ToothSurfaceMap } from '../../ui/tooth-surface-map/tooth-surface-map';
import {
  DentitionType,
  Odontogram,
  OdontogramFinding,
  ToothCondition,
  ToothSurface,
  TreatmentState,
} from '../../models/odontogram.models';
@Component({
  selector: 'app-odontogram-editor',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  imports: [
    ToothSurfaceMap,
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    LucideAlertTriangle,
    LucideArrowLeft,
    LucideBaby,
    LucideCheck,
    LucideChevronLeft,
    LucideChevronRight,
    LucideClipboardCheck,
    LucideHistory,
    LucideLoaderCircle,
    LucideMousePointerClick,
    LucidePalette,
    LucidePlus,
    LucideSave,
    LucideShieldCheck,
    LucideStethoscope,
    LucideTrash2,
  ],
  templateUrl: './odontogram-editor.html',
  styleUrl: './odontogram-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OdontogramEditor implements OnInit {
  @ViewChild('markingToolbar') private markingToolbar?: ElementRef<HTMLElement>;
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(OdontogramApiService);
  private readonly clinical = inject(ClinicalApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  readonly encounter = signal<ClinicalEncounter | null>(null);
  readonly embeddedEncounterId = input<number | null>(null);
  readonly items = signal<Odontogram[]>([]);
  readonly current = signal<Odontogram | null>(null);
  readonly dentition = signal<DentitionType>('PERMANENTE');
  readonly selectedTooth = signal('11');
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly quickMark = signal(false);
  readonly showAllConditions = signal(false);
  readonly focusedQuadrant = signal(0);
  readonly error = signal('');
  readonly success = signal('');
  readonly canWrite = signal(this.auth.hasPermission('CLINICA_ESCRIBIR'));
  readonly canApprove = signal(this.auth.hasPermission('CLINICA_APROBAR'));
  readonly editable = computed(
    () =>
      this.canWrite() &&
      this.current()?.status === 'BORRADOR' &&
      this.encounter()?.status === 'BORRADOR',
  );
  readonly quadrantOptions = [
    { value: 0, label: 'Todas' },
    { value: 1, label: 'Sup. derecha' },
    { value: 2, label: 'Sup. izquierda' },
    { value: 4, label: 'Inf. derecha' },
    { value: 3, label: 'Inf. izquierda' },
  ];
  readonly permanentUpper = [
    '18',
    '17',
    '16',
    '15',
    '14',
    '13',
    '12',
    '11',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
  ];
  readonly permanentLower = [
    '48',
    '47',
    '46',
    '45',
    '44',
    '43',
    '42',
    '41',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
  ];
  readonly primaryUpper = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'];
  readonly primaryLower = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'];
  readonly upper = computed(() =>
    this.dentition() === 'PERMANENTE' ? this.permanentUpper : this.primaryUpper,
  );
  readonly lower = computed(() =>
    this.dentition() === 'PERMANENTE' ? this.permanentLower : this.primaryLower,
  );
  readonly findingsByTooth = computed(() => {
    const result: Record<string, OdontogramFinding[]> = {};
    for (const finding of this.current()?.findings ?? [])
      (result[finding.tooth] ??= []).push(finding);
    return result;
  });
  readonly selectedFindings = computed(() => this.findingsByTooth()[this.selectedTooth()] ?? []);
  readonly visibleArches = computed(() => {
    const quadrant = this.focusedQuadrant();
    const matches = (tooth: string) => !quadrant || ((Number(tooth[0]) - 1) % 4) + 1 === quadrant;
    return [
      { label: 'Arcada superior', teeth: this.upper().filter(matches) },
      { label: 'Arcada inferior', teeth: this.lower().filter(matches) },
    ].filter((arch) => arch.teeth.length);
  });
  readonly clinicalSummary = computed(() => {
    const findings = this.current()?.findings ?? [];
    const toothCount = (predicate: (finding: OdontogramFinding) => boolean) =>
      new Set(findings.filter(predicate).map((finding) => finding.tooth)).size;

    return {
      findings: findings.length,
      caries: toothCount((finding) => finding.condition === 'CARIES'),
      indicated: toothCount((finding) => finding.treatmentState === 'INDICADO'),
      completed: toothCount((finding) => finding.treatmentState === 'REALIZADO'),
      absent: toothCount((finding) => finding.condition === 'AUSENTE'),
    };
  });
  readonly conditionOptions = CONDITION_OPTIONS;
  visibleConditions(): typeof CONDITION_OPTIONS {
    if (this.showAllConditions()) return this.conditionOptions;
    const common = this.conditionOptions.slice(0, 4);
    const selected = this.conditionOptions.find((option) => option.value === this.form.controls.condition.value);
    return selected && !common.includes(selected) ? [...common, selected] : common;
  }
  readonly form = this.fb.group({
    surface: this.fb.control<ToothSurface>('GENERAL'),
    condition: this.fb.control<ToothCondition>('CARIES'),
    treatmentState: this.fb.control<TreatmentState>('INDICADO'),
    observation: ['', Validators.maxLength(500)],
  });
  readonly observation = this.fb.control('', Validators.maxLength(4000));
  ngOnInit(): void {
    this.retry();
  }
  retry(): void {
    const id =
      this.embeddedEncounterId() ?? Number(this.route.snapshot.paramMap.get('encounterId'));
    if (!id) {
      void this.router.navigate(['/sistema/atencion']);
      return;
    }
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set('');
    this.clinical
      .get(id)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.encounter.set(e);
          this.load(id);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.error.set(this.errors.toUserMessage(error, 'No se encontró la atención clínica.'));
        },
      });
  }
  switchDentition(type: DentitionType): void {
    if (this.saving()) return;
    if (type !== this.dentition() && this.hasPendingFindingDetail()) {
      this.clear();
      this.error.set('Registra o borra el detalle del hallazgo antes de cambiar de dentición.');
      return;
    }
    if (type !== this.dentition() && this.hasPendingObservation()) {
      this.clear();
      this.error.set('Guarda o descarta la observación general antes de cambiar de dentición.');
      return;
    }
    this.clear();
    this.dentition.set(type);
    this.selectedTooth.set(type === 'PERMANENTE' ? '11' : '51');
    this.focusedQuadrant.set(0);
    this.form.controls.surface.setValue('GENERAL');
    const existing = this.items().find((i) => i.dentitionType === type);
    if (existing) {
      this.setCurrent(existing);
    } else {
      this.current.set(null);
      this.observation.setValue('');
      this.observation.markAsPristine();
    }
  }
  createDentition(): void {
    const encounter = this.encounter();
    const type = this.dentition();
    if (
      this.saving() ||
      this.current() ||
      !encounter ||
      !this.canWrite() ||
      encounter.status !== 'BORRADOR'
    )
      return;
    this.saving.set(true);
    this.clear();
    this.api
      .initialize(encounter.id, type)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          this.items.update((v) => [...v.filter((i) => i.dentitionType !== type), item]);
          if (this.dentition() === item.dentitionType) {
            this.setCurrent(item);
            this.success.set(
              `Odontograma ${item.dentitionType === 'INFANTIL' ? 'infantil' : 'permanente'} creado.`,
            );
          }
          this.saving.set(false);
        },
        error: (e) => this.fail(e, 'No se pudo crear el odontograma.'),
      });
  }
  selectTooth(tooth: string): void {
    if (this.saving() || !this.canChangeTooth(tooth)) return;
    if (tooth === this.selectedTooth()) return;
    this.selectedTooth.set(tooth);
    this.form.controls.surface.setValue('GENERAL');
    this.form.controls.observation.setValue('');
    this.clear();
  }
  findingsFor(tooth: string): OdontogramFinding[] {
    return this.findingsByTooth()[tooth] ?? [];
  }
  conditionColor(condition: ToothCondition): string {
    return conditionColor(condition);
  }
  conditionLabel(condition: ToothCondition): string {
    return (
      this.conditionOptions.find((option) => option.value === condition)?.label ??
      this.label(condition)
    );
  }
  treatmentStateLabel(state: TreatmentState): string {
    return state.charAt(0) + state.slice(1).toLowerCase();
  }
  surfaceName(tooth: string, surface: ToothSurface): string {
    return surface === 'GENERAL' ? 'Pieza completa' : surfaceName(tooth, surface);
  }
  focusQuadrant(quadrant: number): void {
    if (this.saving()) return;
    const teeth = [
      ...this.upper().filter((tooth) => !quadrant || ((Number(tooth[0]) - 1) % 4) + 1 === quadrant),
      ...this.lower().filter((tooth) => !quadrant || ((Number(tooth[0]) - 1) % 4) + 1 === quadrant),
    ];
    if (!teeth.includes(this.selectedTooth())) {
      if (!this.canChangeTooth(teeth[0])) return;
      this.selectTooth(teeth[0]);
    }
    this.focusedQuadrant.set(quadrant);
  }
  moveTooth(direction: number): void {
    const teeth = this.visibleArches().flatMap((arch) => arch.teeth);
    const index = teeth.indexOf(this.selectedTooth());
    this.selectTooth(teeth[(index + direction + teeth.length) % teeth.length]);
  }
  showDetail(panel: HTMLElement): void {
    panel.scrollIntoView({ block: 'start' });
    panel.focus({ preventScroll: true });
  }
  showMarkingToolbar(): void {
    if (this.markingToolbar) this.showDetail(this.markingToolbar.nativeElement);
  }
  toothDescription(tooth: string): string {
    const quadrant: Record<string, string> = {
      '1': 'superior derecha, permanente',
      '2': 'superior izquierda, permanente',
      '3': 'inferior izquierda, permanente',
      '4': 'inferior derecha, permanente',
      '5': 'superior derecha, temporal',
      '6': 'superior izquierda, temporal',
      '7': 'inferior izquierda, temporal',
      '8': 'inferior derecha, temporal',
    };
    const permanent = [
      '',
      'incisivo central',
      'incisivo lateral',
      'canino',
      'primer premolar',
      'segundo premolar',
      'primer molar',
      'segundo molar',
      'tercer molar',
    ];
    const primary = [
      '',
      'incisivo central',
      'incisivo lateral',
      'canino',
      'primer molar',
      'segundo molar',
    ];
    const position = (Number(tooth[0]) <= 4 ? permanent : primary)[Number(tooth[1])] ?? 'pieza';
    return `Pieza ${tooth}: ${position}, arcada ${quadrant[tooth[0]] ?? 'no identificada'} (lado del paciente)`;
  }
  centerSurface(): ToothSurface {
    return this.centerSurfaceFor(this.selectedTooth());
  }
  centerSurfaceFor(tooth: string): ToothSurface {
    return centerSurfaceFor(tooth);
  }
  chooseSurface(surface: ToothSurface): void {
    this.form.controls.surface.setValue(this.wholeToothCondition() ? 'GENERAL' : surface);
  }
  chooseCondition(condition: ToothCondition): void {
    this.form.controls.condition.setValue(condition);
    if (this.wholeToothCondition()) this.form.controls.surface.setValue('GENERAL');
  }
  wholeToothCondition(): boolean {
    return ['AUSENTE', 'EXTRACCION_INDICADA', 'IMPLANTE'].includes(
      this.form.controls.condition.value,
    );
  }
  chooseTreatmentState(state: string): void {
    if (state === 'INDICADO' || state === 'EXISTENTE' || state === 'REALIZADO')
      this.form.controls.treatmentState.setValue(state);
  }
  markSurface(tooth: string, surface: ToothSurface): void {
    if (this.saving() || !this.canChangeTooth(tooth)) return;
    if (tooth !== this.selectedTooth()) this.form.controls.observation.setValue('');
    this.selectedTooth.set(tooth);
    this.form.controls.surface.setValue(this.wholeToothCondition() ? 'GENERAL' : surface);
    this.clear();

    if (this.quickMark() && this.canWrite() && this.current()?.status === 'BORRADOR') {
      this.add(true);
    }
  }
  add(quick = false): void {
    const item = this.current();
    if (!item || !this.canWrite() || item.status !== 'BORRADOR' || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.clear();
      this.error.set('La observación del hallazgo debe tener como máximo 500 caracteres.');
      return;
    }
    const value = this.form.getRawValue();
    this.run(
      this.api.addFinding(item.id, {
        tooth: this.selectedTooth(),
        surface: value.surface,
        condition: value.condition,
        treatmentState: value.treatmentState,
        observation: value.observation.trim() || null,
        version: item.version,
      }),
      quick
        ? `Pieza ${this.selectedTooth()} marcada correctamente.`
        : 'Hallazgo confirmado y registrado.',
      () => {
        if (this.form.controls.observation.value === value.observation) {
          this.form.controls.observation.setValue('');
        }
      },
    );
  }
  remove(finding: OdontogramFinding): void {
    const item = this.current();
    if (
      !item ||
      !this.canWrite() ||
      item.status !== 'BORRADOR' ||
      this.saving() ||
      !window.confirm(
        `¿Retirar ${this.conditionLabel(finding.condition)} de la pieza ${finding.tooth}?`,
      )
    )
      return;
    this.run(
      this.api.removeFinding(item.id, finding.id, finding.version),
      'Hallazgo retirado.',
      () => {},
    );
  }
  hasPendingObservation(): boolean {
    const item = this.current();
    return !!item && this.observation.value !== (item.generalObservation ?? '');
  }
  hasUnsavedChanges(): boolean {
    return (
      this.current()?.status === 'BORRADOR' &&
      (this.hasPendingObservation() || this.hasPendingFindingDetail())
    );
  }
  discardFindingDetail(): void {
    if (this.saving()) return;
    this.form.controls.observation.setValue('');
    this.clear();
  }
  isSavingChanges(): boolean {
    return this.saving();
  }
  beforeUnload(event: Event): void {
    protectBeforeUnload(event, this);
  }
  discardObservation(): void {
    if (this.saving()) return;
    this.observation.setValue(this.current()?.generalObservation ?? '');
    this.observation.markAsPristine();
    this.clear();
  }
  saveObservation(): void {
    const item = this.current();
    if (!item || !this.canWrite() || item.status !== 'BORRADOR' || this.saving()) return;
    if (this.observation.invalid) {
      this.observation.markAsTouched();
      this.clear();
      this.error.set('La observación general debe tener como máximo 4000 caracteres.');
      return;
    }
    const submittedObservation = this.observation.value;
    this.run(
      this.api.observe(item.id, submittedObservation, item.version),
      'Observación general guardada.',
      (saved, observationBeforeRefresh) => {
        this.observation.setValue(
          observationBeforeRefresh === submittedObservation
            ? (saved.generalObservation ?? '')
            : observationBeforeRefresh,
        );
        if (this.hasPendingObservation()) this.observation.markAsDirty();
        else this.observation.markAsPristine();
      },
    );
  }
  approve(): void {
    const item = this.current();
    if (!item || !this.canApprove() || item.status !== 'BORRADOR' || this.saving()) return;
    if (this.hasPendingObservation()) {
      this.clear();
      this.error.set('Guarda o descarta la observación general antes de aprobar el odontograma.');
      return;
    }
    if (this.hasPendingFindingDetail()) {
      this.clear();
      this.error.set('Registra o borra el detalle del hallazgo antes de aprobar el odontograma.');
      return;
    }
    if (
      !window.confirm(
        '¿Confirmas que revisaste todas las piezas y deseas aprobar este odontograma?',
      )
    )
      return;
    this.run(
      this.api.approve(item.id, item.version),
      'Odontograma aprobado por el profesional.',
      () => {},
    );
  }
  label(value: string): string {
    return value.replaceAll('_', ' ').toLowerCase();
  }
  private load(id: number): void {
    this.api
      .list(id)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loadFailed.set(false);
          const current = items.find((i) => i.dentitionType === this.dentition());
          if (current) this.setCurrent(current);
          else this.current.set(null);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo cargar el odontograma.'));
        },
      });
  }
  private setCurrent(item: Odontogram, preserveObservation = true): void {
    const preserveDraft =
      preserveObservation && this.current()?.id === item.id && this.hasPendingObservation();
    this.current.set(item);
    if (!preserveDraft) this.observation.setValue(item.generalObservation ?? '');
    if (this.hasPendingObservation()) this.observation.markAsDirty();
    else this.observation.markAsPristine();
  }
  private run(
    request: Observable<Odontogram>,
    message: string,
    done: (item: Odontogram, observationBeforeRefresh: string) => void,
  ): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.clear();
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => {
        this.items.update((v) => [
          ...v.filter((i) => i.dentitionType !== item.dentitionType),
          item,
        ]);
        this.saving.set(false);
        if (this.dentition() === item.dentitionType) {
          const observationBeforeRefresh = this.observation.value;
          this.setCurrent(item);
          this.success.set(message);
          done(item, observationBeforeRefresh);
        }
      },
      error: (e) => this.fail(e, 'No se pudo guardar el cambio.'),
    });
  }
  private fail(e: unknown, fallback: string): void {
    this.saving.set(false);
    this.error.set(this.errors.toUserMessage(e, fallback));
  }
  private clear(): void {
    this.error.set('');
    this.success.set('');
  }
  private hasPendingFindingDetail(): boolean {
    return !!this.form.controls.observation.value.trim();
  }
  private canChangeTooth(tooth: string): boolean {
    if (tooth === this.selectedTooth() || !this.hasPendingFindingDetail()) return true;
    this.clear();
    this.error.set('Registra o borra el detalle del hallazgo antes de cambiar de pieza.');
    return false;
  }
}
