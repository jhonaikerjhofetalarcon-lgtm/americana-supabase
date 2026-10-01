-- Reserva guiada sobre la agenda real. Solo service_role procesa respuestas del webhook.
alter table public.mensajes_whatsapp add column opciones_interactivas jsonb not null default '[]'::jsonb;
alter table public.mensajes_whatsapp drop constraint chk_mensaje_tipo;
alter table public.mensajes_whatsapp add constraint chk_mensaje_tipo check (tipo in (
  'ENTRANTE','CITA_CONFIRMACION','CITA_RECORDATORIO','POSTCONSULTA','MANUAL',
  'CITA_CANCELACION','CITA_REPROGRAMACION','CITA_CONFIRMADA','CITA_RECORDATORIO_2H',
  'MENU_CITAS','HORARIOS_CITA','CITA_RESERVADA'
));

create table public.whatsapp_reservas_flujo (
  telefono varchar(20) primary key,
  paciente_id bigint not null references public.pacientes(id) on delete cascade,
  token varchar(8) not null,
  opciones jsonb not null,
  mensaje_oferta_id bigint references public.mensajes_whatsapp(id),
  vence_en timestamptz not null,
  actualizado_en timestamptz not null default now(),
  constraint chk_reserva_opciones check (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) <= 3)
);
create index whatsapp_reservas_flujo_vence on public.whatsapp_reservas_flujo(vence_en);
revoke all on public.whatsapp_reservas_flujo from public, anon, authenticated;
alter table public.whatsapp_reservas_flujo enable row level security;

create or replace function public.clasificar_respuesta_whatsapp(contenido text) returns text
language sql immutable set search_path = '' as $$
  select case
    when lower(contenido) ~ 'sangrado abundante|no para de sangrar|fiebre|hinchaz(o|ó)n severa|dificultad para respirar|dolor insoportable|alergia' then 'ALERTA_CLINICA'
    when upper(btrim(contenido)) ~ '^(CONFIRMO|CONFIRMAR|CONFIRMO MI CITA)[.! ]*$' then 'CONFIRMAR'
    when upper(btrim(contenido)) ~ '^(CANCELAR|CANCELO|CANCELAR MI CITA|CANCELO MI CITA)[.! ]*$' then 'CANCELAR'
    when upper(btrim(contenido)) ~ '^(REPROGRAMAR|REPROGRAMAR MI CITA|QUIERO OTRA FECHA|OTRA FECHA)[.! ]*$' then 'REPROGRAMAR'
    when upper(btrim(contenido)) ~ '^(RESERVAR|AGENDAR|QUIERO UNA CITA|RESERVAR CITA)[.! ]*$' then 'RESERVAR'
    when upper(btrim(contenido)) ~ '^(HOLA|MENU|MENÚ|OPCIONES)[.! ]*$' then 'MENU'
    when upper(btrim(contenido)) ~ '^(1|2|3|CITA_[A-F0-9]{8}_[123])[.! ]*$' then 'SELECCION_HORARIO'
    else 'NO_ENTENDIDO'
  end
$$;
revoke all on function public.clasificar_respuesta_whatsapp(text) from public, anon, authenticated;

