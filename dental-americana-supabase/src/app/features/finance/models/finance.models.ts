export type ReceivableStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'ANULADA';
export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  referenceRequired: boolean;
}
export interface Account {
  id: number;
  planId: number;
  patientId: number;
  patientName: string;
  planCode: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: ReceivableStatus;
  dueDate?: string;
  updatedAt: string;
  version: number;
}
export interface CashSession {
  id: number;
  openedBy: number;
  openedAt: string;
  openingAmount: number;
  status: 'ABIERTA' | 'CERRADA';
  closedBy?: number;
  closedAt?: string;
  expectedAmount?: number;
  countedAmount?: number;
  difference?: number;
  closingObservation?: string;
  version: number;
}
export interface Payment {
  id: number;
  accountId: number;
  patientId: number;
  patientName: string;
  planId: number;
  planCode: string;
  cashSessionId: number;
  paymentMethodId: number;
  paymentMethod: string;
  amount: number;
  reference?: string;
  receiptNumber: string;
  status: string;
  registeredAt: string;
  version?: number;
  voidedAt?: string;
  voidedBy?: number;
  voidReason?: string;
}
export interface SignedPaymentAgreement {
  payment: Payment;
  agreement: {
    patientName: string;
    patientDocument?: string | null;
    planCode: string;
    planTotal: number;
    paidBefore: number;
    paymentAmount: number;
    paidAfter: number;
    balanceAfter: number;
    terms: string;
    items: { name: string; tooth?: string | null; quantity: number; subtotal: number }[];
  };
  signatureData: string;
}
export interface Expense {
  id: number;
  cashSessionId: number;
  category: string;
  description: string;
  provider?: string;
  documentReference?: string;
  paymentMethodId: number;
  paymentMethod: string;
  amount: number;
  status: string;
  registeredAt: string;
}
export interface Movement {
  id: number;
  cashSessionId: number;
  type: 'INGRESO' | 'EGRESO';
  category: string;
  source: string;
  sourceId: number;
  paymentMethod?: string;
  amount: number;
  description: string;
  createdAt: string;
}
export interface FinanceDashboard {
  voidedPaymentsCount?: number;
  voidedAmount?: number;
  income: number;
  expenses: number;
  net: number;
  receivable: number;
  cashIncome: number;
  digitalIncome: number;
  paymentsCount: number;
  expensesCount: number;
  recentMovements: Movement[];
}
