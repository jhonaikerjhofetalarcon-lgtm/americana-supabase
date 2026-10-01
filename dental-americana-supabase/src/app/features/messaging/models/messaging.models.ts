export type MessageType =
  | 'ENTRANTE'
  | 'CITA_CONFIRMACION'
  | 'CITA_RECORDATORIO'
  | 'POSTCONSULTA'
  | 'MANUAL'
  | 'CITA_CANCELACION'
  | 'CITA_REPROGRAMACION'
  | 'CITA_CONFIRMADA'
  | 'CITA_RECORDATORIO_2H'
  | 'MENU_CITAS'
  | 'HORARIOS_CITA'
  | 'CITA_RESERVADA';
export type MessageStatus =
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'ENVIADO'
  | 'ENTREGADO'
  | 'LEIDO'
  | 'RECIBIDO'
  | 'FALLIDO'
  | 'CANCELADO';
export type ConnectionStatus = 'CONECTADO' | 'DESCONECTADO' | 'CONECTANDO' | 'ERROR';
export interface InboxPage<T> {
  items: T[];
  hasMore: boolean;
}
export interface Message {
  id: number;
  conversationId: number;
  patientId?: number;
  patientName: string;
  appointmentId?: number;
  encounterId?: number;
  direction: 'ENTRANTE' | 'SALIENTE';
  type: MessageType;
  content: string;
  status: MessageStatus;
  scheduledFor?: string;
  intent?: string;
  reviewRequired: boolean;
  errorDetail?: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  createdAt: string;
  sentAt?: string;
}
export interface ConversationAppointment {
  id: number;
  start: string;
  end: string;
  status: string;
  reason: string;
  professionalName: string;
}
export interface Conversation {
  id: number;
  patientId?: number;
  patientName: string;
  patientHistoryNumber?: string;
  phone: string;
  status: 'ABIERTA' | 'DERIVADA' | 'CERRADA';
  lastMessage: string;
  lastMessageDirection?: 'ENTRANTE' | 'SALIENTE';
  lastMessageAt?: string;
  unreadCount: number;
  appointment?: ConversationAppointment;
}
export interface WhatsAppSession {
  status: ConnectionStatus;
  provider?: 'evolution' | 'meta';
  phone?: string;
  detail?: string;
  qrCode?: string | null;
  pairingCode?: string | null;
  code?: string | null;
}
export interface AutomationSetting {
  key: string;
  value: string;
  description: string;
  version: number;
}
export interface FollowUp {
  id: number;
  patientId: number;
  patientName: string;
  encounterId: number;
  messageId?: number;
  scheduledFor: string;
  status: 'PROGRAMADO' | 'ENVIADO' | 'RESPONDIDO' | 'ALERTA' | 'REVISADO' | 'CERRADO';
  response?: string;
  classification?: string;
  alertReason?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  version: number;
}
