import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  centerSurfaceFor,
  conditionColor,
  lateralSurface,
  surfaceFinding,
  surfaceName,
  verticalSurface,
} from '../../models/odontogram-presentation';
import { OdontogramFinding, ToothSurface } from '../../models/odontogram.models';
import { ToothSurfaceMap } from './tooth-surface-map';

function finding(overrides: Partial<OdontogramFinding> = {}): OdontogramFinding {
  return {
    id: 1,
    tooth: '11',
    surface: 'MESIAL',
    condition: 'CARIES',
    treatmentState: 'INDICADO',
    createdAt: '2026-09-14T10:00:00',
    updatedAt: '2026-09-14T10:00:00',
    version: 0,
    ...overrides,
  };
}

describe('Odontogram presentation: existing FDI orientation', () => {
  it.each([
    ['11', 'DISTAL', 'MESIAL', 'VESTIBULAR', 'LINGUAL_PALATINA', 'Palatina'],
    ['21', 'MESIAL', 'DISTAL', 'VESTIBULAR', 'LINGUAL_PALATINA', 'Palatina'],
    ['31', 'MESIAL', 'DISTAL', 'LINGUAL_PALATINA', 'VESTIBULAR', 'Lingual'],
    ['41', 'DISTAL', 'MESIAL', 'LINGUAL_PALATINA', 'VESTIBULAR', 'Lingual'],
    ['51', 'DISTAL', 'MESIAL', 'VESTIBULAR', 'LINGUAL_PALATINA', 'Palatina'],
    ['61', 'MESIAL', 'DISTAL', 'VESTIBULAR', 'LINGUAL_PALATINA', 'Palatina'],
    ['71', 'MESIAL', 'DISTAL', 'LINGUAL_PALATINA', 'VESTIBULAR', 'Lingual'],
    ['81', 'DISTAL', 'MESIAL', 'LINGUAL_PALATINA', 'VESTIBULAR', 'Lingual'],
  ] as const)(
    'preserves all surface positions for tooth %s',
    (tooth, left, right, top, bottom, inner) => {
      expect(lateralSurface(tooth, 'left')).toBe(left);
      expect(lateralSurface(tooth, 'right')).toBe(right);
      expect(verticalSurface(tooth, 'top')).toBe(top);
      expect(verticalSurface(tooth, 'bottom')).toBe(bottom);
      expect(surfaceName(tooth, 'LINGUAL_PALATINA')).toBe(inner);
      expect(centerSurfaceFor(tooth)).toBe('INCISAL');
    },
  );

  it.each(['14', '26', '38', '45', '54', '65', '74', '85'])(
    'uses the existing occlusal center for posterior tooth %s',
    (tooth) => expect(centerSurfaceFor(tooth)).toBe('OCLUSAL'),
  );

  it('keeps a specific surface visible when a general finding is added later', () => {
    const specific = finding();
    const general = finding({ id: 2, surface: 'GENERAL', condition: 'RESTAURACION' });
    const findings = [specific, general];

    expect(surfaceFinding(findings, 'MESIAL')).toBe(specific);
    expect(surfaceFinding(findings, 'DISTAL')).toBe(general);
    expect(findings).toEqual([specific, general]);
  });

  it('uses the last finding in array order among equally specific findings', () => {
    const first = finding({ id: 1 });
    const last = finding({ id: 2, condition: 'SELLANTE' });
    const generalFirst = finding({ id: 3, surface: 'GENERAL' });
    const generalLast = finding({ id: 4, surface: 'GENERAL', condition: 'CORONA' });

    expect(surfaceFinding([first, last, generalFirst, generalLast], 'MESIAL')).toBe(last);
    expect(surfaceFinding([first, last, generalFirst, generalLast], 'DISTAL')).toBe(generalLast);
    expect(surfaceFinding([generalFirst, generalLast], 'GENERAL')).toBe(generalLast);
    expect(surfaceFinding([], 'MESIAL')).toBeUndefined();
  });
});

describe('ToothSurfaceMap', () => {
  let fixture: ComponentFixture<ToothSurfaceMap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ToothSurfaceMap] }).compileComponents();
    fixture = TestBed.createComponent(ToothSurfaceMap);
    fixture.componentRef.setInput('tooth', '11');
    fixture.detectChanges();
  });

  function button(surface: ToothSurface): HTMLButtonElement {
    return fixture.nativeElement.querySelector(`[data-surface="${surface}"]`);
  }

  it('renders five named native buttons with visible surface abbreviations', () => {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    expect(buttons).toHaveLength(5);
    expect(buttons.map((element) => element.textContent?.trim())).toEqual([
      'V',
      'D',
      'I',
      'M',
      'P',
    ]);
    expect(button('MESIAL').getAttribute('aria-label')).toBe('Mesial de la pieza 11: Sin hallazgo');
    expect(button('MESIAL').getAttribute('aria-pressed')).toBe('false');
    expect(buttons.every((element) => element.type === 'button')).toBe(true);
  });

  it('uses specific finding color and announces its condition and treatment state', () => {
    fixture.componentRef.setInput('findings', [
      finding(),
      finding({
        id: 2,
        surface: 'GENERAL',
        condition: 'RESTAURACION',
        treatmentState: 'REALIZADO',
      }),
    ]);
    fixture.detectChanges();

    expect(button('MESIAL').style.getPropertyValue('--surface-color')).toBe(
      conditionColor('CARIES'),
    );
    expect(button('DISTAL').style.getPropertyValue('--surface-color')).toBe(
      conditionColor('RESTAURACION'),
    );
    expect(button('MESIAL').getAttribute('aria-label')).toBe(
      'Mesial de la pieza 11: Caries, Indicado',
    );
    expect(button('DISTAL').title).toBe('Distal de la pieza 11: Restauración, Realizado');
  });

  it('emits selection without changing its input or findings', () => {
    const selected = vi.fn();
    fixture.componentInstance.surfaceSelected.subscribe(selected);
    button('MESIAL').click();

    expect(selected).toHaveBeenCalledExactlyOnceWith('MESIAL');
    expect(fixture.componentInstance.selectedSurface()).toBeNull();
    expect(fixture.componentInstance.findings()).toEqual([]);
  });

  it('reflects the selected surface through aria-pressed and its outline class', () => {
    fixture.componentRef.setInput('selectedSurface', 'MESIAL');
    fixture.detectChanges();

    expect(button('MESIAL').getAttribute('aria-pressed')).toBe('true');
    expect(button('MESIAL').classList.contains('is-selected')).toBe(true);
    expect(button('DISTAL').getAttribute('aria-pressed')).toBe('false');
  });

  it('blocks output when disabled, including direct handler calls', () => {
    const selected = vi.fn();
    fixture.componentInstance.surfaceSelected.subscribe(selected);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    button('MESIAL').click();
    fixture.componentInstance.selectSurface('MESIAL');

    expect(button('MESIAL').disabled).toBe(true);
    expect(selected).not.toHaveBeenCalled();
  });

  it('ignores findings from other teeth and renders the absent indicator as decoration', () => {
    fixture.componentRef.setInput('findings', [finding({ tooth: '21', condition: 'AUSENTE' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.absence-mark')).toBeNull();
    expect(button('MESIAL').getAttribute('aria-label')).toContain('Sin hallazgo');

    fixture.componentRef.setInput('findings', [
      finding({ surface: 'GENERAL', condition: 'AUSENTE' }),
    ]);
    fixture.detectChanges();
    const mark: HTMLElement = fixture.nativeElement.querySelector('.absence-mark');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(button('MESIAL').getAttribute('aria-label')).toContain('Ausente');
  });
});
