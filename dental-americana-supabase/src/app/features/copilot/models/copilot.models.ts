export type AiDraftType =
  | 'RESUMEN_HISTORIA'
  | 'BORRADOR_EVOLUCION'
  | 'INDICACIONES_POSTCONSULTA'
  | 'VERIFICACION_CIERRE'
  | 'PLAN_TRATAMIENTO'
  | 'ALERTAS_CLINICAS'
  | 'RESUMEN_PARA_PACIENTE';
export type AiDraftStatus = 'BORRADOR' | 'APROBADO' | 'RECHAZADO';
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatReply {
  content: string;
  mode: 'ai' | 'basic';
}
export interface AiDraft {
  id: number;
  encounterId: number;
  patientId: number;
  type: AiDraftType;
  status: AiDraftStatus;
  content: string;
  missingFields: string[];
  warning: string;
  rejectionReason?: string;
  generatedBy: number;
  generatedAt: string;
  reviewedBy?: number;
  reviewedAt?: string;
  version: number;
}
