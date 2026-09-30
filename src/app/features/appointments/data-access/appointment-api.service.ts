import { inject, Injectable } from '@angular/core';
import { from, map, Observable, switchMap } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import {
  Appointment,
  BookingAppointmentPayload,
  AppointmentPayload,
  AppointmentStatus,
  AppointmentType,
  AvailabilitySlot,
  Professional,
} from '../models/appointment.models';

@Injectable({ providedIn: 'root' })
export class AppointmentApiService {
  private readonly api = inject(SupabaseApiService);
  private readonly supabase = this.api.client;

  list(
    fromValue: string,
    toValue: string,
    professionalId?: number,
    status?: AppointmentStatus | '',
  ): Observable<Appointment[]> {
    return this.api.rpc<Appointment[]>(
      'listar_citas',
      {
        desde: fromValue,
        hasta: toValue,
        profesional_id: professionalId ?? null,
        estado_filtro: status || null,
      },
      { fallback: [], errorMessage: 'No se pudo consultar la agenda.' },
    );
  }

  get(id: number): Observable<Appointment> {
    return this.api.rpc<Appointment>(
      'obtener_cita',
      { cita_id: id },
      {
        errorMessage: 'Cita no encontrada.',
      },
    );
  }

  types(): Observable<AppointmentType[]> {
    return from(
      this.supabase.from('tipos_cita').select('*').eq('activo', true).order('nombre'),
    ).pipe(
      map(({ data, error }) => {
        if (error) this.api.fail(error, 'No se pudieron cargar los tipos de cita.');
        return (data ?? []).map(
          (item) =>
            ({
              id: item.id,
              code: item.codigo,
              name: item.nombre,
              durationMinutes: item.duracion_minutos,
              color: item.color,
            }) satisfies AppointmentType,
        );
      }),
    );
  }

  professionals(): Observable<Professional[]> {
    return this.api
      .rpc<Array<{ id: number; full_name: string }>>(
        'listar_profesionales',
        {},
        {
          fallback: [],
          errorMessage: 'No se pudieron cargar los odontólogos.',
        },
      )
      .pipe(
        map((items) =>
          items.map((item) => ({ id: item.id, fullName: item.full_name }) satisfies Professional),
        ),
      );
  }

  availability(
    professionalId: number,
    date: string,
    appointmentTypeId: number,
  ): Observable<AvailabilitySlot[]> {
    return this.api.rpc<AvailabilitySlot[]>(
      'disponibilidad_cita',
      {
        profesional_id: professionalId,
        fecha: date,
        tipo_cita_id: appointmentTypeId,
      },
      { fallback: [], errorMessage: 'No se pudo consultar la disponibilidad.' },
    );
  }

  create(payload: AppointmentPayload): Observable<Appointment> {
    return this.api
      .rpc<number>(
        'crear_cita',
        { datos: this.api.toJson(payload) },
        {
          errorMessage: 'No se pudo crear la cita.',
        },
      )
      .pipe(switchMap((appointmentId) => this.get(Number(appointmentId))));
  }

  createFromRequest(
    requestId: number,
    requestVersion: number,
    payload: BookingAppointmentPayload,
  ): Observable<Appointment> {
    return this.api
      .rpc<number>(
        'crear_cita_desde_solicitud',
        {
          solicitud_id: requestId,
          version_actual: requestVersion,
          datos: this.api.toJson(payload),
        },
        { errorMessage: 'No se pudo crear la cita desde la solicitud.' },
      )
      .pipe(switchMap((appointmentId) => this.get(Number(appointmentId))));
  }

  update(id: number, payload: AppointmentPayload & { version: number }): Observable<Appointment> {
    return this.api
      .rpc<number>(
        'actualizar_cita',
        { cita_id: id, datos: this.api.toJson(payload) },
        {
          errorMessage: 'No se pudo reprogramar la cita.',
        },
      )
      .pipe(switchMap((appointmentId) => this.get(Number(appointmentId))));
  }

  changeStatus(
    id: number,
    status: AppointmentStatus,
    version: number,
    reason?: string,
  ): Observable<Appointment> {
    return this.api
      .rpc<number>(
        'cambiar_estado_cita',
        {
          cita_id: id,
          nuevo_estado: status,
          version_actual: version,
          motivo_value: reason || null,
        },
        { errorMessage: 'No se pudo cambiar el estado de la cita.' },
      )
      .pipe(switchMap((appointmentId) => this.get(Number(appointmentId))));
  }
}
