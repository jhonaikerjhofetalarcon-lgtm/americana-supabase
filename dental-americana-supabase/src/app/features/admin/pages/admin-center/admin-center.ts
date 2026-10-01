import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import {
  LucideActivity,
  LucideAlertTriangle,
  LucideCheck,
  LucideCircleDollarSign,
  LucideDownload,
  LucideFileClock,
  LucideLoaderCircle,
  LucideLockKeyhole,
  LucidePlus,
  LucideRefreshCw,
  LucideSave,
  LucideSettings,
  LucideShieldCheck,
  LucideUsers,
  LucideX,
} from '@lucide/angular';
import { forkJoin, Observable, timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { AdminApiService } from '../../data-access/admin-api.service';
import {
  AuditEntry,
  OperationalSummary,
  Role,
  Setting,
  StaffProfile,
  StaffProfileOption,
  UserAccount,
} from '../../models/admin.models';
type Tab = 'users' | 'settings' | 'audit' | 'reports';
@Component({
  selector: 'app-admin-center',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    LucideActivity,
    LucideAlertTriangle,
    LucideCheck,
    LucideCircleDollarSign,
    LucideDownload,
    LucideFileClock,
    LucideLoaderCircle,
    LucideLockKeyhole,
    LucidePlus,
    LucideRefreshCw,
    LucideSave,
    LucideSettings,
    LucideShieldCheck,
    LucideUsers,
    LucideX,
  ],
  templateUrl: './admin-center.html',
  styleUrl: './admin-center.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCenter implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AuthService);
  private readonly errors = inject(SupabaseErrorService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly destroyRef = inject(DestroyRef);
  private loadRequestId = 0;
  private auditRequestId = 0;
  readonly tab = signal<Tab>('users');
  readonly users = signal<UserAccount[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly settings = signal<Setting[]>([]);
  readonly audits = signal<AuditEntry[]>([]);
  readonly summary = signal<OperationalSummary | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly createOpen = signal(false);
  readonly settingDrafts = signal<Record<string, string>>({});
  readonly range = this.defaultRange();
  readonly staffProfiles: readonly StaffProfileOption[] = [
    {
      code: 'PROPIETARIO_ODONTOLOGO',
      name: 'Propietario odontólogo',
      description: 'Acceso completo, atención clínica, aprobaciones y configuración.',
      roles: ['ADMINISTRADOR', 'ODONTOLOGO'],
    },
    {
      code: 'ODONTOLOGO',
      name: 'Odontólogo',
      description: 'Pacientes, agenda, clínica, tratamientos, seguimientos y DentalIA.',
      roles: ['ODONTOLOGO'],
    },
    {
      code: 'RECEPCION',
      name: 'Recepción',
      description: 'Pacientes, agenda y comunicación, sin acceso a decisiones clínicas.',
      roles: ['RECEPCION'],
    },
    {
      code: 'CAJA',
      name: 'Caja',
      description: 'Cobros, gastos y reportes financieros.',
      roles: ['CAJA'],
    },
  ];
  readonly userForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(4),
        Validators.maxLength(60),
        Validators.pattern(/^[a-zA-Z0-9._-]+$/),
      ],
    ],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(100),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
      ],
    ],
    profile: this.fb.control<StaffProfile>('PROPIETARIO_ODONTOLOGO', Validators.required),
  });
  readonly passwordForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(100),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
      ],
    ],
    confirmation: ['', Validators.required],
  });
  ngOnInit(): void {
    this.load();
  }
  load(): void {
    const requestId = ++this.loadRequestId;
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      users: this.api.users(),
      roles: this.api.roles(),
      settings: this.api.settings(),
      audits: this.api.audit(this.range.from, this.range.to),
      summary: this.api.summary(this.range.from, this.range.to),
    })
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (requestId !== this.loadRequestId) return;
          this.users.set(r.users);
          this.roles.set(r.roles);
          this.settings.set(r.settings);
          this.settingDrafts.set(Object.fromEntries(r.settings.map((s) => [s.key, s.value])));
          this.audits.set(r.audits.content);
          this.summary.set(r.summary);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.loadRequestId) return;
          this.loading.set(false);
          this.error.set(
            this.errors.toUserMessage(error, 'No se pudo cargar el centro administrativo.'),
          );
        },
      });
  }
  openCreateUser(): void {
    if (this.saving()) return;
    this.userForm.reset({
      fullName: '',
      username: '',
      email: '',
      password: '',
      profile: 'PROPIETARIO_ODONTOLOGO',
    });
    this.error.set('');
    this.success.set('');
    this.createOpen.set(true);
  }
  createUser(): void {
    if (this.saving()) return;
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      const controls = this.userForm.controls;
      const message = controls.fullName.invalid
        ? 'Escribe el nombre completo del odontólogo (mínimo 3 caracteres).'
        : controls.username.invalid
          ? 'El usuario debe tener al menos 4 caracteres y usar solo letras, números, punto, guion o guion bajo.'
          : controls.email.invalid
            ? 'El correo electrónico no tiene un formato válido.'
            : 'La contraseña debe tener mínimo 10 caracteres, mayúscula, minúscula y número.';
      this.error.set(message);
      return;
    }
    const v = this.userForm.getRawValue();
    const profile = this.staffProfiles.find((item) => item.code === v.profile);
    if (!profile) {
      this.error.set('Selecciona un perfil de acceso válido.');
      return;
    }
    this.run(
      this.api.createUser({
        username: v.username.trim(),
        password: v.password,
        fullName: v.fullName.trim(),
        email: v.email.trim() || null,
        roles: [...profile.roles],
      }),
      `${profile.name} creado correctamente.`,
      () => {
        this.createOpen.set(false);
        this.userForm.reset();
      },
    );
  }
  changeStatus(u: UserAccount): void {
    if (this.saving() || !confirm(`¿${u.active ? 'Desactivar' : 'Activar'} a ${u.fullName}?`))
      return;
    this.run(this.api.status(u.id, !u.active), 'Estado del usuario actualizado.');
  }
  draft(key: string, value: string): void {
    this.settingDrafts.update((v) => ({ ...v, [key]: value }));
  }
  saveSetting(s: Setting): void {
    const value = (this.settingDrafts()[s.key] ?? '').trim();
    if (this.saving()) return;
    if (value.length > 500) {
      this.error.set('El valor de configuración no puede superar los 500 caracteres.');
      return;
    }
    this.run(this.api.updateSetting(s.key, value, s.version), 'Configuración guardada.');
  }
  changePassword(): void {
    if (this.saving()) return;
    const value = this.passwordForm.getRawValue();
    if (this.passwordForm.invalid || value.newPassword !== value.confirmation) {
      this.error.set(
        'La nueva contraseña debe coincidir y contener mayúscula, minúscula y número.',
      );
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .changePassword(value.currentPassword, value.newPassword, value.confirmation)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.passwordForm.reset();
          this.saving.set(false);
          this.auth.logout();
          void this.router.navigate(['/sistema/login']);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo actualizar la contraseña.'));
        },
      });
  }
  searchAudit(q: string): void {
    const requestId = ++this.auditRequestId;
    this.loading.set(true);
    this.api
      .audit(this.range.from, this.range.to, q)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (requestId !== this.auditRequestId) return;
          this.audits.set(r.content);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.auditRequestId) return;
          this.loading.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo consultar la auditoría.'));
        },
      });
  }
  download(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.api
      .export(this.range.from, this.range.to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const a = document.createElement('a');
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = 'Reporte_Dental_Americana.csv';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.exporting.set(false);
        },
        error: (error: unknown) => {
          this.exporting.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo exportar el reporte.'));
        },
      });
  }
  label(v: string): string {
    return v.replaceAll('_', ' ').toLowerCase();
  }
  profileName(roles: readonly string[]): string {
    if (roles.includes('ADMINISTRADOR') && roles.includes('ODONTOLOGO')) {
      return 'Propietario odontólogo';
    }
    return roles
      .map((role) => this.roles().find((item) => item.code === role)?.name ?? this.label(role))
      .join(' · ');
  }
  private run<T>(request: Observable<T>, message: string, done: () => void = () => {}): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(message);
        done();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errors.toUserMessage(error, 'No se pudo completar la acción.'));
      },
    });
  }
  private defaultRange(): { from: string; to: string } {
    const to = new Date();
    to.setDate(to.getDate() + 1);
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: to.toISOString() };
  }
}
