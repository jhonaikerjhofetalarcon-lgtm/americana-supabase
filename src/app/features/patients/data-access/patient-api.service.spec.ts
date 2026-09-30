import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { PatientPayload } from '../models/patient.models';
import { PatientApiService } from './patient-api.service';

class EmptySearchBuilder {
  readonly filters: Array<[string, unknown]> = [];

  select() { return this; }
  or(value: string) { this.filters.push(['or', value]); return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  lte(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  gt(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  gte(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  lt(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order() { return this; }
  range() { return Promise.resolve({ data: [], count: 0, error: null }); }
}

describe('PatientApiService', () => {
  let service: PatientApiService;
  let builder: EmptySearchBuilder;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    builder = new EmptySearchBuilder();
    rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: 'test stop' } }));
    const client = { from: vi.fn(() => builder), rpc };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseClientService, useValue: { client } },
      ],
    });
    service = TestBed.inject(PatientApiService);
  });

  it('builds patient search filters without empty values', async () => {
    const result = await firstValueFrom(service.search({ q: 'Ana', active: true, sex: '', page: 0, size: 20 }));
    expect(builder.filters).toContainEqual(['activo', true]);
    expect(builder.filters.some(([key, value]) => key === 'or' && String(value).includes('Ana'))).toBe(true);
    expect(builder.filters.some(([key]) => key === 'sexo')).toBe(false);
    expect(result.content).toEqual([]);
  });

  it('sends the complete payload to the patient RPC', async () => {
    const payload: PatientPayload = {
      documentType: 'DNI', documentNumber: '12345678', firstNames: 'Ana', paternalSurname: 'Torres',
      maternalSurname: null, birthDate: '1990-05-20', sex: 'FEMENINO', birthPlace: null,
      occupation: null, maritalStatus: null, educationLevel: null, religion: null,
      ethnicSelfIdentification: null, mobile: '940577075', whatsappConsent: true,
      phone: null, email: null, address: null,
      responsibleName: null, responsibleDocument: null, responsibleRelationship: null,
      responsiblePhone: null, emergencyContact: null,
    };
    await expect(firstValueFrom(service.create(payload))).rejects.toThrow('No se pudo crear el paciente.');
    expect(rpc).toHaveBeenCalledWith('crear_paciente', { datos: expect.objectContaining({ documentNumber: '12345678' }) });
  });

  it('rejects unsupported files before sending them to private Storage', async () => {
    const file = new File(['contenido'], 'nota.txt', { type: 'text/plain' });
    await expect(firstValueFrom(service.uploadFile(8, file, 'DOCUMENTO'))).rejects.toThrow('Solo se permiten PDF, JPG y PNG.');
  });
});
