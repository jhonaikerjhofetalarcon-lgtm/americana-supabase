import { Routes } from '@angular/router';
import { pendingChangesGuard } from './core/navigation/pending-changes.guard';
import { authGuard } from './core/auth/auth.guard';
import { permissionGuard } from './core/auth/permission.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  {
    path: 'sistema/login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'sistema',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/system-shell').then((m) => m.SystemShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
        data: { title: 'Inicio' },
      },
      {
        path: 'agenda',
        canActivate: [permissionGuard],
        data: { title: 'Agenda', permission: 'CITA_LEER' },
        loadComponent: () =>
          import('./features/appointments/pages/agenda/agenda').then((m) => m.Agenda),
      },
      {
        path: 'agenda/solicitudes',
        canActivate: [permissionGuard],
        data: { title: 'Solicitudes de cita', permission: 'CITA_LEER' },
        loadComponent: () =>
          import('./features/appointments/pages/booking-requests/booking-requests').then(
            (m) => m.BookingRequests,
          ),
      },
      {
        path: 'atencion/:encounterId/odontograma',
        canDeactivate: [pendingChangesGuard],
        canActivate: [permissionGuard],
        data: { title: 'Odontograma', permission: 'CLINICA_LEER' },
        loadComponent: () =>
          import('./features/odontogram/pages/odontogram-editor/odontogram-editor').then(
            (m) => m.OdontogramEditor,
          ),
      },
      {
        path: 'atencion/:encounterId/tratamiento',
        canDeactivate: [pendingChangesGuard],
        canActivate: [permissionGuard],
        data: { title: 'Tratamiento', permission: 'TRATAMIENTO_LEER' },
        loadComponent: () =>
          import('./features/treatments/pages/treatment-plan/treatment-plan').then(
            (m) => m.TreatmentPlanPage,
          ),
      },
      {
        path: 'atencion',
        canDeactivate: [pendingChangesGuard],
        canActivate: [permissionGuard],
        data: { title: 'Atención clínica', permission: 'CLINICA_LEER' },
        loadComponent: () =>
          import('./features/clinical/pages/clinical-workspace/clinical-workspace').then(
            (m) => m.ClinicalWorkspace,
          ),
      },
      {
        path: 'finanzas',
        canDeactivate: [pendingChangesGuard],
        canActivate: [permissionGuard],
        data: { title: 'Finanzas', permission: 'FINANZA_LEER' },
        loadComponent: () =>
          import('./features/finance/pages/finance-dashboard/finance-dashboard').then(
            (m) => m.FinanceDashboardPage,
          ),
      },
      {
        path: 'seguimientos',
        canActivate: [permissionGuard],
        data: { title: 'Seguimientos', permission: 'SEGUIMIENTO_LEER' },
        loadComponent: () =>
          import('./features/messaging/pages/follow-up-center/follow-up-center').then(
            (m) => m.FollowUpCenter,
          ),
      },
      {
        path: 'copiloto',
        canActivate: [permissionGuard],
        data: { title: 'DentalIA', permission: 'IA_LEER' },
        loadComponent: () =>
          import('./features/copilot/pages/copilot-workspace/copilot-workspace').then(
            (m) => m.CopilotWorkspace,
          ),
      },
      {
        path: 'pacientes',
        canActivate: [permissionGuard],
        data: { title: 'Pacientes', permission: 'PACIENTE_LEER' },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/patients/pages/patient-list/patient-list').then(
                (m) => m.PatientList,
              ),
          },
          {
            path: 'nuevo',
            canActivate: [permissionGuard],
            data: { permission: 'PACIENTE_ESCRIBIR' },
            loadComponent: () =>
              import('./features/patients/pages/patient-form/patient-form').then(
                (m) => m.PatientForm,
              ),
          },
          {
            path: ':id/editar',
            canActivate: [permissionGuard],
            data: { permission: 'PACIENTE_ESCRIBIR' },
            loadComponent: () =>
              import('./features/patients/pages/patient-form/patient-form').then(
                (m) => m.PatientForm,
              ),
          },
          {
            path: ':id/historia',
            canActivate: [permissionGuard],
            data: { title: 'Historia clínica completa', permission: 'CLINICA_LEER' },
            loadComponent: () =>
              import('./features/patients/pages/patient-clinical-report/patient-clinical-report').then(
                (m) => m.PatientClinicalReportPage,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/patients/pages/patient-detail/patient-detail').then(
                (m) => m.PatientDetailPage,
              ),
          },
        ],
      },
      {
        path: 'ajustes',
        canActivate: [permissionGuard],
        data: { title: 'Administración', permission: 'USUARIO_LEER' },
        loadComponent: () =>
          import('./features/admin/pages/admin-center/admin-center').then((m) => m.AdminCenter),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
