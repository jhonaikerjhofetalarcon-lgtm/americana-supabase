import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import { PatientApiService } from './patient-api.service';
import {
  ClinicalReportData,
  PatientClinicalReportService,
} from './patient-clinical-report.service';

describe('Historia clínica consolidada', () => {
  const clinical = (): ClinicalReportData => ({
    patientId: 8,
    generatedAt: '2026-09-15T12:00:00Z',
    encounters: [],
    excludedEncounters: 0,
    odontograms: [],
    plans: [],
    appointments: [],
    treatmentsIncluded: true,
    appointmentsIncluded: true,
  });
  let rpc: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let service: PatientClinicalReportService;
  beforeEach(() => {
    rpc = vi.fn().mockReturnValue(of(clinical()));
    get = vi.fn().mockReturnValue(of({ id: 8 }));
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseApiService, useValue: { rpc } },
        { provide: PatientApiService, useValue: { get } },
      ],
    });
    service = TestBed.inject(PatientClinicalReportService);
  });
  it('consulta un paciente concreto y sus registros sin iniciar atenciones', async () => {
    const result = await firstValueFrom(service.load(8));
    expect(result.patient.id).toBe(8);
    expect(get).toHaveBeenCalledWith(8);
    expect(rpc).toHaveBeenCalledWith(
      'obtener_historia_clinica_paciente',
      { paciente_id: 8 },
      expect.any(Object),
    );
  });
  it('bloquea un informe que mezcla datos de otro paciente', async () => {
    get.mockReturnValue(of({ id: 9 }));
    await expect(firstValueFrom(service.load(8))).rejects.toThrow('no corresponde');
  });
  it('rechaza borradores presentados como atenciones aprobadas', async () => {
    rpc.mockReturnValue(of({ ...clinical(), encounters: [{ patientId: 8, status: 'BORRADOR' }] }));
    await expect(firstValueFrom(service.load(8))).rejects.toThrow('no corresponde');
  });
  it('no entrega una copia parcial cuando falla la ficha', async () => {
    get.mockReturnValue(throwError(() => new Error('Ficha no disponible')));
    await expect(firstValueFrom(service.load(8))).rejects.toThrow('Ficha no disponible');
  });
  it('no entrega una copia parcial cuando falla la consulta clínica', async () => {
    rpc.mockReturnValue(throwError(() => new Error('Sin permiso')));
    await expect(firstValueFrom(service.load(8))).rejects.toThrow('Sin permiso');
  });
});
