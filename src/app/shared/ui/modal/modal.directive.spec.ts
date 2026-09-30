import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalDirective } from './modal.directive';

@Component({
  imports: [ModalDirective],
  template: `
    <button id="opener" (click)="open.set(true)">Abrir</button>
    @if (open()) {
      <section appModal aria-labelledby="title" [modalDismissDisabled]="saving()"
        (modalDismiss)="open.set(false)">
        <h2 id="title">Revisar cita</h2>
        <button id="first">Primera acción</button>
        <button id="last">Última acción</button>
      </section>
    }
  `,
})
class ModalHost {
  readonly open = signal(false);
  readonly saving = signal(false);
}

describe('ModalDirective', () => {
  let fixture: ComponentFixture<ModalHost>;

  beforeEach(async () => {
    // jsdom has no layout. Supply visible geometry; keyboard/focus behavior remains real CDK.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    await TestBed.configureTestingModule({ imports: [ModalHost] }).compileComponents();
    fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('expone el diálogo con nombre y mueve el foco dentro al abrir', () => {
    const dialog = fixture.nativeElement.querySelector('section') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('title');
    expect(document.activeElement?.id).toBe('first');
  });

  it('redirige el foco al cruzar los límites de Tab y Mayús+Tab', () => {
    const anchors = fixture.nativeElement.querySelectorAll('.cdk-focus-trap-anchor');
    expect(anchors.length).toBe(2);
    (anchors[0] as HTMLElement).focus();
    expect(document.activeElement?.id).toBe('last');
    (anchors[1] as HTMLElement).focus();
    expect(document.activeElement?.id).toBe('first');
  });

  it('cierra con Escape y devuelve el foco al botón que abrió la ventana', () => {
    const first = fixture.nativeElement.querySelector('#first') as HTMLButtonElement;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(false);
    expect(document.activeElement?.id).toBe('opener');
  });

  it('no descarta un formulario mientras está guardando', () => {
    fixture.componentInstance.saving.set(true);
    fixture.detectChanges();
    const first = fixture.nativeElement.querySelector('#first') as HTMLButtonElement;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('respeta Escape si un control interior ya lo ha utilizado', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    fixture.nativeElement.querySelector('#first').dispatchEvent(event);
    expect(fixture.componentInstance.open()).toBe(true);
  });
});
