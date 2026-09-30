import { CanDeactivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export interface PendingChangesEditor {
  hasUnsavedChanges(): boolean;
  isSavingChanges(): boolean;
}

export function canLeaveEditor(editor: PendingChangesEditor): boolean {
  if (editor.isSavingChanges()) return false;
  return !editor.hasUnsavedChanges() || window.confirm(
    'Tienes cambios sin guardar. ¿Deseas salir y descartarlos? Cancela para volver y guardarlos.',
  );
}

export const pendingChangesGuard: CanDeactivateFn<PendingChangesEditor> = (editor) =>
  !inject(AuthService).authenticated() || canLeaveEditor(editor);

export function protectBeforeUnload(event: Event, editor: PendingChangesEditor): void {
  if (!editor.hasUnsavedChanges() && !editor.isSavingChanges()) return;
  event.preventDefault();
  (event as BeforeUnloadEvent).returnValue = '';
}
