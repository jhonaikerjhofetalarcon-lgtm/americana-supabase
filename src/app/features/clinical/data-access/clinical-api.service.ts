import { inject, Injectable } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import { ClinicalEncounter, ClinicalPayload, ClinicalStatus } from '../models/clinical.models';

@Injectable({ providedIn: 'root' })
export class ClinicalApiService {
  private readonly api = inject(SupabaseApiService);

  search(
    from?: string,
    to?: string,
    status?: ClinicalStatus,
    patientId?: number,
  ): Observable<ClinicalEncounter[]> {
    return this.api.rpc<ClinicalEncounter[]>(
      'listar_atenciones',
      {
        desde: from ?? null,
        hasta: to ?? null,
        estado_filtro: status ?? null,
        paciente_id: patientId ?? null,
      },
      { fallback: [], errorMessage: 'No se pudo consultar la historia clínica.' },
    );
  }

  get(id: number): Observable<ClinicalEncounter> {
    return this.api.rpc<ClinicalEncounter>(
      'obtener_atencion',
      { atencion_id: id },
      {
        errorMessage: 'Atención no encontrada.',
      },
    );
  }

  start(patientId: number, appointmentId?: number): Observable<ClinicalEncounter> {
    return this.api
      .rpc<number>(
        'iniciar_atencion',
        {
          paciente_id: patientId,
          cita_id: appointmentId ?? null,
        },
        { errorMessage: 'No se pudo iniciar la atención.' },
      )
      .pipe(switchMap((id) => this.get(Number(id))));
  }

  update(id: number, payload: ClinicalPayload): Observable<ClinicalEncounter> {
    return this.api
      .rpc<number>(
        'actualizar_atencion',
        {
          atencion_id: id,
          datos: this.api.toJson(payload),
        },
        { errorMessage: 'No se pudo actualizar la atención.' },
      )
      .pipe(switchMap((encounterId) => this.get(Number(encounterId))));
  }

  finalize(id: number, version: number): Observable<ClinicalEncounter> {
    return this.api
      .rpc<number>(
        'finalizar_atencion',
        {
          atencion_id: id,
          version_actual: version,
          confirmar_aprobacion: true,
        },
        { errorMessage: 'No se pudo finalizar la atención.' },
      )
      .pipe(switchMap((encounterId) => this.get(Number(encounterId))));
  }
}
