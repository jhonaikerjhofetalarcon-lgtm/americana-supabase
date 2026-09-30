import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { SystemShell } from './system-shell';

describe('Cierre de sesión con cambios clínicos', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup(saving = false, roles: readonly string[] = []) {
    const logout = vi.fn();
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            logout,
            currentUser: signal(
              roles.length
                ? {
                    id: 1,
                    username: 'propietario',
                    fullName: 'Dra. Ana Torres',
                    roles,
                    permissions: [],
                  }
                : null,
            ),
            hasPermission: () => true,
          },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    const shell = TestBed.runInInjectionContext(() => new SystemShell());
    Object.defineProperty(shell, 'outlet', {
      value: {
        isActivated: true,
        component: { hasUnsavedChanges: () => true, isSavingChanges: () => saving },
      },
    });
    return { shell, logout, navigate };
  }

  it('no cierra la sesión ni navega si el usuario conserva el borrador', () => {
    const { shell, logout, navigate } = setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    shell.logout();
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cierra sesión después de confirmar el descarte', () => {
    const { shell, logout, navigate } = setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    shell.logout();
    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/sistema/login']);
  });

  it('espera que termine el guardado antes de permitir cerrar sesión', () => {
    const { shell, logout } = setup(true);
    const confirm = vi.spyOn(window, 'confirm');
    shell.logout();
    expect(logout).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('identifica claramente la cuenta con administración y firma clínica', () => {
    const { shell } = setup(false, ['ADMINISTRADOR', 'ODONTOLOGO']);
    expect(shell.role()).toBe('Propietario odontólogo');
  });
});
