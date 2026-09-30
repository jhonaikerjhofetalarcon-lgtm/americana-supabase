import { OdontogramFinding, ToothCondition, ToothSurface } from './odontogram.models';

export const CONDITION_OPTIONS: ReadonlyArray<{
  value: ToothCondition;
  label: string;
  color: string;
}> = [
  { value: 'CARIES', label: 'Caries', color: '#ef4444' },
  { value: 'RESTAURACION', label: 'Restauración', color: '#3b82f6' },
  { value: 'CORONA', label: 'Corona', color: '#8b5cf6' },
  { value: 'AUSENTE', label: 'Ausente', color: '#64748b' },
  { value: 'EXTRACCION_INDICADA', label: 'Extracción', color: '#f97316' },
  { value: 'ENDODONCIA', label: 'Endodoncia', color: '#a855f7' },
  { value: 'FRACTURA', label: 'Fractura', color: '#e11d48' },
  { value: 'SELLANTE', label: 'Sellante', color: '#06b6d4' },
  { value: 'PROTESIS', label: 'Prótesis', color: '#7c3aed' },
  { value: 'IMPLANTE', label: 'Implante', color: '#475569' },
  { value: 'MOVILIDAD', label: 'Movilidad', color: '#eab308' },
  { value: 'OTRO', label: 'Otro', color: '#0f766e' },
];

export function conditionColor(condition: ToothCondition): string {
  return CONDITION_OPTIONS.find((option) => option.value === condition)?.color ?? '#0f766e';
}

export function centerSurfaceFor(tooth: string): ToothSurface {
  return Number(tooth[1]) <= 3 ? 'INCISAL' : 'OCLUSAL';
}

export function lateralSurface(tooth: string, side: 'left' | 'right'): ToothSurface {
  const mesialOnRight = ['1', '4', '5', '8'].includes(tooth[0]);
  return (side === 'right') === mesialOnRight ? 'MESIAL' : 'DISTAL';
}

export function verticalSurface(tooth: string, side: 'top' | 'bottom'): ToothSurface {
  const isUpper = ['1', '2', '5', '6'].includes(tooth[0]);
  return (side === 'top') === isUpper ? 'VESTIBULAR' : 'LINGUAL_PALATINA';
}

export function surfaceName(tooth: string, surface: ToothSurface): string {
  const resolved =
    surface === 'OCLUSAL' || surface === 'INCISAL' ? centerSurfaceFor(tooth) : surface;
  const names: Record<ToothSurface, string> = {
    GENERAL: 'General',
    OCLUSAL: 'Oclusal',
    INCISAL: 'Incisal',
    MESIAL: 'Mesial',
    DISTAL: 'Distal',
    VESTIBULAR: 'Vestibular',
    LINGUAL_PALATINA: ['1', '2', '5', '6'].includes(tooth[0]) ? 'Palatina' : 'Lingual',
  };
  return names[resolved];
}

/** Specific surfaces take priority; array order resolves findings of equal specificity. */
export function surfaceFinding(
  findings: readonly OdontogramFinding[],
  surface: ToothSurface,
): OdontogramFinding | undefined {
  let general: OdontogramFinding | undefined;
  for (let index = findings.length - 1; index >= 0; index--) {
    const finding = findings[index];
    if (finding.surface === surface) return finding;
    if (!general && finding.surface === 'GENERAL') general = finding;
  }
  return general;
}
