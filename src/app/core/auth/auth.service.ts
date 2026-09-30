import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { from, map, switchMap } from 'rxjs';
import { SupabaseClientService } from '../supabase/supabase-client.service';
import { CurrentUser, LoginResponse } from './auth.models';

interface UserContextPayload {
  id: number;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

interface UsernameSessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly readyPromise: Promise<void>;

  readonly token = signal<string | null>(null);
  readonly currentUser = signal<CurrentUser | null>(null);
  readonly authenticated = computed(() => Boolean(this.token() && this.currentUser()));

  constructor() {
    this.readyPromise = this.restoreSession();
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.applyToken(session);
      if (event === 'SIGNED_OUT' || !session) {
        this.clearUser();
        return;
      }
      // Keep the auth callback synchronous and read the profile after its internal lock is released.
      globalThis.setTimeout(() => void this.loadCurrentUser(), 0);
    });
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  login(username: string, password: string) {
    return from(this.loginInternal(username, password));
  }

  logout(): void {
    this.token.set(null);
    this.clearUser();
    void this.supabase.auth.signOut({ scope: 'local' });
  }

  changePassword(currentPassword: string, newPassword: string, confirmation: string) {
    if (newPassword !== confirmation) throw new Error('La confirmación de contraseña no coincide.');
    return from(this.supabase.auth.getUser()).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user.email) throw error ?? new Error('La sesión no tiene un correo de autenticación.');
        return this.supabase.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
      }),
      switchMap(({ error }) => {
        if (error) throw error;
        return this.supabase.auth.updateUser({ password: newPassword });
      }),
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  requestPasswordReset(email: string) {
    return from(this.supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/sistema/login`,
    })).pipe(map(({ error }) => { if (error) throw error; }));
  }

  updateRecoveredPassword(newPassword: string) {
    return from(this.supabase.auth.updateUser({ password: newPassword })).pipe(
      map(({ error }) => { if (error) throw error; }),
    );
  }

  hasPermission(permission: string): boolean {
    return this.currentUser()?.permissions.includes(permission) ?? false;
  }

  private async restoreSession(): Promise<void> {
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error || !data.session) {
        this.token.set(null);
        this.clearUser();
        return;
      }
      this.applyToken(data.session);
      const user = await this.loadCurrentUser();
      if (user) return;
      this.token.set(null);
      await this.supabase.auth.signOut({ scope: 'local' });
    } catch {
      this.token.set(null);
      this.clearUser();
    }
  }

  private async loginInternal(identifierValue: string, password: string): Promise<LoginResponse> {
    await this.readyPromise;
    const identifier = identifierValue.trim().toLowerCase();
    const invoked = await this.supabase.functions.invoke<UsernameSessionPayload>('auth-login', {
      body: { identifier, password },
    });
    if (invoked.error) throw await this.edgeFunctionError(invoked.error);
    if (!invoked.data?.accessToken || !invoked.data.refreshToken) {
      throw new Error('Supabase no devolvió una sesión válida.');
    }
    const restored = await this.supabase.auth.setSession({
      access_token: invoked.data.accessToken,
      refresh_token: invoked.data.refreshToken,
    });
    if (restored.error) throw restored.error;
    const session: Session | null = restored.data.session;

    if (!session) throw new Error('Supabase no devolvió una sesión válida.');
    this.applyToken(session);
    const user = await this.loadCurrentUser();
    if (!user) {
      this.token.set(null);
      await this.supabase.auth.signOut({ scope: 'local' });
      throw new Error('El usuario autenticado no tiene un perfil activo en el sistema.');
    }
    return {
      accessToken: session.access_token,
      tokenType: 'Bearer',
      expiresInSeconds: session.expires_in,
      user,
    };
  }

  private async edgeFunctionError(error: unknown): Promise<Error> {
    const response = (error as { context?: unknown } | null)?.context;
    if (response instanceof Response) {
      const payload = await response.clone().json().catch(() => null) as { message?: string } | null;
      if (payload?.message) return new Error(payload.message);
    }
    return error instanceof Error ? error : new Error('No se pudo validar el acceso.');
  }

  private applyToken(session: Session | null): void {
    this.token.set(session?.access_token ?? null);
  }

  private async loadCurrentUser(): Promise<CurrentUser | null> {
    const { data, error } = await this.supabase.rpc('current_user_context');
    if (error || !data) {
      this.clearUser();
      return null;
    }
    const payload = data as unknown as Partial<UserContextPayload>;
    if (!Number.isInteger(payload.id) || typeof payload.username !== 'string'
      || typeof payload.fullName !== 'string' || !Array.isArray(payload.roles)
      || !payload.roles.every((item) => typeof item === 'string')
      || !Array.isArray(payload.permissions)
      || !payload.permissions.every((item) => typeof item === 'string')) {
      this.clearUser();
      return null;
    }
    const user: CurrentUser = {
      id: payload.id as number,
      username: payload.username,
      fullName: payload.fullName,
      roles: payload.roles,
      permissions: payload.permissions,
    };
    this.currentUser.set(user);
    return user;
  }

  private clearUser(): void {
    this.currentUser.set(null);
  }
}
