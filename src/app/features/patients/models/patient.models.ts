export type DocumentType = 'DNI' | 'CE' | 'PASAPORTE' | 'SIN_DOCUMENTO';
export type PatientSex = 'FEMENINO' | 'MASCULINO' | 'OTRO' | 'NO_ESPECIFICA';
export type HistoryType = 'MEDICO' | 'FAMILIAR' | 'QUIRURGICO' | 'ODONTOLOGICO' | 'HABITO' | 'OTRO';
export type HistoryStatus = 'ACTIVO' | 'CONTROLADO' | 'RESUELTO' | 'NO_ESPECIFICA';
export type AllergySeverity = 'LEVE' | 'MODERADA' | 'SEVERA';
export type AllergyStatus = 'ACTIVA' | 'INACTIVA' | 'DESCARTADA';
export type PatientFileCategory =
  'DOCUMENTO' | 'CONSENTIMIENTO' | 'RADIOGRAFIA' | 'FOTOGRAFIA' | 'INFORME' | 'OTRO';

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface PatientSummary {
  id: number;
  historyNumber: string;
  documentType: DocumentType;
  documentNumber?: string;
  fullName: string;
  birthDate: string;
  age: number;
  sex: PatientSex;
  mobile?: string;
  whatsappConsent: boolean;
  email?: string;
  activeAllergies: number;
  active: boolean;
  createdAt: string;
  version: number;
}

export interface EmergencyContact {
  id: number;
  fullName: string;
  relationship: string;
  phone: string;
  primary: boolean;
  createdAt: string;
}
export interface PatientHistory {
  id: number;
  type: HistoryType;
  description: string;
  status: HistoryStatus;
  observation?: string;
  reportedDate?: string;
  createdAt: string;
}
export interface PatientAllergy {
  id: number;
  substance: string;
  reaction?: string;
  severity: AllergySeverity;
  status: AllergyStatus;
  observation?: string;
  createdAt: string;
}
export interface PatientMedication {
  id: number;
  medication: string;
  dose?: string;
  frequency?: string;
  reason?: string;
  startDate?: string;
  endDate?: string;
  current: boolean;
  createdAt: string;
}
export interface PatientFile {
  id: number;
  category: PatientFileCategory;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  description?: string;
  createdAt: string;
}

export interface PatientDetail {
  id: number;
  historyNumber: string;
  documentType: DocumentType;
  documentNumber?: string;
  firstNames: string;
  paternalSurname: string;
  maternalSurname?: string;
  birthDate: string;
  age: number;
  sex: PatientSex;
  birthPlace?: string;
  occupation?: string;
  maritalStatus?: string;
  educationLevel?: string;
  religion?: string;
  ethnicSelfIdentification?: string;
  mobile?: string;
  phone?: string;
  whatsappConsent: boolean;
  whatsappConsentAt?: string;
  whatsappConsentBy?: number;
  whatsappRevokedAt?: string;
  email?: string;
  address?: string;
  responsibleName?: string;
  responsibleDocument?: string;
  responsibleRelationship?: string;
  responsiblePhone?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  emergencyContacts: EmergencyContact[];
  histories: PatientHistory[];
  allergies: PatientAllergy[];
  medications: PatientMedication[];
  files: PatientFile[];
}

export interface EmergencyContactRequest {
  fullName: string;
  relationship: string;
  phone: string;
  primary: boolean;
}
export interface PatientPayload {
  documentType: DocumentType;
  documentNumber: string | null;
  firstNames: string;
  paternalSurname: string;
  maternalSurname: string | null;
  birthDate: string;
  sex: PatientSex;
  birthPlace: string | null;
  occupation: string | null;
  maritalStatus: string | null;
  educationLevel: string | null;
  religion: string | null;
  ethnicSelfIdentification: string | null;
  mobile: string | null;
  whatsappConsent: boolean;
  phone: string | null;
  email: string | null;
  address: string | null;
  responsibleName: string | null;
  responsibleDocument: string | null;
  responsibleRelationship: string | null;
  responsiblePhone: string | null;
  emergencyContact?: EmergencyContactRequest | null;
  version?: number;
}
export interface DuplicateCandidate {
  id: number;
  historyNumber: string;
  fullName: string;
  documentNumber?: string;
  mobile?: string;
  reason: string;
}
export interface HistoryPayload {
  type: HistoryType;
  description: string;
  status: HistoryStatus;
  observation?: string | null;
  reportedDate?: string | null;
}
export interface AllergyPayload {
  substance: string;
  reaction?: string | null;
  severity: AllergySeverity;
  status: AllergyStatus;
  observation?: string | null;
}
export interface MedicationPayload {
  medication: string;
  dose?: string | null;
  frequency?: string | null;
  reason?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current: boolean;
}
