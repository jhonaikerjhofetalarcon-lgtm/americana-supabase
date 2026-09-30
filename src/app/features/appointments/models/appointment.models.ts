export type AppointmentStatus =
  | 'PENDIENTE_CONFIRMACION'
  | 'CONFIRMADA'
  | 'SOLICITUD_REPROGRAMACION'
  | 'EN_ESPERA'
  | 'EN_ATENCION'
  | 'COMPLETADA'
  | 'CANCELADA'
  | 'NO_ASISTIO';
export type AppointmentSource = 'RECEPCION' | 'WHATSAPP' | 'WEB' | 'ODONTOLOGO' | 'SISTEMA';

export interface AppointmentType {
  id: number;
  code: string;
  name: string;
  durationMinutes: number;
  color: string;
}
export interface Professional {
  id: number;
  fullName: string;
}
export interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
  unavailableReason?: string;
}
export interface Appointment {
  id: number;
  patientId: number;
  patientHistoryNumber: string;
  patientName: string;
  patientMobile?: string;
  professionalId: number;
  professionalName: string;
  appointmentTypeId: number;
  appointmentTypeName: string;
  appointmentTypeColor: string;
  durationMinutes: number;
  start: string;
  end: string;
  status: AppointmentStatus;
  reason: string;
  notes?: string;
  source: AppointmentSource;
  cancellationReason?: string;
  confirmationSent: boolean;
  reminderScheduled: boolean;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface AppointmentPayload {
  patientId: number;
  professionalId: number;
  appointmentTypeId: number;
  start: string;
  reason: string;
  notes: string | null;
  source: AppointmentSource;
  version?: number;
}

export type BookingAppointmentPayload = Omit<AppointmentPayload, 'patientId'> & {
  patientId: number | null;
};
