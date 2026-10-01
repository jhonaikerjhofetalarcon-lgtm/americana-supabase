-- Guardar respuestas mientras el asistente está pausado, sin ejecutar cambios de cita.
create or replace function public.registrar_evento_whatsapp_pasivo(datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := public.normalizar_telefono_whatsapp(datos ->> 'phone');
  v_content text := btrim(coalesce(datos ->> 'content', ''));
  v_provider text := nullif(datos ->> 'providerId', '');
  v_patient_id bigint;
  v_patient_count integer;
  v_conversation_id bigint;
  v_message public.mensajes_whatsapp;
begin
  if v_provider is null or v_phone !~ '^[1-9][0-9]{9,14}$' or v_content = '' then
    raise exception using errcode = 'P0001', message = 'Evento de WhatsApp incompleto';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('whatsapp:' || v_phone, 0));
  select * into v_message from public.mensajes_whatsapp where proveedor_id = v_provider;
  if found then return public.mensaje_json(v_message); end if;

  select count(*), max(id) into v_patient_count, v_patient_id
  from public.pacientes where activo and celular is not null
    and public.normalizar_telefono_whatsapp(celular) = v_phone;
  if v_patient_count <> 1 then v_patient_id := null; end if;

  select id into v_conversation_id from public.conversaciones_whatsapp
  where telefono = v_phone and estado <> 'CERRADA' order by id desc limit 1;
  if v_conversation_id is null then
    insert into public.conversaciones_whatsapp(paciente_id, telefono)
    values(v_patient_id, v_phone) returning id into v_conversation_id;
  end if;

  insert into public.mensajes_whatsapp(conversacion_id, paciente_id, direccion,
    contenido, estado, proveedor_id, intencion, requiere_revision, tipo)
  values(v_conversation_id, v_patient_id, 'ENTRANTE', v_content, 'RECIBIDO',
    v_provider, public.clasificar_respuesta_whatsapp(v_content), true, 'ENTRANTE')
  returning * into v_message;
  update public.conversaciones_whatsapp
  set estado = 'DERIVADA', ultimo_mensaje_en = now(), actualizado_en = now()
  where id = v_conversation_id;
  return public.mensaje_json(v_message);
end;
$$;
revoke all on function public.registrar_evento_whatsapp_pasivo(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_evento_whatsapp_pasivo(jsonb) to service_role;

-- Al pausar, retirar en la misma transacción los mensajes automáticos aún pendientes.
create or replace function public.cancelar_mensajes_whatsapp_al_pausar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.valor = 'false' and old.valor is distinct from new.valor then
    update public.mensajes_whatsapp
    set estado = 'CANCELADO', error_detalle = 'Automatización pausada desde WhatsApp'
    where estado = 'PENDIENTE' and direccion = 'SALIENTE' and tipo <> 'MANUAL'
      and (
        new.clave = 'whatsapp.automatizacion.activa'
        or (new.clave = 'whatsapp.automatizacion.citas' and tipo not in
          ('POSTCONSULTA','MENU_CITAS','HORARIOS_CITA','CITA_RESERVADA'))
        or (new.clave = 'whatsapp.automatizacion.reservas' and tipo in
          ('MENU_CITAS','HORARIOS_CITA','CITA_RESERVADA'))
        or (new.clave = 'whatsapp.automatizacion.postconsulta' and tipo = 'POSTCONSULTA')
      );
  end if;
  return new;
end;
$$;
create trigger cancelar_mensajes_whatsapp_al_pausar
after update of valor on public.configuracion_sistema
for each row execute function public.cancelar_mensajes_whatsapp_al_pausar();
revoke all on function public.cancelar_mensajes_whatsapp_al_pausar() from public, anon, authenticated;
