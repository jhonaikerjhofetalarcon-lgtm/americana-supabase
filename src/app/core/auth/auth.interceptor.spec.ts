import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  const logout = vi.fn();
  const navigate = vi.fn(() => Promise.resolve(true));

  beforeEach(() => {
    logout.mockClear();
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { token: signal('access-token'), logout } },
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  it('agrega el token únicamente a solicitudes dirigidas a Supabase', async () => {
    const request = new HttpRequest('GET', `${environment.supabaseUrl}/rest/v1/pacientes`);
    let authorization: string | null = null;

    await TestBed.runInInjectionContext(() => firstValueFrom(authInterceptor(request, (handled) => {
      authorization = handled.headers.get('Authorization');
      return of(new HttpResponse({ status: 200 }));
    })));

    expect(authorization).toBe('Bearer access-token');
  });

  it('no expone el token a servicios externos', async () => {
    const request = new HttpRequest('GET', 'https://example.com/public');
    let authorization: string | null = null;

    await TestBed.runInInjectionContext(() => firstValueFrom(authInterceptor(request, (handled) => {
      authorization = handled.headers.get('Authorization');
      return of(new HttpResponse({ status: 200 }));
    })));

    expect(authorization).toBeNull();
  });

  it('cierra la sesión ante un 401 proveniente de Supabase', async () => {
    const request = new HttpRequest('GET', `${environment.supabaseUrl}/rest/v1/pacientes`);
    await expect(TestBed.runInInjectionContext(() => firstValueFrom(authInterceptor(
      request,
      () => throwError(() => new HttpErrorResponse({ status: 401 })),
    )))).rejects.toBeTruthy();

    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/sistema/login']);
  });
});
