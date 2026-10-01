-- Ejecutar en una base vacía tras las migraciones. No afecta datos reales.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

do $$
declare
  lid_conversation bigint;
  phone_conversation bigint;
  message_id bigint;
begin
  select public.importar_chat_whatsapp(jsonb_build_object(
    'providerChatId', '249028612726953@lid',
    'phone', '249028612726953',
    'lastMessage', 'Hola antiguo',
    'lastMessageAt', '2026-09-30T10:00:00Z'
  )) into lid_conversation;
  select public.importar_mensaje_whatsapp(jsonb_build_object(
    'providerChatId', '249028612726953@lid',
    'providerId', 'lid-provider-message',
    'direction', 'ENTRANTE',
    'content', 'Hola reciente',
    'createdAt', '2026-10-01T10:00:00Z'
  )) into message_id;

  select public.importar_chat_whatsapp(jsonb_build_object(
    'providerChatId', '51901214858@s.whatsapp.net',
    'phone', '51901214858',
    'lastMessage', 'Respuesta enviada',
    'lastMessageDirection', 'SALIENTE',
    'lastMessageAt', '2026-10-01T10:05:00Z'
  )) into phone_conversation;
  perform public.importar_mensaje_whatsapp(jsonb_build_object(
    'providerChatId', '51901214858@s.whatsapp.net',
    'providerId', 'lid-provider-message',
    'direction', 'ENTRANTE',
    'content', 'Hola reciente',
    'createdAt', '2026-10-01T10:00:00Z'
  ));

  perform pg_temp.assert_true(
    (select conversacion_id = phone_conversation from public.mensajes_whatsapp where id = message_id),
    'El mensaje LID debe moverse a la conversación del número real'
  );
  perform pg_temp.assert_true(
    (select estado = 'CERRADA' from public.conversaciones_whatsapp where id = lid_conversation),
    'La conversación LID vacía debe cerrarse'
  );

  insert into public.mensajes_whatsapp(
    conversacion_id, direccion, contenido, estado, tipo, creado_en
  ) values (
    phone_conversation, 'ENTRANTE', 'Mensaje histórico', 'RECIBIDO', 'ENTRANTE',
    '2026-09-01T08:00:00Z'
  );
  perform pg_temp.assert_true(
    (select ultimo_mensaje = 'Respuesta enviada'
       and ultimo_mensaje_en = '2026-10-01T10:05:00Z'::timestamptz
     from public.conversaciones_whatsapp where id = phone_conversation),
    'Importar historial antiguo no debe reemplazar el mensaje reciente'
  );
end;
$$;

rollback;
