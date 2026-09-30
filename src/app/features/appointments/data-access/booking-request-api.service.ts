import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import { BookingRequest, BookingRequestStatus } from '../models/booking-request.models';

export interface PublicBookingPayload {
  fullName: string;
  documentNumber: string | null;
  mobile: string;
  email: string | null;
  service: string;
  preferredDate: string | null;
  preferredShift: string;
  message: string | null;
  privacyConsent: boolean;
}

@Injectable({ providedIn: 'root' })
export class BookingRequestApiService {
  private readonly api = inject(SupabaseApiService);

  publicCreate(payload: PublicBookingPayload): Observable<BookingRequest> {
    return this.api.rpc<BookingRequest>('crear_solicitud_cita', { datos: this.api.toJson(payload) }, {
      errorMessage: 'No se pudo registrar la solicitud.',
    });
  }

  list(status?: BookingRequestStatus): Observable<BookingRequest[]> {
    return this.api.rpc<BookingRequest[]>('listar_solicitudes_cita', { estado_filtro: status ?? null }, {
      fallback: [], errorMessage: 'No se pudieron consultar las solicitudes.',
    });
  }

  manage(
    id: number,
    status: BookingRequestStatus,
    version: number,
    observation?: string,
    appointmentId?: number,
  ): Observable<BookingRequest> {
    const payload = { status, version, observation: observation || null, appointmentId: appointmentId ?? null };
    return this.api.rpc<BookingRequest>('gestionar_solicitud_cita', {
      solicitud_id: id, datos: this.api.toJson(payload),
    }, { errorMessage: 'No se pudo actualizar la solicitud.' });
  }
}
