-- Ejecutar después de las migraciones en una base de pruebas vacía.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

do $$
declare
  usuario_id bigint;
  paciente_id bigint;
  cita_confirmar bigint;
  cita_cancelar bigint;
  cita_reprogramar bigint;
  mensaje_confirmar bigint;
  mensaje_cancelar bigint;
  mensaje_reprogramar bigint;
  cantidad bigint;
begin
  insert into public.usuarios(username,nombre_completo)
  values('meta-cloud-test','Prueba Meta') returning id into usuario_id;

  insert into public.pacientes(
    numero_historia,tipo_documento,nombres,apellido_paterno,fecha_nacimiento,sexo,
    celular,creado_por,actualizado_por,whatsapp_autorizado,whatsapp_autorizado_en,
    whatsapp_autorizado_por
  ) values (
    'TEST-META','SIN_DOCUMENTO','Paciente','Meta','1990-01-01','FEMENINO',
    '999444555',usuario_id,usuario_id,true,now(),usuario_id
  ) returning id into paciente_id;

  insert into public.citas(
    paciente_id,profesional_id,tipo_cita_id,inicio,fin,motivo,creado_por,actualizado_por
  ) values (
    paciente_id,usuario_id,1,now()+interval '2 days',now()+interval '2 days 30 minutes',
    'Confirmar por Meta',usuario_id,usuario_id
  ) returning id into cita_confirmar;

  select id into mensaje_confirmar from public.mensajes_whatsapp
  where cita_id=cita_confirmar and tipo='CITA_CONFIRMACION';
  perform pg_temp.assert_true(
    (select jsonb_array_length(parametros_plantilla)=4 from public.mensajes_whatsapp where id=mensaje_confirmar),
    'La plantilla de confirmación recibe nombre, fecha, hora y servicio'
  );
  perform pg_temp.assert_true(
    (select opciones_interactivas->0->>'id'='appointment_confirm:' || cita_confirmar::text
      from public.mensajes_whatsapp where id=mensaje_confirmar),
    'El botón incluye el identificador exacto de la cita'
  );
  update public.mensajes_whatsapp set estado='ENVIADO',proveedor_id='wamid.confirm.out'
  where id=mensaje_confirmar;
  perform public.procesar_respuesta_whatsapp_cita(jsonb_build_object(
    'phone','51999444555','content','appointment_confirm:' || cita_confirmar,
    'providerId','wamid.confirm.in','contextProviderId','wamid.confirm.out'
  ));
  perform pg_temp.assert_true(
    (select estado='CONFIRMADA' from public.citas where id=cita_confirmar),
    'Confirmar actualiza la cita exacta'
  );
  select count(*) into cantidad from public.mensajes_whatsapp;
  perform public.procesar_respuesta_whatsapp_cita(jsonb_build_object(
    'phone','51999444555','content','appointment_confirm:' || cita_confirmar,
    'providerId','wamid.confirm.in','contextProviderId','wamid.confirm.out'
  ));
  perform pg_temp.assert_true(
    (select count(*)=cantidad from public.mensajes_whatsapp),
    'Un webhook repetido no duplica mensajes ni acciones'
  );

  insert into public.citas(
    paciente_id,profesional_id,tipo_cita_id,inicio,fin,motivo,creado_por,actualizado_por
  ) values (
    paciente_id,usuario_id,1,now()+interval '3 days',now()+interval '3 days 30 minutes',
    'Cancelar por Meta',usuario_id,usuario_id
  ) returning id into cita_cancelar;
  select id into mensaje_cancelar from public.mensajes_whatsapp
  where cita_id=cita_cancelar and tipo='CITA_CONFIRMACION';
  update public.mensajes_whatsapp set estado='ENVIADO',proveedor_id='wamid.cancel.out'
  where id=mensaje_cancelar;
  perform public.procesar_respuesta_whatsapp_cita(jsonb_build_object(
    'phone','999444555','content','appointment_cancel:' || cita_cancelar,
    'providerId','wamid.cancel.in','contextProviderId','wamid.cancel.out'
  ));
  perform pg_temp.assert_true(
    (select estado='CANCELADA' from public.citas where id=cita_cancelar),
    'Cancelar libera la cita elegida'
  );

  insert into public.citas(
    paciente_id,profesional_id,tipo_cita_id,inicio,fin,motivo,creado_por,actualizado_por
  ) values (
    paciente_id,usuario_id,1,now()+interval '4 days',now()+interval '4 days 30 minutes',
    'Reprogramar por Meta',usuario_id,usuario_id
  ) returning id into cita_reprogramar;
  select id into mensaje_reprogramar from public.mensajes_whatsapp
  where cita_id=cita_reprogramar and tipo='CITA_CONFIRMACION';
  update public.mensajes_whatsapp set estado='ENVIADO',proveedor_id='wamid.reschedule.out'
  where id=mensaje_reprogramar;
  perform public.procesar_respuesta_whatsapp_cita(jsonb_build_object(
    'phone','51999444555','content','appointment_reschedule:' || cita_reprogramar,
    'providerId','wamid.reschedule.in','contextProviderId','wamid.reschedule.out'
  ));
  perform pg_temp.assert_true(
    (select estado='SOLICITUD_REPROGRAMACION' from public.citas where id=cita_reprogramar),
    'Reprogramar marca la cita y conserva el horario hasta acordar uno nuevo'
  );
  perform pg_temp.assert_true(
    exists(select 1 from public.mensajes_whatsapp where cita_id=cita_reprogramar
      and direccion='SALIENTE' and tipo='MANUAL' and estado='PENDIENTE'),
    'La solicitud de reprogramación genera un acuse en la cola'
  );

  raise notice 'Meta WhatsApp Cloud API: todas las comprobaciones aprobadas';
end;
$$;
rollback;
