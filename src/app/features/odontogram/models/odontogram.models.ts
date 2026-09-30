export type DentitionType='PERMANENTE'|'INFANTIL';export type OdontogramStatus='BORRADOR'|'APROBADO';
export type ToothSurface='GENERAL'|'OCLUSAL'|'INCISAL'|'MESIAL'|'DISTAL'|'VESTIBULAR'|'LINGUAL_PALATINA';
export type ToothCondition='CARIES'|'RESTAURACION'|'CORONA'|'AUSENTE'|'EXTRACCION_INDICADA'|'ENDODONCIA'|'FRACTURA'|'SELLANTE'|'PROTESIS'|'IMPLANTE'|'MOVILIDAD'|'OTRO';
export type TreatmentState='EXISTENTE'|'INDICADO'|'REALIZADO';
export interface OdontogramFinding{id:number;tooth:string;surface:ToothSurface;condition:ToothCondition;treatmentState:TreatmentState;observation?:string;createdAt:string;updatedAt:string;version:number;}
export interface Odontogram{id:number;encounterId:number;patientId:number;dentitionType:DentitionType;status:OdontogramStatus;generalObservation?:string;approvedBy?:number;approvedAt?:string;createdAt:string;updatedAt:string;version:number;findings:OdontogramFinding[];}
