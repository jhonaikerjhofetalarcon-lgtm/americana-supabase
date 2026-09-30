import { inject, Injectable } from '@angular/core';
import { from, map, Observable, switchMap } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import { DentalService, ItemStatus, PlanStatus, TreatmentPlan, SignedBudget } from '../models/treatment.models';

type TreatmentCommand =
  'CREAR' | 'AGREGAR_ITEM' | 'RETIRAR_ITEM' | 'REVISAR' | 'ESTADO' | 'ESTADO_ITEM' | 'EVOLUCION';
type TreatmentItemPayload = {
  serviceId: number;
  tooth: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  sessions: number;
};
type EvolutionPayload = {
  encounterId: number;
  procedure: string;
  observations: string | null;
  nextSession: string | null;
};

@Injectable({ providedIn: 'root' })
export class TreatmentApiService {
  private readonly api = inject(SupabaseApiService);
  private readonly supabase = this.api.client;

  catalog(): Observable<DentalService[]> {
    return from(
      this.supabase
        .from('servicios')
        .select('*')
        .eq('activo', true)
        .order('categoria')
        .order('nombre'),
    ).pipe(
      map(({ data, error }) => {
        if (error) this.api.fail(error, 'No se pudo consultar el catálogo.');
        return (data ?? []).map(
          (row) =>
            ({
              id: row.id,
              code: row.codigo,
              name: row.nombre,
              category: row.categoria,
              description: row.descripcion ?? undefined,
              basePrice: row.precio_base,
              suggestedSessions: row.sesiones_sugeridas,
            }) satisfies DentalService,
        );
      }),
    );
  }

  listByEncounter(encounterId: number): Observable<TreatmentPlan[]> {
    return this.api.rpc<TreatmentPlan[]>(
      'listar_planes',
      { paciente_id: null, atencion_id: encounterId },
      {
        fallback: [],
        errorMessage: 'No se pudieron consultar los planes.',
      },
    );
  }
  get(planId: number): Observable<TreatmentPlan> {
    return this.api.rpc<TreatmentPlan>('obtener_plan', { plan_id: planId }, {
      errorMessage: 'No se pudo recuperar el presupuesto.',
    });
  }
  budgetAgreement(planId: number): Observable<SignedBudget | null> {
    return this.api.rpc<SignedBudget | null>('obtener_acuerdo_presupuesto', { plan_id: planId }, {
      fallback: null, errorMessage: 'No se pudo consultar la firma del presupuesto.',
    });
  }
  signBudget(planId: number, version: number, signatureData: string): Observable<SignedBudget> {
    return this.api.rpc<SignedBudget>('firmar_presupuesto', {
      datos: this.api.toJson({ planId, version, signatureData, confirmation: true }),
    }, { errorMessage: 'No se pudo guardar el presupuesto firmado.' });
  }

  create(patientId: number, encounterId: number): Observable<TreatmentPlan> {
    return this.command('CREAR', { patientId, encounterId, observations: null });
  }
  addItem(id: number, payload: TreatmentItemPayload): Observable<TreatmentPlan> {
    return this.command('AGREGAR_ITEM', { planId: id, ...payload });
  }
  removeItem(id: number, itemId: number, version: number): Observable<TreatmentPlan> {
    return this.command('RETIRAR_ITEM', { planId: id, itemId, version });
  }
  revise(
    id: number,
    discount: number,
    observations: string | null,
    version: number,
  ): Observable<TreatmentPlan> {
    return this.command('REVISAR', { planId: id, discount, observations, version });
  }
  status(
    id: number,
    status: PlanStatus,
    patientAcceptance: boolean,
    version: number,
  ): Observable<TreatmentPlan> {
    return this.command('ESTADO', { planId: id, status, patientAcceptance, version });
  }
  itemStatus(
    id: number,
    itemId: number,
    status: ItemStatus,
    version: number,
  ): Observable<TreatmentPlan> {
    return this.command('ESTADO_ITEM', { planId: id, itemId, status, version });
  }
  evolution(id: number, itemId: number, payload: EvolutionPayload): Observable<TreatmentPlan> {
    return this.command('EVOLUCION', {
      planId: id,
      itemId,
      ...payload,
      professionalConfirmation: true,
    });
  }

  private command(action: TreatmentCommand, payload: object): Observable<TreatmentPlan> {
    return this.api
      .rpc<number>(
        'gestionar_plan',
        { accion: action, datos: this.api.toJson(payload) },
        {
          errorMessage: 'No se pudo actualizar el plan de tratamiento.',
        },
      )
      .pipe(
        switchMap((id) =>
          this.api.rpc<TreatmentPlan>(
            'obtener_plan',
            { plan_id: Number(id) },
            {
              errorMessage: 'No se pudo recuperar el plan.',
            },
          ),
        ),
      );
  }
}
