export type ClinicalStatus = 'BORRADOR' | 'FINALIZADA' | 'ANULADA';
export interface ClinicalEncounter {
  id: number; patientId: number; patientHistoryNumber: string; patientName: string; patientAge: number;
  appointmentId?: number; dentistId: number; dentistName: string; encounterDate: string; status: ClinicalStatus;
  consultationReason?: string; illnessDuration?: string; signsSymptoms?: string; chronologicalStory?: string;
  systolicPressure?: number; diastolicPressure?: number; pulse?: number; temperature?: number;
  respiratoryRate?: number; weightKg?: number; heightCm?: number; generalExam?: string; dentalExam?: string;
  diagnosis?: string; workPlan?: string; prognosis?: string; evolution?: string; instructions?: string;
  nextControlDate?: string; discharged: boolean; dischargeObservation?: string; patientConsent: boolean;
  approvedBy?: number; approvedAt?: string; createdAt: string; updatedAt: string; version: number;
}
export interface ClinicalPayload {
  consultationReason: string | null; illnessDuration: string | null; signsSymptoms: string | null;
  chronologicalStory: string | null; systolicPressure: number | null; diastolicPressure: number | null;
  pulse: number | null; temperature: number | null; respiratoryRate: number | null; weightKg: number | null;
  heightCm: number | null; generalExam: string | null; dentalExam: string | null; diagnosis: string | null;
  workPlan: string | null; prognosis: string | null; evolution: string | null; instructions: string | null;
  nextControlDate: string | null; discharged: boolean; dischargeObservation: string | null;
  patientConsent: boolean; version: number;
}
