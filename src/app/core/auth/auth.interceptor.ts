import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const supabaseOrigin = new URL(environment.supabaseUrl).origin;
const isSupabaseRequest = (url: string) => url === supabaseOrigin || url.startsWith(`${supabaseOrigin}/`);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const belongsToSupabase = isSupabaseRequest(request.url);
  const authenticatedRequest = token && belongsToSupabase
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(catchError((error: { status?: number }) => {
    if (belongsToSupabase && error.status === 401) {
      auth.logout();
      void router.navigate(['/sistema/login']);
    }
    return throwError(() => error);
  }));
};
