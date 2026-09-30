import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  CONDITION_OPTIONS,
  centerSurfaceFor,
  conditionColor,
  lateralSurface,
  surfaceFinding,
  surfaceName,
  verticalSurface,
} from '../../models/odontogram-presentation';
import { OdontogramFinding, ToothSurface, TreatmentState } from '../../models/odontogram.models';

const TREATMENT_NAMES: Record<TreatmentState, string> = {
  EXISTENTE: 'Existente',
  INDICADO: 'Indicado',
  REALIZADO: 'Realizado',
};

@Component({
  selector: 'app-tooth-surface-map',
  templateUrl: './tooth-surface-map.html',
  styleUrl: './tooth-surface-map.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToothSurfaceMap {
  readonly tooth = input.required<string>();
  readonly findings = input<OdontogramFinding[]>([]);
  readonly selectedSurface = input<ToothSurface | null>(null);
  readonly disabled = input(false);
  readonly surfaceSelected = output<ToothSurface>();

  private readonly toothFindings = computed(() =>
    this.findings().filter((finding) => finding.tooth === this.tooth()),
  );
  readonly absent = computed(() =>
    this.toothFindings().some((finding) => finding.condition === 'AUSENTE'),
  );
  readonly surfaces = computed(() => {
    const tooth = this.tooth();
    const positions: Array<{ position: string; surface: ToothSurface }> = [
      { position: 'top', surface: verticalSurface(tooth, 'top') },
      { position: 'left', surface: lateralSurface(tooth, 'left') },
      { position: 'center', surface: centerSurfaceFor(tooth) },
      { position: 'right', surface: lateralSurface(tooth, 'right') },
      { position: 'bottom', surface: verticalSurface(tooth, 'bottom') },
    ];
    return positions.map(({ position, surface }) => {
      const name = surfaceName(tooth, surface);
      const finding = surfaceFinding(this.toothFindings(), surface);
      const condition = finding
        ? CONDITION_OPTIONS.find((option) => option.value === finding.condition)?.label
        : undefined;
      const status = finding
        ? `${condition ?? finding.condition}, ${TREATMENT_NAMES[finding.treatmentState]}`
        : 'Sin hallazgo';
      return {
        position,
        surface,
        abbreviation: name[0],
        color: finding ? conditionColor(finding.condition) : '#f8fafc',
        hasFinding: !!finding,
        treatmentState: finding?.treatmentState,
        description: `${name} de la pieza ${tooth}: ${status}`,
      };
    });
  });

  selectSurface(surface: ToothSurface): void {
    if (!this.disabled()) this.surfaceSelected.emit(surface);
  }
}
