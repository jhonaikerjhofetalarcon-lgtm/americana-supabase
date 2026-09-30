import { inject, Injectable } from '@angular/core';
import { from, map, Observable, switchMap } from 'rxjs';
import { Json } from '../../../core/supabase/database.types';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import {
  DentitionType,
  Odontogram,
  ToothCondition,
  ToothSurface,
  TreatmentState,
} from '../models/odontogram.models';

type FindingPayload = {
  tooth: string;
  surface: ToothSurface;
  condition: ToothCondition;
  treatmentState: TreatmentState;
  observation: string | null;
  version: number;
};
type OdontogramMutation =
  | 'inicializar_odontograma'
  | 'observar_odontograma'
  | 'registrar_hallazgo_odontograma'
  | 'retirar_hallazgo_odontograma'
  | 'aprobar_odontograma';

@Injectable({ providedIn: 'root' })
export class OdontogramApiService {
  private readonly api = inject(SupabaseApiService);
  private readonly supabase = this.api.client;

  list(encounterId: number): Observable<Odontogram[]> {
    return this.api.rpc<Odontogram[]>(
      'listar_odontogramas',
      { atencion_id: encounterId },
      {
        fallback: [],
        errorMessage: 'No se pudieron consultar los odontogramas.',
      },
    );
  }

  initialize(encounterId: number, dentitionType: DentitionType): Observable<Odontogram> {
    return this.mutate('inicializar_odontograma', {
      atencion_id: encounterId,
      tipo_denticion: dentitionType,
      observacion: null,
    });
  }

  observe(id: number, generalObservation: string, version: number): Observable<Odontogram> {
    return this.mutate('observar_odontograma', {
      odontograma_id: id,
      observacion: generalObservation,
      version_actual: version,
    });
  }

  addFinding(id: number, payload: FindingPayload): Observable<Odontogram> {
    return this.mutate('registrar_hallazgo_odontograma', {
      odontograma_id: id,
      datos: this.toJson(payload),
    });
  }

  removeFinding(id: number, findingId: number, version: number): Observable<Odontogram> {
    return this.mutate('retirar_hallazgo_odontograma', {
      odontograma_id: id,
      hallazgo_id: findingId,
      version_actual: version,
    });
  }

  approve(id: number, version: number): Observable<Odontogram> {
    return this.mutate('aprobar_odontograma', {
      odontograma_id: id,
      version_actual: version,
      confirmar_aprobacion: true,
    });
  }

  private mutate(
    name: 'inicializar_odontograma',
    args: { atencion_id: number; tipo_denticion: string; observacion: null },
  ): ReturnType<OdontogramApiService['findById']>;
  private mutate(
    name: 'observar_odontograma',
    args: { odontograma_id: number; observacion: string; version_actual: number },
  ): ReturnType<OdontogramApiService['findById']>;
  private mutate(
    name: 'registrar_hallazgo_odontograma',
    args: { odontograma_id: number; datos: Json },
  ): ReturnType<OdontogramApiService['findById']>;
  private mutate(
    name: 'retirar_hallazgo_odontograma',
    args: { odontograma_id: number; hallazgo_id: number; version_actual: number },
  ): ReturnType<OdontogramApiService['findById']>;
  private mutate(
    name: 'aprobar_odontograma',
    args: { odontograma_id: number; version_actual: number; confirmar_aprobacion: boolean },
  ): ReturnType<OdontogramApiService['findById']>;
  private mutate(name: OdontogramMutation, args: Record<string, unknown>): Observable<Odontogram> {
    return this.api
      .rpc<number>(name, args, {
        errorMessage: 'No se pudo actualizar el odontograma.',
      })
      .pipe(switchMap((id) => this.findById(Number(id))));
  }

  private findById(id: number): Observable<Odontogram> {
    return from(
      this.supabase
        .from('odontogramas' as never)
        .select('atencion_id')
        .eq('id', id)
        .single(),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) this.api.fail(error, 'Odontograma no encontrado.');
        const row = data as unknown as { atencion_id: number };
        return this.list(row.atencion_id).pipe(
          map((items) => {
            const item = items.find((value) => value.id === id);
            return item ?? this.api.fail(null, 'Odontograma no encontrado.');
          }),
        );
      }),
    );
  }

  private toJson(value: object): Json {
    return this.api.toJson(value);
  }
}
