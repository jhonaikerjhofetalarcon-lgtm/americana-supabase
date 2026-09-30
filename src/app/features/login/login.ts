import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideEye, LucideEyeOff, LucideLockKeyhole, LucideShieldCheck, LucideUserRound } from '@lucide/angular';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SupabaseErrorService } from '../../core/supabase/supabase-error.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, LucideArrowLeft, LucideEye, LucideEyeOff, LucideLockKeyhole, LucideShieldCheck, LucideUserRound],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly errors = inject(SupabaseErrorService);

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(60)]],
    password: ['', [Validators.required, Validators.maxLength(100)]],
  });

  constructor() {
    void this.redirectAuthenticatedUser();
  }

  submit(): void {
    this.error.set(null);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: () => void this.router.navigateByUrl(this.safeReturnUrl()),
      error: (error: unknown) => this.error.set(this.errors.toUserMessage(
        error,
        'No pudimos iniciar sesión. Inténtalo nuevamente.',
      )),
    });
  }

  private safeReturnUrl(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    return (target === '/sistema' || target?.startsWith('/sistema/')) && target !== '/sistema/login'
      ? target
      : '/sistema/inicio';
  }

  private async redirectAuthenticatedUser(): Promise<void> {
    await this.auth.whenReady();
    if (this.auth.authenticated()) await this.router.navigateByUrl(this.safeReturnUrl());
  }
}
