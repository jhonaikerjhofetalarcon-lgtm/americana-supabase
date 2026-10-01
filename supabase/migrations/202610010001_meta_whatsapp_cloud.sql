-- Adaptación de la cola existente para Meta WhatsApp Cloud API.
-- Conserva Evolution API como proveedor alternativo y no duplica tablas.

create or replace function public.identificar_automatizacion_whatsapp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cita public.citas;
  servicio text;
begin
  if new.direccion <> 'SALIENTE' or new.cita_id is null or new.tipo not like 'CITA_%' then
    return new;
  end if;
  select * into cita from public.citas where id = new.cita_id;
  if not found then return new; end if;
  new.cita_inicio_original := cita.inicio;
  new.cita_agenda_revision := cita.whatsapp_agenda_revision;
  new.max_intentos := greatest(new.max_intentos, 4);
  new.automatizacion_clave := concat(
    cita.id, ':', new.tipo, ':', cita.whatsapp_agenda_revision, ':',
    extract(epoch from cita.inicio),
    case when new.tipo in ('CITA_CANCELACION','CITA_REPROGRAMACION','CITA_CONFIRMADA')
      then ':' || cita.version::text else '' end
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.automatizacion_clave, 0)
  );
  if exists(
    select 1 from public.mensajes_whatsapp
    where automatizacion_clave = new.automatizacion_clave
  ) then
    return null;
  end if;

  if new.tipo in ('CITA_CONFIRMACION','CITA_RECORDATORIO','CITA_REPROGRAMACION','CITA_RECORDATORIO_2H') then
    select t.nombre into servicio from public.tipos_cita t where t.id = cita.tipo_cita_id;
    if jsonb_array_length(new.parametros_plantilla) = 3 then
      new.parametros_plantilla := new.parametros_plantilla || jsonb_build_array(coalesce(servicio, 'Atención odontológica'));
    end if;
    new.opciones_interactivas := jsonb_build_array(
      jsonb_build_object('id', 'appointment_confirm:' || cita.id::text, 'text', 'Sí, confirmar'),
      jsonb_build_object('id', 'appointment_cancel:' || cita.id::text, 'text', 'No puedo asistir'),
      jsonb_build_object('id', 'appointment_reschedule:' || cita.id::text, 'text', 'Reprogramar')
    );
  end if;
  return new;
end;
$$;

-- Prepara también mensajes pendientes creados antes de esta migración.
update public.mensajes_whatsapp m
set parametros_plantilla = case
      when jsonb_array_length(m.parametros_plantilla) = 3
      then m.parametros_plantilla || jsonb_build_array(coalesce(t.nombre, 'Atención odontológica'))
      else m.parametros_plantilla
    end,
    opciones_interactivas = jsonb_build_array(
      jsonb_build_object('id', 'appointment_confirm:' || c.id::text, 'text', 'Sí, confirmar'),
      jsonb_build_object('id', 'appointment_cancel:' || c.id::text, 'text', 'No puedo asistir'),
      jsonb_build_object('id', 'appointment_reschedule:' || c.id::text, 'text', 'Reprogramar')
    )
from public.citas c
join public.tipos_cita t on t.id = c.tipo_cita_id
where m.cita_id = c.id
  and m.estado = 'PENDIENTE'
  and m.tipo in ('CITA_CONFIRMACION','CITA_RECORDATORIO','CITA_REPROGRAMACION','CITA_RECORDATORIO_2H');

