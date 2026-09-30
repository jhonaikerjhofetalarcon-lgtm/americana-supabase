import { Injectable, inject } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import { Appointment } from '../../appointments/models/appointment.models';
import { ClinicalEncounter } from '../../clinical/models/clinical.models';
import { Odontogram } from '../../odontogram/models/odontogram.models';
import { TreatmentPlan } from '../../treatments/models/treatment.models';
import { PatientDetail } from '../models/patient.models';
import { PatientApiService } from './patient-api.service';

export interface ClinicalReportData {
  patientId: number;
  generatedAt: string;
  encounters: ClinicalEncounter[];
  excludedEncounters: number;
  odontograms: Odontogram[];
  plans: TreatmentPlan[];
  appointments: Appointment[];
  treatmentsIncluded: boolean;
  appointmentsIncluded: boolean;
}
export interface PatientClinicalReport extends ClinicalReportData {
  patient: PatientDetail;
}

@Injectable({ providedIn: 'root' })
export class PatientClinicalReportService {
  private readonly api = inject(SupabaseApiService);
  private readonly patients = inject(PatientApiService);

  load(patientId: number) {
    return forkJoin({
      patient: this.patients.get(patientId),
      clinical: this.api.rpc<ClinicalReportData>(
        'obtener_historia_clinica_paciente',
        { paciente_id: patientId },
        { errorMessage: 'No se pudo cargar la historia clínica completa.' },
      ),
    }).pipe(
      map(({ patient, clinical }): PatientClinicalReport => {
        if (
          patient.id !== patientId ||
          clinical.patientId !== patientId ||
          clinical.encounters.some((a) => a.patientId !== patientId || a.status !== 'FINALIZADA') ||
          clinical.odontograms.some(
            (o) =>
              o.patientId !== patientId ||
              o.status !== 'APROBADO' ||
              !clinical.encounters.some((a) => a.id === o.encounterId),
          ) ||
          clinical.plans.some((p) => p.patientId !== patientId || p.status === 'BORRADOR') ||
          clinical.appointments.some((a) => a.patientId !== patientId)
        ) {
          throw new Error(
            'La información recibida no corresponde al informe de este paciente. Actualiza e inténtalo nuevamente.',
          );
        }
        return { ...clinical, patient };
      }),
    );
  }
}
