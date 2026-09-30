import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Directive, inject, input, output } from '@angular/core';

/** Adds keyboard behavior to existing modal layouts without replacing their styles. */
@Directive({
  selector: '[appModal]',
  hostDirectives: [CdkTrapFocus],
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class ModalDirective {
  readonly modalDismissDisabled = input(false);
  readonly modalDismiss = output<void>();

  constructor() {
    // The CDK captures focus on opening, keeps Tab inside, and restores focus on removal.
    inject(CdkTrapFocus).autoCapture = true;
  }

  protected onEscape(event: Event): void {
    // Let a nested control (e.g. a combobox) consume Escape first.
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.modalDismissDisabled()) this.modalDismiss.emit();
  }
}
