export type AppointmentStatus = 'Confirmada' | 'En espera' | 'En atención' | 'Por confirmar' | 'Finalizada' | 'Cancelada' | 'No asistió';
export interface Appointment { readonly id:number; readonly patientId:number; readonly time:string; readonly patient:string; readonly initials:string; readonly service:string; readonly reason:string; readonly status:AppointmentStatus; readonly duration:string; readonly phone:string; readonly tone:'blue'|'green'|'amber'|'purple'; }
export interface DashboardMetric { readonly label:string; readonly value:string; readonly detail:string; readonly tone:'blue'|'green'|'amber'|'rose'; }
export interface PendingTask { readonly id:number; readonly title:string; readonly detail:string; readonly kind:'alert'|'payment'|'approval'; readonly route:string; }
