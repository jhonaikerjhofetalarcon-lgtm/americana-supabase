import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { canLeaveEditor, pendingChangesGuard, protectBeforeUnload } from './pending-changes.guard';

describe('Protección de cambios pendientes', () => {
  afterEach(() => vi.restoreAllMocks());
  it('no bloquea la salida cuando la sesión ya terminó', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { authenticated: () => false } },
    ] });
    const confirm = vi.spyOn(window, 'confirm');
    const allowed = TestBed.runInInjectionContext(() => pendingChangesGuard(
      { hasUnsavedChanges: () => true, isSavingChanges: () => false },
      {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot,
    ));
    expect(allowed).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('no permite salir durante una operación de guardado', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(canLeaveEditor({ hasUnsavedChanges: () => false, isSavingChanges: () => true })).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('conserva el editor cuando se cancela el descarte', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(canLeaveEditor({ hasUnsavedChanges: () => true, isSavingChanges: () => false })).toBe(false);
  });
  it('permite salir tras confirmar el descarte', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(canLeaveEditor({ hasUnsavedChanges: () => true, isSavingChanges: () => false })).toBe(true);
  });
  it('no interrumpe la navegación de un registro guardado', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(canLeaveEditor({ hasUnsavedChanges: () => false, isSavingChanges: () => false })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('solicita la advertencia nativa al recargar con un borrador pendiente', () => {
    const event = new Event('beforeunload', { cancelable: true });
    protectBeforeUnload(event, { hasUnsavedChanges: () => true, isSavingChanges: () => false });
    expect(event.defaultPrevented).toBe(true);
  });
});
