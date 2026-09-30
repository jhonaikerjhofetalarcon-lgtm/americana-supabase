export interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  email?: string;
  active: boolean;
  locked: boolean;
  lastAccess?: string;
  roles: string[];
}
export interface Role {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}
export type StaffProfile = 'PROPIETARIO_ODONTOLOGO' | 'ODONTOLOGO' | 'RECEPCION' | 'CAJA';

export interface StaffProfileOption {
  code: StaffProfile;
  name: string;
  description: string;
  roles: readonly string[];
}
export interface Setting {
  key: string;
  value: string;
  description: string;
  updatedBy?: number;
  updatedAt: string;
  version: number;
}
export interface AuditEntry {
  id: number;
  userId?: number;
  username?: string;
  action: string;
  resource: string;
  resourceId?: string;
  result: string;
  ip?: string;
  detail?: string;
  createdAt: string;
}
export interface PageResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
export interface OperationalSummary {
  patients: number;
  appointments: number;
  confirmedAppointments: number;
  completedEncounters: number;
  income: number;
  expenses: number;
  net: number;
  receivables: number;
  followUpAlerts: number;
  failedMessages: number;
  from: string;
  to: string;
}
