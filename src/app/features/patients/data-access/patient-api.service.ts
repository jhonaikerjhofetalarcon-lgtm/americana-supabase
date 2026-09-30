import { HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { from, map, Observable, of, switchMap } from 'rxjs';
import {
  EmergencyContactRow,
  Json,
  PatientAllergyRow,
  PatientFileRow,
  PatientHistoryRow,
  PatientMedicationRow,
  PatientRow,
} from '../../../core/supabase/database.types';
import { SupabaseApiService } from '../../../core/supabase/supabase-api.service';
import {
  AllergyPayload,
  DuplicateCandidate,
  EmergencyContact,
  EmergencyContactRequest,
  HistoryPayload,
  MedicationPayload,
  PageResponse,
  PatientAllergy,
  PatientDetail,
  PatientFile,
  PatientFileCategory,
  PatientHistory,
  PatientMedication,
  PatientPayload,
  PatientSex,
  PatientSummary,
} from '../models/patient.models';

export interface PatientSearch {
  q?: string;
  active?: boolean;
  sex?: PatientSex | '';
  minAge?: number;
  maxAge?: number;
  registeredFrom?: string;
  registeredTo?: string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

@Injectable({ providedIn: 'root' })
export class PatientApiService {
  private readonly api = inject(SupabaseApiService);
  private readonly supabase = this.api.client;

  search(filter: PatientSearch): Observable<PageResponse<PatientSummary>> {
    return from(this.searchPatients(filter));
  }

  get(id: number): Observable<PatientDetail> {
    return from(this.getPatient(id));
  }

  create(payload: PatientPayload): Observable<PatientDetail> {
    return from(this.supabase.rpc('crear_paciente', { datos: this.toJson(payload) })).pipe(
      switchMap(({ data, error }) => {
        if (error || data === null) this.fail(error, 'No se pudo crear el paciente.');
        return this.get(Number(data));
      }),
    );
  }

  update(id: number, payload: PatientPayload & { version: number }): Observable<PatientDetail> {
    return from(
      this.supabase.rpc('actualizar_paciente', { paciente_id: id, datos: this.toJson(payload) }),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || data === null) this.fail(error, 'No se pudo actualizar el paciente.');
        return this.get(Number(data));
      }),
    );
  }

  changeStatus(id: number, active: boolean, version: number): Observable<PatientDetail> {
    return from(
      this.supabase.rpc('cambiar_estado_paciente', {
        paciente_id: id,
        nuevo_activo: active,
        version_actual: version,
      }),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || data === null) this.fail(error, 'No se pudo cambiar el estado del paciente.');
        return this.get(Number(data));
      }),
    );
  }

  duplicates(
    documentNumber?: string,
    mobile?: string,
    birthDate?: string,
    paternalSurname?: string,
  ): Observable<DuplicateCandidate[]> {
    if (!documentNumber && !mobile && !(birthDate && paternalSurname))
      return of<DuplicateCandidate[]>([]);
    return from(this.findDuplicates(documentNumber, mobile, birthDate, paternalSurname));
  }

  addEmergencyContact(id: number, payload: EmergencyContactRequest) {
    return this.addPatientData<EmergencyContact>('CONTACTO', id, payload);
  }
  addHistory(id: number, payload: HistoryPayload) {
    return this.addPatientData<PatientHistory>('ANTECEDENTE', id, payload);
  }
  addAllergy(id: number, payload: AllergyPayload) {
    return this.addPatientData<PatientAllergy>('ALERGIA', id, payload);
  }
  addMedication(id: number, payload: MedicationPayload) {
    return this.addPatientData<PatientMedication>('MEDICAMENTO', id, payload);
  }
  uploadFile(id: number, file: File, category: PatientFileCategory, description?: string) {
    return from(this.uploadPatientFile(id, file, category, description));
  }
  downloadFile(patientId: number, fileId: number) {
    return from(this.downloadPatientFile(patientId, fileId));
  }

  private addPatientData<T>(type: string, patientId: number, payload: object) {
    return from(
      this.supabase.rpc('agregar_dato_paciente', {
        tipo: type,
        paciente_id: patientId,
        datos: this.toJson(payload),
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) this.fail(error, 'No se pudo registrar la información del paciente.');
        return data as unknown as T;
      }),
    );
  }

  private async uploadPatientFile(
    id: number,
    file: File,
    category: PatientFileCategory,
    description?: string,
  ): Promise<PatientFile> {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!file.size || file.size > 10 * 1024 * 1024)
      this.fail(null, 'El archivo supera 10 MB o está vacío.');
    if (!allowed.includes(file.type)) this.fail(null, 'Solo se permiten PDF, JPG y PNG.');
    const originalName =
      file.name
        .replaceAll('\\', '/')
        .split('/')
        .pop()
        ?.replace(/[\r\n]/g, '_')
        .slice(0, 255) || 'archivo';
    if (!/\.(pdf|jpe?g|png)$/i.test(originalName))
      this.fail(null, 'La extensión del archivo no está permitida.');
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `pacientes/${id}/${category.toLowerCase()}/${crypto.randomUUID()}-${safeName}`;
    const upload = await this.supabase.storage
      .from('patient-files')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) this.fail(upload.error, 'No se pudo almacenar el archivo.');
    const metadata = await this.supabase.rpc('registrar_archivo_paciente', {
      paciente_id: id,
      datos: this.toJson({
        category,
        originalName,
        path,
        contentType: file.type,
        sizeBytes: file.size,
        description: description || null,
      }),
    });
    if (metadata.error || !metadata.data) {
      await this.supabase.storage.from('patient-files').remove([path]);
      this.fail(metadata.error, 'No se pudo registrar el archivo.');
    }
    return metadata.data as unknown as PatientFile;
  }

  private async downloadPatientFile(
    patientId: number,
    fileId: number,
  ): Promise<HttpResponse<Blob>> {
    const metadata = await this.supabase
      .from('paciente_archivos')
      .select('*')
      .eq('id', fileId)
      .eq('paciente_id', patientId)
      .eq('activo', true)
      .single();
    if (metadata.error || !metadata.data) this.fail(metadata.error, 'Archivo no encontrado.');
    const audit = await this.supabase.rpc('auditar_descarga_archivo', {
      paciente_id: patientId,
      archivo_id: fileId,
    });
    if (audit.error || !audit.data) this.fail(audit.error, 'No se pudo autorizar la descarga.');
    const download = await this.supabase.storage.from('patient-files').download(audit.data);
    if (download.error || !download.data)
      this.fail(download.error, 'El archivo físico no está disponible.');
    return new HttpResponse({ body: download.data, headers: undefined, status: 200 });
  }

  private async searchPatients(filter: PatientSearch): Promise<PageResponse<PatientSummary>> {
    const page = Math.max(filter.page ?? 0, 0);
    const size = Math.min(Math.max(filter.size ?? 20, 1), 100);
    const sortMap: Record<string, keyof PatientRow> = {
      fullName: 'apellido_paterno',
      createdAt: 'creado_en',
      historyNumber: 'numero_historia',
      birthDate: 'fecha_nacimiento',
    };
    const sort = sortMap[filter.sort ?? 'fullName'] ?? 'apellido_paterno';
    let query = this.supabase.from('pacientes').select('*', { count: 'exact' });
    if (filter.q?.trim()) {
      const value = this.safeSearch(filter.q);
      query = query.or(
        `numero_historia.ilike.%${value}%,numero_documento.ilike.%${value}%,nombres.ilike.%${value}%,apellido_paterno.ilike.%${value}%,apellido_materno.ilike.%${value}%,celular.ilike.%${value}%,email.ilike.%${value}%`,
      );
    }
    if (filter.active !== undefined) query = query.eq('activo', filter.active);
    if (filter.sex) query = query.eq('sexo', filter.sex);
    if (filter.minAge !== undefined)
      query = query.lte('fecha_nacimiento', this.yearsAgo(filter.minAge));
    if (filter.maxAge !== undefined)
      query = query.gt('fecha_nacimiento', this.yearsAgo(filter.maxAge + 1));
    if (filter.registeredFrom) query = query.gte('creado_en', `${filter.registeredFrom}T00:00:00`);
    if (filter.registeredTo)
      query = query.lt('creado_en', `${this.addDays(filter.registeredTo, 1)}T00:00:00`);
    const { data, count, error } = await query
      .order(sort, { ascending: (filter.direction ?? 'asc') === 'asc' })
      .range(page * size, page * size + size - 1);
    if (error) this.fail(error, 'No se pudo consultar la lista de pacientes.');

    const rows = data ?? [];
    const allergyCounts = await this.activeAllergyCounts(rows.map((row) => row.id));
    const totalElements = count ?? 0;
    const totalPages = Math.ceil(totalElements / size);
    return {
      content: rows.map((row) => this.toSummary(row, allergyCounts.get(row.id) ?? 0)),
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: totalPages === 0 || page >= totalPages - 1,
    };
  }

  private async getPatient(id: number): Promise<PatientDetail> {
    const patientRequest = this.supabase.from('pacientes').select('*').eq('id', id).single();
    const contactsRequest = this.supabase
      .from('paciente_contactos_emergencia')
      .select('*')
      .eq('paciente_id', id)
      .eq('activo', true)
      .order('principal', { ascending: false })
      .order('id');
    const historiesRequest = this.supabase
      .from('paciente_antecedentes')
      .select('*')
      .eq('paciente_id', id)
      .eq('activo', true)
      .order('creado_en', { ascending: false });
    const allergiesRequest = this.supabase
      .from('paciente_alergias')
      .select('*')
      .eq('paciente_id', id)
      .eq('activo', true)
      .order('creado_en', { ascending: false });
    const medicationsRequest = this.supabase
      .from('paciente_medicamentos')
      .select('*')
      .eq('paciente_id', id)
      .eq('activo', true)
      .order('vigente', { ascending: false })
      .order('creado_en', { ascending: false });
    const filesRequest = this.supabase
      .from('paciente_archivos')
      .select('*')
      .eq('paciente_id', id)
      .eq('activo', true)
      .order('creado_en', { ascending: false });
    const [patient, contacts, histories, allergies, medications, files] = await Promise.all([
      patientRequest,
      contactsRequest,
      historiesRequest,
      allergiesRequest,
      medicationsRequest,
      filesRequest,
    ]);
    if (patient.error || !patient.data) this.fail(patient.error, 'Paciente no encontrado.');
    for (const result of [contacts, histories, allergies, medications, files]) {
      if (result.error) this.fail(result.error, 'No se pudo cargar el detalle del paciente.');
    }
    return this.toDetail(
      patient.data,
      contacts.data ?? [],
      histories.data ?? [],
      allergies.data ?? [],
      medications.data ?? [],
      files.data ?? [],
    );
  }

  private async activeAllergyCounts(patientIds: number[]): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (!patientIds.length) return result;
    const { data, error } = await this.supabase
      .from('paciente_alergias')
      .select('paciente_id')
      .in('paciente_id', patientIds)
      .eq('activo', true)
      .eq('estado', 'ACTIVA');
    if (error) return result; // RLS may intentionally hide clinical data from non-clinical roles.
    for (const row of data ?? [])
      result.set(row.paciente_id, (result.get(row.paciente_id) ?? 0) + 1);
    return result;
  }

  private async findDuplicates(
    documentNumber?: string,
    mobile?: string,
    birthDate?: string,
    paternalSurname?: string,
  ): Promise<DuplicateCandidate[]> {
    const matches = new Map<number, DuplicateCandidate>();
    const add = (rows: PatientRow[] | null, reason: string) =>
      rows?.forEach((row) =>
        matches.set(row.id, {
          id: row.id,
          historyNumber: row.numero_historia,
          fullName: this.fullName(row),
          documentNumber: row.numero_documento ?? undefined,
          mobile: row.celular ?? undefined,
          reason,
        }),
      );
    if (documentNumber) {
      const { data, error } = await this.supabase
        .from('pacientes')
        .select('*')
        .ilike('numero_documento', documentNumber.trim())
        .limit(10);
      if (error) this.fail(error, 'No se pudo validar el documento.');
      add(data, 'Mismo documento');
    }
    if (mobile) {
      const normalized = this.normalizeWhatsappPhone(mobile);
      const { data, error } = await this.supabase
        .from('pacientes')
        .select('*')
        .eq('celular', normalized)
        .limit(10);
      if (error) this.fail(error, 'No se pudo validar el teléfono.');
      add(data, 'Mismo teléfono');
    }
    if (birthDate && paternalSurname) {
      const { data, error } = await this.supabase
        .from('pacientes')
        .select('*')
        .eq('fecha_nacimiento', birthDate)
        .ilike('apellido_paterno', paternalSurname.trim())
        .limit(10);
      if (error) this.fail(error, 'No se pudo validar la identidad del paciente.');
      add(data, 'Misma fecha de nacimiento y apellido');
    }
    return [...matches.values()].slice(0, 10);
  }

  private toSummary(row: PatientRow, activeAllergies: number): PatientSummary {
    return {
      id: row.id,
      historyNumber: row.numero_historia,
      documentType: row.tipo_documento as PatientSummary['documentType'],
      documentNumber: row.numero_documento ?? undefined,
      fullName: this.fullName(row),
      birthDate: row.fecha_nacimiento,
      age: this.age(row.fecha_nacimiento),
      sex: row.sexo as PatientSex,
      mobile: row.celular ?? undefined,
      whatsappConsent: row.whatsapp_autorizado,
      email: row.email ?? undefined,
      activeAllergies,
      active: row.activo,
      createdAt: row.creado_en,
      version: row.version,
    };
  }

  private toDetail(
    row: PatientRow,
    contacts: EmergencyContactRow[],
    histories: PatientHistoryRow[],
    allergies: PatientAllergyRow[],
    medications: PatientMedicationRow[],
    files: PatientFileRow[],
  ): PatientDetail {
    return {
      id: row.id,
      historyNumber: row.numero_historia,
      documentType: row.tipo_documento as PatientDetail['documentType'],
      documentNumber: row.numero_documento ?? undefined,
      firstNames: row.nombres,
      paternalSurname: row.apellido_paterno,
      maternalSurname: row.apellido_materno ?? undefined,
      birthDate: row.fecha_nacimiento,
      age: this.age(row.fecha_nacimiento),
      sex: row.sexo as PatientSex,
      birthPlace: row.lugar_nacimiento ?? undefined,
      occupation: row.ocupacion ?? undefined,
      maritalStatus: row.estado_civil ?? undefined,
      educationLevel: row.grado_instruccion ?? undefined,
      religion: row.religion ?? undefined,
      ethnicSelfIdentification: row.autoidentificacion_etnica ?? undefined,
      mobile: row.celular ?? undefined,
      phone: row.telefono ?? undefined,
      whatsappConsent: row.whatsapp_autorizado,
      whatsappConsentAt: row.whatsapp_autorizado_en ?? undefined,
      whatsappConsentBy: row.whatsapp_autorizado_por ?? undefined,
      whatsappRevokedAt: row.whatsapp_revocado_en ?? undefined,
      email: row.email ?? undefined,
      address: row.direccion ?? undefined,
      responsibleName: row.responsable_nombre ?? undefined,
      responsibleDocument: row.responsable_documento ?? undefined,
      responsibleRelationship: row.responsable_parentesco ?? undefined,
      responsiblePhone: row.responsable_telefono ?? undefined,
      active: row.activo,
      createdAt: row.creado_en,
      updatedAt: row.actualizado_en,
      version: row.version,
      emergencyContacts: contacts.map((item) => ({
        id: item.id,
        fullName: item.nombre_completo,
        relationship: item.parentesco,
        phone: item.telefono,
        primary: item.principal,
        createdAt: item.creado_en,
      })),
      histories: histories.map((item) => ({
        id: item.id,
        type: item.tipo as PatientHistory['type'],
        description: item.descripcion,
        status: item.estado as PatientHistory['status'],
        observation: item.observacion ?? undefined,
        reportedDate: item.fecha_informada ?? undefined,
        createdAt: item.creado_en,
      })),
      allergies: allergies.map((item) => ({
        id: item.id,
        substance: item.sustancia,
        reaction: item.reaccion ?? undefined,
        severity: item.severidad as PatientAllergy['severity'],
        status: item.estado as PatientAllergy['status'],
        observation: item.observacion ?? undefined,
        createdAt: item.creado_en,
      })),
      medications: medications.map((item) => ({
        id: item.id,
        medication: item.medicamento,
        dose: item.dosis ?? undefined,
        frequency: item.frecuencia ?? undefined,
        reason: item.motivo ?? undefined,
        startDate: item.fecha_inicio ?? undefined,
        endDate: item.fecha_fin ?? undefined,
        current: item.vigente,
        createdAt: item.creado_en,
      })),
      files: files.map((item) => ({
        id: item.id,
        category: item.categoria as PatientFileCategory,
        originalName: item.nombre_original,
        contentType: item.tipo_contenido,
        sizeBytes: item.tamano_bytes,
        description: item.descripcion ?? undefined,
        createdAt: item.creado_en,
      })),
    };
  }

  private fullName(row: PatientRow): string {
    return [row.nombres, row.apellido_paterno, row.apellido_materno].filter(Boolean).join(' ');
  }

  private age(birthDate: string): number {
    const birth = new Date(`${birthDate}T00:00:00`);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
    )
      years--;
    return years;
  }

  private yearsAgo(years: number): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    return this.localDate(date);
  }

  private addDays(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + days);
    return this.localDate(date);
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private safeSearch(value: string): string {
    return value
      .trim()
      .replace(/[,%().]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private normalizeWhatsappPhone(value: string): string {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return /^9\d{8}$/.test(digits) ? `51${digits}` : digits;
  }

  private toJson(value: object): Json {
    return this.api.toJson(value);
  }

  private fail(error: unknown, fallback: string): never {
    return this.api.fail(error, fallback);
  }
}
