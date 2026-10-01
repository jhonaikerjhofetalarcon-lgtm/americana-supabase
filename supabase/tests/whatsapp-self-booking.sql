-- Ejecutar en una base vacía tras las migraciones. No afecta datos reales.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

do $$
declare
  operator_id bigint;
  dentist_id bigint;
  patient_id bigint;
  dentist_role bigint;
  offer public.mensajes_whatsapp;
  first_slot jsonb;
  button_id text;
  appointment_id bigint;
  count_before bigint;
  phone text := '51999222111';
begin
  select id into dentist_role from public.roles where codigo = 'ODONTOLOGO';
  insert into public.usuarios(username,nombre_completo) values('booking-operator','Operador de prueba') returning id into operator_id;
  insert into public.usuarios(username,nombre_completo) values('booking-dentist','Odontólogo de prueba') returning id into dentist_id;
  insert into public.usuarios_roles(usuario_id,rol_id) values(dentist_id,dentist_role);
  insert into public.pacientes(numero_historia,tipo_documento,nombres,apellido_paterno,fecha_nacimiento,sexo,
    celular,creado_por,actualizado_por,whatsapp_autorizado,whatsapp_autorizado_en,whatsapp_autorizado_por)
    values('TEST-BOOK','SIN_DOCUMENTO','Ana','Reserva','1991-01-01','FEMENINO',
      '999222111',operator_id,operator_id,true,now(),operator_id) returning id into patient_id;

  perform pg_temp.assert_true(public.clasificar_respuesta_whatsapp('1') = 'SELECCION_HORARIO', 'Opción numérica exacta');
  perform pg_temp.assert_true(public.clasificar_respuesta_whatsapp('No quiero cancelar') = 'NO_ENTENDIDO', 'No cancelar por frase ambigua');
  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content','HOLA','providerId','menu-1'));
  perform pg_temp.assert_true(exists(select 1 from public.mensajes_whatsapp where tipo = 'MENU_CITAS'
    and paciente_id = patient_id and jsonb_array_length(opciones_interactivas) = 3), 'Menú de citas con tres opciones');

  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content','RESERVAR','providerId','offer-1'));
  select * into offer from public.mensajes_whatsapp where tipo = 'HORARIOS_CITA' and paciente_id = patient_id order by id desc limit 1;
  perform pg_temp.assert_true(offer.id is not null and jsonb_array_length(offer.opciones_interactivas) = 3,
    'Ofrecer tres horas reales');
  select opciones -> 0 into first_slot from public.whatsapp_reservas_flujo where telefono = phone;
  perform pg_temp.assert_true(to_char((first_slot ->> 'start')::timestamptz at time zone 'America/Lima', 'HH24:MI')
    in ('09:00','10:00','11:00','15:00','16:00','17:00'), 'Las horas ofrecidas son fijas');
  button_id := offer.opciones_interactivas -> 0 ->> 'id';
  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content',button_id,'providerId','choice-1'));
  select id into appointment_id from public.citas where paciente_id = patient_id and origen = 'WHATSAPP' order by id desc limit 1;
  perform pg_temp.assert_true(appointment_id is not null, 'Elegir botón crea cita WhatsApp');
  perform pg_temp.assert_true((select inicio = (first_slot ->> 'start')::timestamptz from public.citas where id = appointment_id),
    'La cita conserva el horario ofrecido');
  perform pg_temp.assert_true(exists(select 1 from public.mensajes_whatsapp where cita_id = appointment_id and tipo = 'CITA_RESERVADA'
    and jsonb_array_length(opciones_interactivas) = 2), 'Respuesta de reserva con opciones');
  select count(*) into count_before from public.citas where paciente_id = patient_id;
  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content',button_id,'providerId','choice-1'));
  perform pg_temp.assert_true((select count(*) from public.citas where paciente_id = patient_id) = count_before,
    'Webhook repetido no duplica la cita');

  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content','HOLA','providerId','menu-2'));
  update public.mensajes_whatsapp set proveedor_id = 'menu-out-2'
    where id = (select max(id) from public.mensajes_whatsapp where tipo = 'MENU_CITAS' and cita_id is null);
  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content','CANCELAR',
    'providerId','cancel-1','contextProviderId','menu-out-2'));
  perform pg_temp.assert_true((select estado = 'CANCELADA' from public.citas where id = appointment_id),
    'El botón de cancelar en el menú libera una cita única');
  perform pg_temp.assert_true(exists(select 1 from public.mensajes_whatsapp where cita_id = appointment_id and tipo = 'CITA_CANCELACION'),
    'El paciente recibe aviso de cancelación');

  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content','RESERVAR','providerId','offer-2'));
  select * into offer from public.mensajes_whatsapp where tipo = 'HORARIOS_CITA' and paciente_id = patient_id order by id desc limit 1;
  select opciones -> 0 into first_slot from public.whatsapp_reservas_flujo where telefono = phone;
  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content',button_id,'providerId','stale-choice'));
  perform pg_temp.assert_true(exists(select 1 from public.mensajes_whatsapp where paciente_id = patient_id
    and contenido like 'Esa opción ya no está disponible%' and estado = 'PENDIENTE'),
    'Un botón de una oferta anterior no reserva otra cita');
  button_id := offer.opciones_interactivas -> 0 ->> 'id';
  insert into public.citas(paciente_id,profesional_id,tipo_cita_id,inicio,fin,motivo,creado_por,actualizado_por)
    values(patient_id,(first_slot ->> 'professionalId')::bigint,(first_slot ->> 'typeId')::bigint,
      (first_slot ->> 'start')::timestamptz,
      (first_slot ->> 'start')::timestamptz + make_interval(mins => (first_slot ->> 'durationMinutes')::integer),
      'Conflicto de prueba',operator_id,operator_id);
  select count(*) into count_before from public.citas where paciente_id = patient_id;
  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone',phone,'content',button_id,'providerId','choice-2'));
  perform pg_temp.assert_true((select count(*) from public.citas where paciente_id = patient_id) = count_before,
    'Un turno ocupado después de la oferta no se reserva dos veces');
  perform pg_temp.assert_true(exists(select 1 from public.mensajes_whatsapp where paciente_id = patient_id
    and contenido like 'Ese horario acaba de dejar%' and estado = 'PENDIENTE'), 'Se informa del horario ocupado');

  perform public.procesar_evento_whatsapp_citas(jsonb_build_object('phone','51999888777','content','RESERVAR',
    'providerId','unknown-patient'));
  perform pg_temp.assert_true(not exists(select 1 from public.citas where origen = 'WHATSAPP' and paciente_id <> patient_id),
    'Un número no identificado no reserva automáticamente');
end;
$$;
rollback;
