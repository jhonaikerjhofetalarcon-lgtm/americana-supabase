import { Injectable } from '@angular/core';

interface SupabaseLikeError { code?: string; message?: string; }

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

@Injectable({ providedIn: 'root' })
export class SupabaseErrorService {
  toUserMessage(error: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (error instanceof UserFacingError) return error.message;
    if ((error as { name?: string } | null)?.name === 'TimeoutError') {
      return 'La consulta tardó demasiado. Vuelve a intentarlo.';
    }
    const candidate = error as SupabaseLikeError | null;
    if (candidate?.code === '23505') return 'Ya existe un registro con esos datos.';
    if (candidate?.code === '42501') return 'No tienes permiso para realizar esta operación.';
    if (candidate?.code === 'P0001' && candidate.message) return candidate.message;
    if (candidate?.message?.includes('Invalid login credentials')) return 'Usuario o contraseña incorrectos.';
    if (candidate?.message?.includes('Usuario o contraseña incorrectos')) return 'Usuario o contraseña incorrectos.';
    if (candidate?.message?.includes('cuenta está deshabilitada')) return candidate.message;
    if (candidate?.message?.includes('perfil activo')) return candidate.message;
    if (candidate?.message?.includes('Email not confirmed')) return 'La cuenta todavía no fue confirmada.';
    if (candidate?.message?.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.';
    if (candidate?.message?.includes('Demasiados intentos fallidos')) return candidate.message;
    if (candidate?.message?.includes('Failed to fetch') || candidate?.message?.includes('fetch failed')) {
      return 'No se pudo conectar con Supabase. Verifica Internet e inténtalo nuevamente.';
    }
    return fallback;
  }
}
