import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../supabase/supabase-client.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const session = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'auth-user-id', email: 'dental@americana.com' },
  };
  const context = {
    id: 1,
    username: 'dental',
    fullName: 'Dental Americana',
    roles: ['ADMINISTRADOR'],
    permissions: ['PACIENTE_LEER'],
  };

  let invoke: ReturnType<typeof vi.fn>;
  let signInWithPassword: ReturnType<typeof vi.fn>;
  let setSession: ReturnType<typeof vi.fn>;
  let service: AuthService;

  beforeEach(() => {
    invoke = vi.fn(() => Promise.resolve({
      data: { accessToken: 'access-token', refreshToken: 'refresh-token', expiresInSeconds: 3600 },
      error: null,
    }));
    signInWithPassword = vi.fn(() => Promise.resolve({ data: { session }, error: null }));
    setSession = vi.fn(() => Promise.resolve({ data: { session }, error: null }));
    const client = {
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(),
        signInWithPassword,
        setSession,
        signOut: vi.fn(() => Promise.resolve({ error: null })),
      },
      functions: { invoke },
      rpc: vi.fn(() => Promise.resolve({ data: context, error: null })),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseClientService, useValue: { client } }],
    });
    service = TestBed.inject(AuthService);
  });

  it('resuelve el nombre de usuario mediante la función segura y persiste la sesión', async () => {
    const result = await firstValueFrom(service.login(' DENTAL ', 'secreto'));

    expect(invoke).toHaveBeenCalledWith('auth-login', {
      body: { identifier: 'dental', password: 'secreto' },
    });
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(result.user.username).toBe('dental');
    expect(service.authenticated()).toBe(true);
  });

  it('usa el mismo flujo seguro para el acceso con correo electrónico', async () => {
    await firstValueFrom(service.login(' DENTAL@AMERICANA.COM ', 'secreto'));

    expect(invoke).toHaveBeenCalledWith('auth-login', {
      body: { identifier: 'dental@americana.com', password: 'secreto' },
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
