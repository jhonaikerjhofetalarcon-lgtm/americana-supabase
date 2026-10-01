import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideBell,
  LucideBot,
  LucideCalendarDays,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMenu,
  LucideMessageCircle,
  LucideSearch,
  LucideSettings,
  LucideStethoscope,
  LucideUsers,
  LucideWalletCards,
} from '@lucide/angular';
import { AuthService } from '../core/auth/auth.service';
import { canLeaveEditor, PendingChangesEditor } from '../core/navigation/pending-changes.guard';

@Component({
  selector: 'app-system-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideBell,
    LucideBot,
    LucideCalendarDays,
    LucideLayoutDashboard,
    LucideLogOut,
    LucideMenu,
    LucideMessageCircle,
    LucideSearch,
    LucideSettings,
    LucideStethoscope,
    LucideUsers,
    LucideWalletCards,
  ],
  templateUrl: './system-shell.html',
  styleUrl: './system-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemShell {
  @ViewChild(RouterOutlet) private outlet?: RouterOutlet;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly menuOpen = signal(false);
  readonly user = this.auth.currentUser;
  readonly canUseAgenda = computed(() => this.auth.hasPermission('CITA_LEER'));
  readonly canUsePatients = computed(() => this.auth.hasPermission('PACIENTE_LEER'));
  readonly canUseClinical = computed(() => this.auth.hasPermission('CLINICA_LEER'));
  readonly canUseFinance = computed(() => this.auth.hasPermission('FINANZA_LEER'));
  readonly canUseFollowUp = computed(() => this.auth.hasPermission('SEGUIMIENTO_LEER'));
  readonly canUseCopilot = computed(() => this.auth.hasPermission('IA_LEER'));
  readonly canUseAdmin = computed(() => this.auth.hasPermission('USUARIO_LEER'));
  readonly initials = computed(
    () =>
      this.user()
        ?.fullName.split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase() || 'DA',
  );
  readonly role = computed(() => {
    const roles = this.user()?.roles ?? [];
    if (roles.includes('ADMINISTRADOR') && roles.includes('ODONTOLOGO')) {
      return 'Propietario odontólogo';
    }
    return roles[0]?.replaceAll('_', ' ').toLowerCase() || 'Personal';
  });

  searchPatient(value: string): void {
    const query = value.trim();
    if (!query) return;
    void this.router.navigate(['/sistema/pacientes'], { queryParams: { q: query } });
  }

  logout(): void {
    const editor = this.outlet?.isActivated
      ? (this.outlet.component as Partial<PendingChangesEditor>)
      : null;
    if (
      editor &&
      typeof editor.hasUnsavedChanges === 'function' &&
      typeof editor.isSavingChanges === 'function' &&
      !canLeaveEditor(editor as PendingChangesEditor)
    )
      return;
    this.auth.logout();
    void this.router.navigate(['/sistema/login']);
  }
}
