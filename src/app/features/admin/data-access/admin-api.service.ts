import { inject, Injectable, Injector } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import {
  AuditEntry,
  OperationalSummary,
  PageResult,
  Role,
  Setting,
  UserAccount,
} from '../models/admin.models';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly api = inject(SupabaseApiService);
  private readonly injector = inject(Injector);

  users(): Observable<UserAccount[]> {
    return this.rpc<UserAccount[]>('listar_usuarios', {}, []);
  }
  roles(): Observable<Role[]> {
    return this.rpc<Role[]>('listar_roles', {}, []);
  }
  createUser(payload: {
    username: string;
    password: string;
    fullName: string;
    email: string | null;
    roles: string[];
  }): Observable<UserAccount> {
    return this.api.invoke<UserAccount>('admin-create-user', payload, {
      errorMessage: 'No se pudo crear el usuario.',
    });
  }
  status(id: number, active: boolean): Observable<UserAccount> {
    return this.rpc<UserAccount>('cambiar_estado_usuario', {
      usuario_id: id,
      nuevo_activo: active,
    });
  }
  changePassword(
    currentPassword: string,
    newPassword: string,
    confirmation: string,
  ): Observable<void> {
    return this.injector
      .get(AuthService)
      .changePassword(currentPassword, newPassword, confirmation);
  }
  settings(): Observable<Setting[]> {
    return this.rpc<Setting[]>('listar_configuracion', {}, []);
  }
  updateSetting(key: string, value: string, version: number): Observable<Setting> {
    return this.rpc<Setting>('actualizar_configuracion', {
      clave: key,
      valor: value,
      version_actual: version,
    });
  }
  audit(fromValue: string, to: string, q = ''): Observable<PageResult<AuditEntry>> {
    return this.rpc<PageResult<AuditEntry>>('consultar_auditoria', {
      desde: fromValue,
      hasta: to,
      busqueda: q.trim() || null,
      pagina: 0,
      tamano: 50,
    });
  }
  summary(fromValue: string, to: string): Observable<OperationalSummary> {
    return this.rpc<OperationalSummary>('resumen_operacional', { desde: fromValue, hasta: to });
  }
  export(fromValue: string, to: string): Observable<Blob> {
    return this.summary(fromValue, to).pipe(
      map(
        (s) =>
          new Blob(
            [
              `\uFEFFREPORTE OPERATIVO Y FINANCIERO - DENTAL AMERICANA\nDesde,${s.from}\nHasta,${s.to}\n\nIndicador,Valor\nPacientes registrados,${s.patients}\nCitas del periodo,${s.appointments}\nCitas confirmadas,${s.confirmedAppointments}\nAtenciones finalizadas,${s.completedEncounters}\nIngresos,${s.income}\nGastos,${s.expenses}\nResultado,${s.net}\nCuentas por cobrar,${s.receivables}\nAlertas de seguimiento,${s.followUpAlerts}\nMensajes fallidos,${s.failedMessages}\n\nNota,Reporte administrativo sujeto a validación contable y tributaria.\n`,
            ],
            { type: 'text/csv;charset=utf-8' },
          ),
      ),
    );
  }

  private rpc<T>(name: string, args: Record<string, unknown>, fallback?: T): Observable<T> {
    const options =
      fallback === undefined
        ? { errorMessage: 'No se pudo completar la operación administrativa.' }
        : { errorMessage: 'No se pudo completar la operación administrativa.', fallback };
    return this.api.rpc<T>(name, args, options);
  }
}