create or replace function public.procesar_respuesta_whatsapp_cita(datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_provider text := nullif(btrim(datos ->> 'providerId'), '');
  v_context_provider text := nullif(btrim(datos ->> 'contextProviderId'), '');
  v_phone text := public.normalizar_telefono_whatsapp(datos ->> 'phone');
  v_button text := lower(btrim(coalesce(datos ->> 'content', '')));
  v_action text;
  v_appointment_id bigint;
  v_patient_id bigint;
  v_patient_count integer;
  v_patient public.pacientes;
  v_appointment public.citas;
  v_conversation_id bigint;
  v_incoming public.mensajes_whatsapp;
  v_previous_state text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Operación reservada al webhook de WhatsApp';
  end if;
  if v_provider is null or v_phone !~ '^[1-9][0-9]{9,14}$' then
    raise exception using errcode = 'P0001', message = 'Evento de WhatsApp incompleto';
  end if;
  if v_button !~ '^appointment_(confirm|cancel|reschedule):[1-9][0-9]*$' then
    raise exception using errcode = 'P0001', message = 'Identificador de botón inválido';
  end if;
  v_action := split_part(split_part(v_button, ':', 1), '_', 2);
  v_appointment_id := split_part(v_button, ':', 2)::bigint;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('whatsapp:' || v_phone, 0));
  select * into v_incoming from public.mensajes_whatsapp where proveedor_id = v_provider;
  if found then return public.mensaje_json(v_incoming); end if;
  select count(*), max(id) into v_patient_count, v_patient_id
  from public.pacientes
  where activo and whatsapp_autorizado and celular is not null
    and public.normalizar_telefono_whatsapp(celular) = v_phone;
  if v_patient_count <> 1 then
    raise exception using errcode = 'P0001', message = 'El teléfono no identifica un paciente autorizado';
  end if;
  select * into v_patient from public.pacientes where id = v_patient_id;
  select * into v_appointment from public.citas
  where id = v_appointment_id and paciente_id = v_patient.id and inicio > now()
    and estado in ('PENDIENTE_CONFIRMACION','CONFIRMADA')
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'La cita no corresponde al paciente o ya no admite cambios';
  end if;

  if v_context_provider is not null then
    if not exists(
      select 1 from public.mensajes_whatsapp
      where proveedor_id = v_context_provider and direccion = 'SALIENTE'
        and paciente_id = v_patient.id and cita_id = v_appointment.id
    ) then
      raise exception using errcode = 'P0001', message = 'La respuesta no corresponde al aviso de esta cita';
    end if;
  elsif not exists(
    select 1 from public.mensajes_whatsapp
    where direccion = 'SALIENTE' and proveedor_id is not null
      and paciente_id = v_patient.id and cita_id = v_appointment.id
      and tipo in ('CITA_CONFIRMACION','CITA_RECORDATORIO','CITA_REPROGRAMACION','CITA_RECORDATORIO_2H')
  ) then
    raise exception using errcode = 'P0001', message = 'No existe un aviso enviado para esta cita';
  end if;

  v_conversation_id := public.asegurar_conversacion_whatsapp(v_patient.id, v_phone);
  insert into public.mensajes_whatsapp(
    conversacion_id,paciente_id,cita_id,direccion,contenido,estado,proveedor_id,
    intencion,requiere_revision,tipo
  ) values (
    v_conversation_id,v_patient.id,v_appointment.id,'ENTRANTE',v_button,'RECIBIDO',v_provider,
    case v_action when 'confirm' then 'CONFIRMAR' when 'cancel' then 'CANCELAR' else 'REPROGRAMAR' end,
    false,'ENTRANTE'
  ) returning * into v_incoming;

  v_previous_state := v_appointment.estado;
  if v_action = 'confirm' then
    if v_appointment.estado = 'PENDIENTE_CONFIRMACION' then
      update public.citas set estado = 'CONFIRMADA', actualizado_en = now(), version = version + 1
      where id = v_appointment.id;
      insert into public.cita_historial_estados(cita_id,estado_anterior,estado_nuevo,motivo,creado_por)
      values(v_appointment.id,v_previous_state,'CONFIRMADA','Confirmación recibida por WhatsApp Cloud API',v_appointment.actualizado_por);
      insert into public.auditoria(usuario_id,username,accion,recurso,recurso_id,resultado,detalle)
      values(null,null,'CONFIRMAR_CITA_WHATSAPP','CITA',v_appointment.id::text,'EXITO','Botón seguro de Meta Cloud API');
    end if;
  elsif v_action = 'cancel' then
    update public.citas set estado = 'CANCELADA', motivo_cancelacion = 'Cancelación solicitada por WhatsApp',
      actualizado_en = now(), version = version + 1 where id = v_appointment.id;
    insert into public.cita_historial_estados(cita_id,estado_anterior,estado_nuevo,motivo,creado_por)
    values(v_appointment.id,v_previous_state,'CANCELADA','Cancelación solicitada por WhatsApp Cloud API',v_appointment.actualizado_por);
    insert into public.auditoria(usuario_id,username,accion,recurso,recurso_id,resultado,detalle)
    values(null,null,'CANCELAR_CITA_WHATSAPP','CITA',v_appointment.id::text,'EXITO','Botón seguro de Meta Cloud API');
  else
    -- El trigger existente marcar_solicitud_reprogramacion_whatsapp actualiza la cita,
    -- registra historial y auditoría al insertar el mensaje entrante.
    insert into public.mensajes_whatsapp(
      conversacion_id,paciente_id,cita_id,direccion,contenido,estado,programado_para,tipo
    ) values (
      v_conversation_id,v_patient.id,v_appointment.id,'SALIENTE',
      'Recibimos tu solicitud de reprogramación. Revisaremos la agenda para ofrecerte una nueva fecha.',
      'PENDIENTE',now(),'MANUAL'
    );
  end if;

  update public.conversaciones_whatsapp
  set estado = 'ABIERTA', ultimo_mensaje_en = now(), actualizado_en = now()
  where id = v_conversation_id;
  return public.mensaje_json(v_incoming);
end;
$$;

revoke all on function public.procesar_respuesta_whatsapp_cita(jsonb) from public, anon, authenticated;
grant execute on function public.procesar_respuesta_whatsapp_cita(jsonb) to service_role;
revoke all on function public.identificar_automatizacion_whatsapp() from public, anon, authenticated;