-- Solo horas de inicio fijas (09, 10, 11, 15, 16, 17) dentro de las jornadas
-- configuradas; aplica los mismos bloqueos y solapes que la agenda.
create or replace function public.ofrecer_horarios_whatsapp(paciente_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with tipo as (
    select id, duracion_minutos from public.tipos_cita
    where codigo = 'CONSULTA' and activo limit 1
  ), profesionales as (
    select distinct u.id, u.nombre_completo from public.usuarios u
    join public.usuarios_roles ur on ur.usuario_id = u.id
    join public.roles r on r.id = ur.rol_id
    where u.activo and not u.bloqueado and r.codigo = 'ODONTOLOGO' and r.activo
  ), candidatos as (
    select p.id profesional_id, p.nombre_completo, t.id tipo_id, t.duracion_minutos,
      ((now() at time zone 'America/Lima')::date + d.n + h.hora) at time zone 'America/Lima' inicio
    from profesionales p cross join tipo t
    cross join generate_series(0, 13) d(n)
    cross join (values (time '09:00'),(time '10:00'),(time '11:00'),
      (time '15:00'),(time '16:00'),(time '17:00')) h(hora)
    where ((now() at time zone 'America/Lima')::date + d.n + h.hora) at time zone 'America/Lima' > now() + interval '2 hours'
      and (
        exists(select 1 from public.horarios_profesionales j where j.profesional_id = p.id
          and j.dia_semana = extract(isodow from (now() at time zone 'America/Lima')::date + d.n)::smallint and j.activo
          and h.hora >= j.hora_inicio
          and h.hora + make_interval(mins => t.duracion_minutos) <= j.hora_fin)
        or (extract(isodow from (now() at time zone 'America/Lima')::date + d.n) <> 7 and h.hora + make_interval(mins => t.duracion_minutos) <= time '20:00'
          and not exists(select 1 from public.horarios_profesionales j where j.profesional_id = p.id
            and j.dia_semana = extract(isodow from (now() at time zone 'America/Lima')::date + d.n)::smallint and j.activo))
      )
  ), disponibles as (
    select distinct on (c.inicio) c.* from candidatos c
    where not exists(select 1 from public.bloqueos_agenda b where b.profesional_id = c.profesional_id
      and b.activo and b.inicio < c.inicio + make_interval(mins => c.duracion_minutos) and b.fin > c.inicio)
      and not exists(select 1 from public.citas a where a.profesional_id = c.profesional_id
        and a.estado not in ('CANCELADA','NO_ASISTIO')
        and a.inicio < c.inicio + make_interval(mins => c.duracion_minutos) and a.fin > c.inicio)
      and not exists(select 1 from public.citas a where a.paciente_id = ofrecer_horarios_whatsapp.paciente_id
        and a.estado not in ('CANCELADA','NO_ASISTIO')
        and a.inicio < c.inicio + make_interval(mins => c.duracion_minutos) and a.fin > c.inicio)
    order by c.inicio, c.profesional_id limit 3
  )
  select coalesce(jsonb_agg(jsonb_build_object('professionalId', profesional_id,
    'professionalName', nombre_completo, 'typeId', tipo_id, 'start', inicio,
    'durationMinutes', duracion_minutos) order by inicio, profesional_id), '[]'::jsonb)
  from disponibles
$$;
revoke all on function public.ofrecer_horarios_whatsapp(bigint) from public, anon, authenticated;
grant execute on function public.ofrecer_horarios_whatsapp(bigint) to service_role;

create or replace function public.procesar_evento_whatsapp_citas(datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := public.normalizar_telefono_whatsapp(datos ->> 'phone');
  v_content text := upper(btrim(coalesce(datos ->> 'content', '')));
  v_provider text := nullif(datos ->> 'providerId', '');
  v_message public.mensajes_whatsapp;
  v_patient public.pacientes;
  v_flow public.whatsapp_reservas_flujo;
  v_options jsonb;
  v_slot jsonb;
  v_buttons jsonb;
  v_token text;
  v_text text;
  v_choice integer;
  v_id bigint;
  v_outgoing_id bigint;
  v_type public.tipos_cita;
  v_start timestamptz;
  v_end timestamptz;
  v_quoted_id text := nullif(datos ->> 'contextProviderId', '');
  v_offer_provider text;
  v_data jsonb := datos;
begin
  if v_provider is null or v_phone !~ '^[1-9][0-9]{9,14}$' then
    raise exception using errcode = 'P0001', message = 'Mensaje de WhatsApp inválido';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('whatsapp:' || v_phone, 0));
  select * into v_message from public.mensajes_whatsapp where proveedor_id = v_provider;
  if found then return public.mensaje_json(v_message); end if;
  -- Los botones del menú no representan una cita: la cancelación solo puede
  -- usar la única cita futura del paciente, igual que el comando escrito.
  if v_quoted_id is not null and exists(select 1 from public.mensajes_whatsapp
    where proveedor_id = v_quoted_id and tipo = 'MENU_CITAS' and cita_id is null) then
    v_data := v_data - 'contextProviderId';
  end if;
  perform public.registrar_evento_whatsapp(v_data);
  select * into v_message from public.mensajes_whatsapp where proveedor_id = v_provider;
  if not found then raise exception 'No se guardó el mensaje de entrada'; end if;
  if v_message.paciente_id is null then return public.mensaje_json(v_message); end if;
  select * into v_patient from public.pacientes where id = v_message.paciente_id;
  if not found or not v_patient.activo or not v_patient.whatsapp_autorizado
    or not public.telefono_whatsapp_es_unico(v_patient.id, v_phone) then
    return public.mensaje_json(v_message);
  end if;

  if v_message.intencion = 'MENU' then
    v_text := E'Hola. ¿Qué deseas hacer?\n1. RESERVAR una cita\n2. CANCELAR tu próxima cita\n3. REPROGRAMAR con recepción\n\nResponde con la palabra de tu opción.';
    v_buttons := jsonb_build_array(
      jsonb_build_object('id','RESERVAR','text','Reservar cita'),
      jsonb_build_object('id','CANCELAR','text','Cancelar cita'),
      jsonb_build_object('id','REPROGRAMAR','text','Reprogramar'));
    delete from public.whatsapp_reservas_flujo where telefono = v_phone;
  elsif v_message.intencion = 'RESERVAR' then
    v_options := public.ofrecer_horarios_whatsapp(v_patient.id);
    if jsonb_array_length(v_options) = 0 then
      v_text := 'Por ahora no hay horarios disponibles en las próximas dos semanas. Recepción revisará tu solicitud y te responderá por este medio.';
      v_buttons := '[]'::jsonb;
      delete from public.whatsapp_reservas_flujo where telefono = v_phone;
    else
    v_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    v_text := 'Horarios disponibles para consulta y evaluación (hora de Perú):';
    v_buttons := '[]'::jsonb;
    for v_choice in 1..jsonb_array_length(v_options) loop
      v_slot := v_options -> (v_choice - 1);
      v_text := v_text || E'\n' || v_choice || '. ' ||
        to_char((v_slot ->> 'start')::timestamptz at time zone 'America/Lima', 'DD/MM HH24:MI') ||
        ' · ' || (v_slot ->> 'professionalName');
      v_buttons := v_buttons || jsonb_build_array(jsonb_build_object(
        'id', 'CITA_' || v_token || '_' || v_choice,
        'text', v_choice || ' · ' || to_char((v_slot ->> 'start')::timestamptz at time zone 'America/Lima', 'DD/MM HH24:MI')));
    end loop;
    v_text := v_text || E'\n\nResponde 1, 2 o 3 para reservar. Las opciones vencen en 10 minutos y se verificarán otra vez antes de confirmar.';
    insert into public.whatsapp_reservas_flujo(telefono,paciente_id,token,opciones,vence_en)
    values(v_phone,v_patient.id,v_token,v_options,now() + interval '10 minutes')
    on conflict(telefono) do update set paciente_id = excluded.paciente_id, token = excluded.token,
      opciones = excluded.opciones, vence_en = excluded.vence_en, mensaje_oferta_id = null, actualizado_en = now();
    update public.mensajes_whatsapp set requiere_revision = false where id = v_message.id;
    update public.conversaciones_whatsapp set estado = 'ABIERTA' where id = v_message.conversacion_id;
    end if;
  elsif v_message.intencion = 'SELECCION_HORARIO' then
    select * into v_flow from public.whatsapp_reservas_flujo where telefono = v_phone for update;
    if not found or v_flow.paciente_id <> v_patient.id or v_flow.vence_en <= now() then
      v_text := 'Esta oferta ya venció. Responde RESERVAR para ver horarios actualizados.';
      v_buttons := '[]'::jsonb;
    else
      if v_content ~ '^CITA_[A-F0-9]{8}_[123]$' then
        v_token := split_part(v_content, '_', 2);
        v_choice := split_part(v_content, '_', 3)::integer;
      else
        v_token := v_flow.token;
        v_choice := v_content::integer;
      end if;
      if v_token <> v_flow.token or v_choice > jsonb_array_length(v_flow.opciones) then
        v_text := 'Esa opción ya no está disponible. Responde RESERVAR para recibir horarios nuevos.';
        v_buttons := '[]'::jsonb;
      else
        if v_quoted_id is not null and v_flow.mensaje_oferta_id is not null then
          select proveedor_id into v_offer_provider from public.mensajes_whatsapp where id = v_flow.mensaje_oferta_id;
          if v_offer_provider is distinct from v_quoted_id then
            v_text := 'Respondimos a otra oferta. Escribe RESERVAR para consultar los horarios actuales.';
            v_buttons := '[]'::jsonb;
          end if;
        end if;
        if v_text is null then
          v_slot := v_flow.opciones -> (v_choice - 1);
          v_start := (v_slot ->> 'start')::timestamptz;
          select * into v_type from public.tipos_cita where id = (v_slot ->> 'typeId')::bigint and activo;
          if not found then
            v_text := 'El servicio ya no está disponible. Responde RESERVAR para consultar otros horarios.';
            v_buttons := '[]'::jsonb;
          else
            v_end := v_start + make_interval(mins => v_type.duracion_minutos);
            -- La misma validación de la agenda adquiere bloqueos para evitar dobles reservas.
            begin
              perform public.validar_profesional_cita((v_slot ->> 'professionalId')::bigint);
              perform public.validar_disponibilidad_cita(v_patient.id,
                (v_slot ->> 'professionalId')::bigint, v_start, v_end, null);
              insert into public.citas(paciente_id,profesional_id,tipo_cita_id,inicio,fin,motivo,origen,creado_por,actualizado_por)
              values(v_patient.id,(v_slot ->> 'professionalId')::bigint,v_type.id,v_start,v_end,
                'Consulta solicitada por WhatsApp','WHATSAPP',v_patient.creado_por,v_patient.creado_por)
              returning id into v_id;
              insert into public.cita_historial_estados(cita_id,estado_anterior,estado_nuevo,motivo,creado_por)
              values(v_id,null,'PENDIENTE_CONFIRMACION','Cita reservada por WhatsApp',v_patient.creado_por);
              insert into public.auditoria(usuario_id,username,accion,recurso,recurso_id,resultado,detalle)
              values(null,null,'RESERVAR_CITA_WHATSAPP','CITA',v_id::text,'EXITO',
                'Reserva automática tras elegir horario fijo disponible');
              update public.mensajes_whatsapp set cita_id = v_id, intencion = 'RESERVAR', requiere_revision = false
              where id = v_message.id;
              update public.solicitudes_cita_web s set estado = 'AGENDADO', cita_id = v_id,
                observacion_interna = 'Reserva completada automáticamente por WhatsApp', actualizado_en = now(), version = version + 1
              where s.id = (select s2.id from public.solicitudes_cita_web s2
                where s2.celular = v_phone and s2.estado = 'PENDIENTE'
                  and s2.servicio = 'Solicitud de cita por WhatsApp'
                order by s2.creado_en desc limit 1);
              v_text := '¡Listo! Tu cita quedó reservada para el ' ||
                to_char(v_start at time zone 'America/Lima', 'DD/MM/YYYY') || ' a las ' ||
                to_char(v_start at time zone 'America/Lima', 'HH24:MI') ||
                ' (hora de Perú). Responde CONFIRMO para confirmarla o CANCELAR si no podrás asistir.';
              v_buttons := jsonb_build_array(jsonb_build_object('id','CONFIRMO','text','Confirmar'),
                jsonb_build_object('id','CANCELAR','text','Cancelar'));
              delete from public.whatsapp_reservas_flujo where telefono = v_phone;
            exception when sqlstate 'P0001' then
              v_id := null;
              v_text := 'Ese horario acaba de dejar de estar disponible. Responde RESERVAR para recibir opciones nuevas.';
              v_buttons := '[]'::jsonb;
              delete from public.whatsapp_reservas_flujo where telefono = v_phone;
            end;
          end if;
        end if;
      end if;
    end if;
  else
    return public.mensaje_json(v_message);
  end if;

  if v_text is not null then
    insert into public.mensajes_whatsapp(conversacion_id,paciente_id,cita_id,direccion,contenido,estado,
      programado_para,tipo,opciones_interactivas)
    values(v_message.conversacion_id,v_patient.id,v_id,'SALIENTE',v_text,'PENDIENTE',now(),
      case when v_message.intencion = 'RESERVAR' then 'HORARIOS_CITA'
        when v_id is not null then 'CITA_RESERVADA' else 'MENU_CITAS' end,v_buttons)
    returning id into v_outgoing_id;
    if v_message.intencion = 'RESERVAR' and jsonb_array_length(v_buttons) > 0 then
      update public.whatsapp_reservas_flujo set mensaje_oferta_id = v_outgoing_id where telefono = v_phone;
    end if;
    if v_message.intencion in ('MENU','SELECCION_HORARIO') then
      update public.mensajes_whatsapp set requiere_revision = false where id = v_message.id;
      update public.conversaciones_whatsapp set estado = 'ABIERTA' where id = v_message.conversacion_id;
    end if;
  end if;
  select * into v_message from public.mensajes_whatsapp where id = v_message.id;
  return public.mensaje_json(v_message);
end;
$$;
revoke all on function public.procesar_evento_whatsapp_citas(jsonb) from public, anon, authenticated;
grant execute on function public.procesar_evento_whatsapp_citas(jsonb) to service_role;
