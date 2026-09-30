export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      pacientes: {
        Row: PatientRow;
        Insert: Partial<PatientRow> & Pick<PatientRow, 'tipo_documento' | 'nombres' | 'apellido_paterno' | 'fecha_nacimiento' | 'sexo'>;
        Update: Partial<PatientRow>;
        Relationships: [];
      };
      paciente_contactos_emergencia: {
        Row: EmergencyContactRow;
        Insert: Partial<EmergencyContactRow> & Pick<EmergencyContactRow, 'paciente_id' | 'nombre_completo' | 'parentesco' | 'telefono'>;
        Update: Partial<EmergencyContactRow>;
        Relationships: [];
      };
      paciente_antecedentes: {
        Row: PatientHistoryRow;
        Insert: Partial<PatientHistoryRow> & Pick<PatientHistoryRow, 'paciente_id' | 'tipo' | 'descripcion' | 'estado'>;
        Update: Partial<PatientHistoryRow>;
        Relationships: [];
      };
      paciente_alergias: {
        Row: PatientAllergyRow;
        Insert: Partial<PatientAllergyRow> & Pick<PatientAllergyRow, 'paciente_id' | 'sustancia' | 'severidad' | 'estado'>;
        Update: Partial<PatientAllergyRow>;
        Relationships: [];
      };
      paciente_medicamentos: {
        Row: PatientMedicationRow;
        Insert: Partial<PatientMedicationRow> & Pick<PatientMedicationRow, 'paciente_id' | 'medicamento'>;
        Update: Partial<PatientMedicationRow>;
        Relationships: [];
      };
      paciente_archivos: {
        Row: PatientFileRow;
        Insert: Partial<PatientFileRow> & Pick<PatientFileRow, 'paciente_id' | 'categoria' | 'nombre_original' | 'nombre_interno' | 'tipo_contenido' | 'tamano_bytes' | 'ubicacion'>;
        Update: Partial<PatientFileRow>;
        Relationships: [];
      };
      tipos_cita: {
        Row: AppointmentTypeRow;
        Insert: Partial<AppointmentTypeRow> & Pick<AppointmentTypeRow, 'codigo' | 'nombre' | 'duracion_minutos' | 'color'>;
        Update: Partial<AppointmentTypeRow>;
        Relationships: [];
      };
      horarios_profesionales: {
        Row: ProfessionalScheduleRow;
        Insert: Partial<ProfessionalScheduleRow> & Pick<ProfessionalScheduleRow, 'profesional_id' | 'dia_semana' | 'hora_inicio' | 'hora_fin'>;
        Update: Partial<ProfessionalScheduleRow>;
        Relationships: [];
      };
      bloqueos_agenda: {
        Row: ScheduleBlockRow;
        Insert: Partial<ScheduleBlockRow> & Pick<ScheduleBlockRow, 'profesional_id' | 'inicio' | 'fin' | 'motivo'>;
        Update: Partial<ScheduleBlockRow>;
        Relationships: [];
      };
      citas: {
        Row: AppointmentRow;
        Insert: Partial<AppointmentRow> & Pick<AppointmentRow, 'paciente_id' | 'profesional_id' | 'tipo_cita_id' | 'inicio' | 'fin' | 'motivo'>;
        Update: Partial<AppointmentRow>;
        Relationships: [];
      };
      cita_historial_estados: {
        Row: AppointmentHistoryRow;
        Insert: Partial<AppointmentHistoryRow> & Pick<AppointmentHistoryRow, 'cita_id' | 'estado_nuevo'>;
        Update: Partial<AppointmentHistoryRow>;
        Relationships: [];
      };
      solicitudes_cita_web: {
        Row: BookingRequestRow;
        Insert: Partial<BookingRequestRow> & Pick<BookingRequestRow, 'nombre_completo' | 'celular' | 'servicio' | 'consentimiento_privacidad'>;
        Update: Partial<BookingRequestRow>;
        Relationships: [];
      };
      atenciones_clinicas: {
        Row: ClinicalEncounterRow;
        Insert: Partial<ClinicalEncounterRow> & Pick<ClinicalEncounterRow, 'paciente_id' | 'odontologo_id'>;
        Update: Partial<ClinicalEncounterRow>;
        Relationships: [];
      };
      atencion_versiones: {
        Row: ClinicalVersionRow;
        Insert: Partial<ClinicalVersionRow> & Pick<ClinicalVersionRow, 'atencion_id' | 'numero_version' | 'accion' | 'datos'>;
        Update: Partial<ClinicalVersionRow>;
        Relationships: [];
      };
      servicios: {
        Row: DentalServiceRow;
        Insert: Partial<DentalServiceRow> & Pick<DentalServiceRow, 'codigo' | 'nombre' | 'categoria' | 'precio_base'>;
        Update: Partial<DentalServiceRow>;
        Relationships: [];
      };
      metodos_pago: {
        Row: PaymentMethodRow;
        Insert: Partial<PaymentMethodRow> & Pick<PaymentMethodRow, 'codigo' | 'nombre'>;
        Update: Partial<PaymentMethodRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_context: { Args: never; Returns: Json };
      crear_paciente: { Args: { datos: Json }; Returns: number };
      actualizar_paciente: { Args: { paciente_id: number; datos: Json }; Returns: number };
      cambiar_estado_paciente: { Args: { paciente_id: number; nuevo_activo: boolean; version_actual: number }; Returns: number };
      listar_profesionales: {
        Args: never;
        Returns: { id: number; full_name: string }[];
        SetofOptions: { isSetofReturn: true; isOneToOne: false; isNotNullable: true; to: '*'; from: '*' };
      };
      listar_citas: { Args: { desde: string; hasta: string; profesional_id?: number | null; estado_filtro?: string | null }; Returns: Json };
      obtener_cita: { Args: { cita_id: number }; Returns: Json };
      disponibilidad_cita: { Args: { profesional_id: number; fecha: string; tipo_cita_id: number }; Returns: Json };
      crear_cita: { Args: { datos: Json }; Returns: number };
      actualizar_cita: { Args: { cita_id: number; datos: Json }; Returns: number };
      cambiar_estado_cita: { Args: { cita_id: number; nuevo_estado: string; version_actual: number; motivo_value?: string | null }; Returns: number };
      crear_solicitud_cita: { Args: { datos: Json }; Returns: Json };
      listar_solicitudes_cita: { Args: { estado_filtro?: string | null }; Returns: Json };
      gestionar_solicitud_cita: { Args: { solicitud_id: number; datos: Json }; Returns: Json };
      listar_atenciones: { Args: { desde?: string | null; hasta?: string | null; estado_filtro?: string | null; paciente_id?: number | null }; Returns: Json };
      obtener_atencion: { Args: { atencion_id: number }; Returns: Json };
      iniciar_atencion: { Args: { paciente_id: number; cita_id?: number | null }; Returns: number };
      actualizar_atencion: { Args: { atencion_id: number; datos: Json }; Returns: number };
      finalizar_atencion: { Args: { atencion_id: number; version_actual: number; confirmar_aprobacion: boolean }; Returns: number };
      listar_odontogramas: { Args: { atencion_id: number }; Returns: Json };
      inicializar_odontograma: { Args: { atencion_id: number; tipo_denticion: string; observacion?: string | null }; Returns: number };
      observar_odontograma: { Args: { odontograma_id: number; observacion: string; version_actual: number }; Returns: number };
      registrar_hallazgo_odontograma: { Args: { odontograma_id: number; datos: Json }; Returns: number };
      retirar_hallazgo_odontograma: { Args: { odontograma_id: number; hallazgo_id: number; version_actual: number }; Returns: number };
      aprobar_odontograma: { Args: { odontograma_id: number; version_actual: number; confirmar_aprobacion: boolean }; Returns: number };
      listar_planes: { Args: { paciente_id?: number | null; atencion_id?: number | null }; Returns: Json };
      obtener_plan: { Args: { plan_id: number }; Returns: Json };
      gestionar_plan: { Args: { accion: string; datos: Json }; Returns: number };
      listar_cuentas: { Args: { estado_filtro?: string | null; paciente_id?: number | null }; Returns: Json };
      caja_actual: { Args: never; Returns: Json };
      abrir_caja: { Args: { monto: number }; Returns: Json };
      cerrar_caja: { Args: { caja_id: number; monto_contado: number; observacion: string | null; version_actual: number; confirmacion: boolean }; Returns: Json };
      registrar_pago: { Args: { datos: Json }; Returns: Json };
      registrar_gasto: { Args: { datos: Json }; Returns: Json };
      listar_pagos: { Args: { desde: string; hasta: string }; Returns: Json };
      listar_gastos: { Args: { desde: string; hasta: string }; Returns: Json };
      resumen_finanzas: { Args: { desde: string; hasta: string }; Returns: Json };
      agregar_dato_paciente: { Args: { tipo: string; paciente_id: number; datos: Json }; Returns: Json };
      registrar_archivo_paciente: { Args: { paciente_id: number; datos: Json }; Returns: Json };
      auditar_descarga_archivo: { Args: { paciente_id: number; archivo_id: number }; Returns: string };
      listar_mensajes: { Args: never; Returns: Json };
      listar_seguimientos: { Args: never; Returns: Json };
      programar_mensaje: { Args: { paciente_id: number; contenido: string; programado_para?: string | null }; Returns: Json };
      revisar_seguimiento: { Args: { seguimiento_id: number; version_actual: number; confirmacion: boolean }; Returns: Json };
      preparar_recordatorios_whatsapp: { Args: never; Returns: number };
      registrar_evento_whatsapp: { Args: { datos: Json }; Returns: Json };
      listar_borradores_ia: { Args: { atencion_id: number }; Returns: Json };
      contexto_copiloto: { Args: { atencion_id: number; tipo: string }; Returns: Json };
      crear_borrador_ia: { Args: { atencion_id: number; tipo: string; contenido: string; datos_fuente: Json; campos_faltantes: Json }; Returns: Json };
      revisar_borrador_ia: { Args: { borrador_id: number; accion: string; version_actual: number; valor?: string | null }; Returns: Json };
      listar_usuarios: { Args: never; Returns: Json };
      listar_roles: { Args: never; Returns: Json };
      cambiar_estado_usuario: { Args: { usuario_id: number; nuevo_activo: boolean }; Returns: Json };
      listar_configuracion: { Args: never; Returns: Json };
      actualizar_configuracion: { Args: { clave: string; valor: string; version_actual: number }; Returns: Json };
      consultar_auditoria: { Args: { desde: string; hasta: string; busqueda?: string | null; pagina?: number; tamano?: number }; Returns: Json };
      resumen_operacional: { Args: { desde: string; hasta: string }; Returns: Json };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type PatientRow = {
  id: number;
  numero_historia: string;
  tipo_documento: string;
  numero_documento: string | null;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  fecha_nacimiento: string;
  sexo: string;
  lugar_nacimiento: string | null;
  ocupacion: string | null;
  estado_civil: string | null;
  grado_instruccion: string | null;
  religion: string | null;
  autoidentificacion_etnica: string | null;
  celular: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  responsable_nombre: string | null;
  responsable_documento: string | null;
  responsable_parentesco: string | null;
  responsable_telefono: string | null;
  whatsapp_autorizado: boolean;
  whatsapp_autorizado_en: string | null;
  whatsapp_autorizado_por: number | null;
  whatsapp_revocado_en: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  creado_por: number;
  actualizado_por: number;
  version: number;
}

type ChildRow = { id: number; paciente_id: number; activo: boolean; creado_en: string; creado_por: number; };
export type EmergencyContactRow = ChildRow & { nombre_completo: string; parentesco: string; telefono: string; principal: boolean; };
export type PatientHistoryRow = ChildRow & { tipo: string; descripcion: string; estado: string; observacion: string | null; fecha_informada: string | null; version: number; };
export type PatientAllergyRow = ChildRow & { sustancia: string; reaccion: string | null; severidad: string; estado: string; observacion: string | null; version: number; };
export type PatientMedicationRow = ChildRow & { medicamento: string; dosis: string | null; frecuencia: string | null; motivo: string | null; fecha_inicio: string | null; fecha_fin: string | null; vigente: boolean; version: number; };
export type PatientFileRow = ChildRow & { categoria: string; nombre_original: string; nombre_interno: string; tipo_contenido: string; tamano_bytes: number; ubicacion: string; descripcion: string | null; };

export type AppointmentTypeRow = { id: number; codigo: string; nombre: string; duracion_minutos: number; color: string; activo: boolean };
export type ProfessionalScheduleRow = { id: number; profesional_id: number; dia_semana: number; hora_inicio: string; hora_fin: string; intervalo_minutos: number; activo: boolean; creado_en: string; actualizado_en: string; version: number };
export type ScheduleBlockRow = { id: number; profesional_id: number; inicio: string; fin: string; motivo: string; activo: boolean; creado_por: number; creado_en: string };
export type AppointmentRow = { id: number; paciente_id: number; profesional_id: number; tipo_cita_id: number; inicio: string; fin: string; estado: string; motivo: string; notas: string | null; origen: string; motivo_cancelacion: string | null; confirmacion_enviada: boolean; recordatorio_programado: boolean; recordatorio_enviado: boolean; creado_por: number; actualizado_por: number; creado_en: string; actualizado_en: string; version: number };
export type AppointmentHistoryRow = { id: number; cita_id: number; estado_anterior: string | null; estado_nuevo: string; motivo: string | null; creado_por: number; creado_en: string };
export type BookingRequestRow = { id: number; nombre_completo: string; numero_documento: string | null; celular: string; email: string | null; servicio: string; fecha_preferida: string | null; turno_preferido: string; mensaje: string | null; consentimiento_privacidad: boolean; estado: string; observacion_interna: string | null; cita_id: number | null; atendido_por: number | null; creado_en: string; actualizado_en: string; version: number };
export type ClinicalEncounterRow = {
  id: number; paciente_id: number; cita_id: number | null; odontologo_id: number; fecha_atencion: string;
  estado: string; motivo_consulta: string | null; tiempo_enfermedad: string | null; signos_sintomas: string | null;
  relato_cronologico: string | null; presion_sistolica: number | null; presion_diastolica: number | null;
  pulso: number | null; temperatura: number | null; frecuencia_respiratoria: number | null; peso_kg: number | null;
  talla_cm: number | null; examen_general: string | null; examen_odontologico: string | null; diagnostico: string | null;
  plan_trabajo: string | null; pronostico: string | null; evolucion: string | null; indicaciones: string | null;
  fecha_proximo_control: string | null; alta_paciente: boolean; observacion_alta: string | null;
  consentimiento_paciente: boolean; aprobado_por: number | null; aprobado_en: string | null;
  creado_por: number; actualizado_por: number; creado_en: string; actualizado_en: string; version: number;
};
export type ClinicalVersionRow = { id: number; atencion_id: number; numero_version: number; accion: string; resumen: string | null; datos: Json; creado_por: number; creado_en: string };
export type DentalServiceRow = { id: number; codigo: string; nombre: string; categoria: string; descripcion: string | null; precio_base: number; sesiones_sugeridas: number; activo: boolean; creado_en: string; actualizado_en: string; version: number };
export type PaymentMethodRow = { id: number; codigo: string; nombre: string; requiere_referencia: boolean; activo: boolean };
