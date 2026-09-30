import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { READ_REQUEST_TIMEOUT_MS } from '../../../../core/supabase/request-timeout';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseErrorService } from '../../../../core/supabase/supabase-error.service';
import { ClinicalEncounter } from '../../../clinical/models/clinical.models';
import { CONDITION_OPTIONS, surfaceName } from '../../../odontogram/models/odontogram-presentation';
import { Odontogram, OdontogramFinding } from '../../../odontogram/models/odontogram.models';
import { ToothSurfaceMap } from '../../../odontogram/ui/tooth-surface-map/tooth-surface-map';
import {
  PatientClinicalReportService,
  PatientClinicalReport,
} from '../../data-access/patient-clinical-report.service';
import { PatientApiService } from '../../data-access/patient-api.service';
import { PatientFile } from '../../models/patient.models';

@Component({
  selector: 'app-patient-clinical-report',
  imports: [RouterLink, DatePipe, CurrencyPipe, ToothSurfaceMap],
  templateUrl: './patient-clinical-report.html',
  styleUrl: './patient-clinical-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientClinicalReportPage implements OnInit {
  private readonly api = inject(PatientClinicalReportService);
  private readonly patients = inject(PatientApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(SupabaseErrorService);
  readonly report = signal<PatientClinicalReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly downloadError = signal('');
  readonly downloadingId = signal<number | null>(null);
  readonly patientId = Number(this.route.snapshot.paramMap.get('id'));
  private requestId = 0;
  readonly clinicalFields: { key: keyof ClinicalEncounter; label: string }[] = [
    { key: 'consultationReason', label: 'Motivo de consulta' },
    { key: 'illnessDuration', label: 'Tiempo de enfermedad' },
    { key: 'signsSymptoms', label: 'Signos y síntomas' },
    { key: 'chronologicalStory', label: 'Relato cronológico' },
    { key: 'generalExam', label: 'Examen general' },
    { key: 'dentalExam', label: 'Examen odontológico' },
    { key: 'diagnosis', label: 'Diagnóstico' },
    { key: 'workPlan', label: 'Plan de trabajo' },
    { key: 'prognosis', label: 'Pronóstico' },
    { key: 'evolution', label: 'Evolución' },
    { key: 'instructions', label: 'Indicaciones' },
    { key: 'dischargeObservation', label: 'Observación de alta' },
  ];

  ngOnInit(): void {
    this.load();
  }
  load(): void {
    if (!Number.isSafeInteger(this.patientId) || this.patientId <= 0) {
      this.loading.set(false);
      this.error.set('El identificador del paciente no es válido.');
      return;
    }
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set('');
    this.report.set(null);
    this.api
      .load(this.patientId)
      .pipe(timeout({ first: READ_REQUEST_TIMEOUT_MS }), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (requestId === this.requestId) {
            this.report.set(report);
            this.loading.set(false);
          }
        },
        error: (error: unknown) => {
          if (requestId !== this.requestId) return;
          this.loading.set(false);
          this.error.set(this.errors.toUserMessage(error, 'No se pudo preparar el informe.'));
        },
      });
  }
  print(): void {
    if (this.report() && !this.loading() && !this.error()) window.print();
  }
  odontograms(encounterId: number): Odontogram[] {
    return this.report()?.odontograms.filter((item) => item.encounterId === encounterId) ?? [];
  }
  teeth(type: string): string[][] {
    return type === 'INFANTIL'
      ? [
          ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'],
          ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'],
        ]
      : [
          [
            '18',
            '17',
            '16',
            '15',
            '14',
            '13',
            '12',
            '11',
            '21',
            '22',
            '23',
            '24',
            '25',
            '26',
            '27',
            '28',
          ],
          [
            '48',
            '47',
            '46',
            '45',
            '44',
            '43',
            '42',
            '41',
            '31',
            '32',
            '33',
            '34',
            '35',
            '36',
            '37',
            '38',
          ],
        ];
  }
  condition(finding: OdontogramFinding): string {
    return (
      CONDITION_OPTIONS.find((item) => item.value === finding.condition)?.label ?? finding.condition
    );
  }
  surface(finding: OdontogramFinding): string {
    return surfaceName(finding.tooth, finding.surface);
  }
  download(file: PatientFile): void {
    if (this.downloadingId() !== null || !this.report()) return;
    this.downloadingId.set(file.id);
    this.downloadError.set('');
    this.patients
      .downloadFile(this.patientId, file.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.downloadingId.set(null);
          if (!response.body) {
            this.downloadError.set('El archivo no está disponible.');
            return;
          }
          const url = URL.createObjectURL(response.body);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.originalName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: (error: unknown) => {
          this.downloadingId.set(null);
          this.downloadError.set(
            this.errors.toUserMessage(error, 'No se pudo descargar el archivo.'),
          );
        },
      });
  }
}
