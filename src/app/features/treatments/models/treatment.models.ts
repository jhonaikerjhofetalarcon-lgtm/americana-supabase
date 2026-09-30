export type PlanStatus =
  'BORRADOR' | 'PRESENTADO' | 'ACEPTADO' | 'RECHAZADO' | 'EN_PROCESO' | 'COMPLETADO' | 'CANCELADO';
export type ItemStatus = 'PROPUESTO' | 'ACEPTADO' | 'EN_PROCESO' | 'COMPLETADO' | 'CANCELADO';
export interface DentalService {
  id: number;
  code: string;
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  suggestedSessions: number;
}
export interface TreatmentEvolution {
  id: number;
  itemId: number;
  encounterId?: number;
  date: string;
  procedure: string;
  observations?: string;
  nextSession?: string;
  approvedBy: number;
}
export interface TreatmentItem {
  id: number;
  serviceId: number;
  serviceName: string;
  tooth?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  sessions: number;
  status: ItemStatus;
  version: number;
  evolutions: TreatmentEvolution[];
}
export interface TreatmentPlan {
  id: number;
  patientId: number;
  patientName: string;
  encounterId?: number;
  code: string;
  status: PlanStatus;
  discount: number;
  subtotal: number;
  total: number;
  observations?: string;
  patientAccepted: boolean;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  items: TreatmentItem[];
}
export interface SignedBudget {
  plan: TreatmentPlan;
  signatureData: string;
  signedAt: string;
  registeredBy: number;
  currentStatus: PlanStatus;
}
