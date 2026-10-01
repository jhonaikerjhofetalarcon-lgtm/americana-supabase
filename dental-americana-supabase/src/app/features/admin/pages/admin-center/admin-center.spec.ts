import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { AdminApiService } from '../../data-access/admin-api.service';
import { AdminCenter } from './admin-center';

describe('AdminCenter: perfiles de acceso', () => {
  let page: AdminCenter;
  let createUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createUser = vi.fn(() => of({ id: 1 }));
    const api = {
      createUser,
      users: () => of([]),
      roles: () => of([]),
      settings: () => of([]),
      audit: () => of({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 }),
      summary: () => of({}),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminApiService, useValue: api },
        { provide: AuthService, useValue: { logout: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: SupabaseErrorService,
          useValue: { toUserMessage: (_: unknown, fallback: string) => fallback },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new AdminCenter());
  });

  it('crea por defecto al propietario con roles Administrador y Odontólogo', () => {
    page.userForm.setValue({
      fullName: 'Dra. Ana Torres',
      username: 'ana.torres',
      email: 'ana@example.com',
      password: 'Dental2026!',
      profile: 'PROPIETARIO_ODONTOLOGO',
    });

    page.createUser();

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['ADMINISTRADOR', 'ODONTOLOGO'],
      }),
    );
  });

  it('mantiene perfiles limitados para personal futuro', () => {
    page.userForm.setValue({
      fullName: 'María Recepción',
      username: 'maria.recepcion',
      email: '',
      password: 'Dental2026!',
      profile: 'RECEPCION',
    });

    page.createUser();

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ roles: ['RECEPCION'] }));
  });

  it('muestra un nombre claro para la cuenta con ambos roles', () => {
    expect(page.profileName(['ADMINISTRADOR', 'ODONTOLOGO'])).toBe('Propietario odontólogo');
  });
});
