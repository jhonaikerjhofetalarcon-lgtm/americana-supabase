-- WhatsApp/Baileys puede identificar un mismo chat con un LID interno al recibir
-- y con el número telefónico al enviar. Conservamos como canónico el JID telefónico
-- y reubicamos mensajes ya importados para evitar conversaciones duplicadas.

create or replace function public.refrescar_resumen_conversacion_whatsapp(
  p_conversacion_id bigint,
  p_cerrar_si_vacia boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ultimo public.mensajes_whatsapp;
begin
  select * into v_ultimo
  from public.mensajes_whatsapp m
  where m.conversacion_id = p_conversacion_id
  order by m.creado_en desc, m.id desc
  limit 1;

  if found then
    update public.conversaciones_whatsapp
    set ultimo_mensaje = v_ultimo.contenido,
        ultimo_mensaje_direccion = v_ultimo.direccion,
        ultimo_mensaje_en = v_ultimo.creado_en,
        actualizado_en = now()
    where id = p_conversacion_id
      and (
        p_cerrar_si_vacia
        or ultimo_mensaje_en is null
        or v_ultimo.creado_en >= ultimo_mensaje_en
      );
  elsif p_cerrar_si_vacia then
    update public.conversaciones_whatsapp
    set estado = 'CERRADA', no_leidos = 0, actualizado_en = now()
    where id = p_conversacion_id;
  end if;
end;
$$;

revoke all on function public.refrescar_resumen_conversacion_whatsapp(bigint, boolean)
  from public, anon, authenticated;

create or replace function public.importar_chat_whatsapp(datos jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_chat public.conversaciones_whatsapp;
  v_patient_id bigint;
  v_jid text := nullif(btrim(datos ->> 'providerChatId'), '');
  v_phone text := regexp_replace(coalesce(datos ->> 'phone', split_part(v_jid, '@', 1)), '\D', '', 'g');
  v_name text := nullif(left(btrim(coalesce(datos ->> 'contactName', '')), 150), '');
  v_last text := nullif(btrim(coalesce(datos ->> 'lastMessage', '')), '');
  v_direction text := case when datos ->> 'lastMessageDirection' = 'SALIENTE' then 'SALIENTE' else 'ENTRANTE' end;
  v_last_at timestamptz := coalesce(nullif(datos ->> 'lastMessageAt', '')::timestamptz, now());
  v_unread integer := greatest(coalesce((datos ->> 'unreadCount')::integer, 0), 0);
begin
  if v_jid is null or length(v_phone) < 7 or v_jid ~ '@(g\.us|broadcast|newsletter)$' then
    return null;
  end if;

  select p.id into v_patient_id from public.pacientes p
  where p.activo and p.celular is not null
    and (
      regexp_replace(p.celular, '\D', '', 'g') = v_phone
      or ('51' || regexp_replace(p.celular, '\D', '', 'g')) = v_phone
    )
  limit 1;

  select * into v_chat from public.conversaciones_whatsapp c
  where c.estado <> 'CERRADA' and (c.proveedor_chat_id = v_jid or c.telefono = v_phone)
  order by (c.proveedor_chat_id = v_jid) desc, c.id desc limit 1 for update;

  if not found then
    insert into public.conversaciones_whatsapp(
      paciente_id, telefono, nombre_contacto, proveedor_chat_id, ultimo_mensaje,
      ultimo_mensaje_direccion, ultimo_mensaje_en, no_leidos)
    values (v_patient_id, v_phone, v_name, v_jid, v_last, v_direction, v_last_at, v_unread)
    returning * into v_chat;
  else
    update public.conversaciones_whatsapp c set
      paciente_id = coalesce(c.paciente_id, v_patient_id),
      nombre_contacto = coalesce(v_name, c.nombre_contacto),
      proveedor_chat_id = case
        when v_jid like '%@s.whatsapp.net' then v_jid
        else coalesce(c.proveedor_chat_id, v_jid)
      end,
      ultimo_mensaje = case
        when v_last is not null and (c.ultimo_mensaje_en is null or v_last_at >= c.ultimo_mensaje_en)
          then v_last else c.ultimo_mensaje
      end,
      ultimo_mensaje_direccion = case
        when v_last is not null and (c.ultimo_mensaje_en is null or v_last_at >= c.ultimo_mensaje_en)
          then v_direction else c.ultimo_mensaje_direccion
      end,
      ultimo_mensaje_en = greatest(coalesce(c.ultimo_mensaje_en, v_last_at), v_last_at),
      no_leidos = v_unread,
      actualizado_en = now()
    where c.id = v_chat.id returning * into v_chat;
  end if;
  return v_chat.id;
end;
$$;

create or replace function public.importar_mensaje_whatsapp(datos jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_chat public.conversaciones_whatsapp;
  v_message public.mensajes_whatsapp;
  v_old_conversation_id bigint;
  v_jid text := nullif(btrim(datos ->> 'providerChatId'), '');
  v_phone text := regexp_replace(coalesce(datos ->> 'phone', split_part(v_jid, '@', 1)), '\D', '', 'g');
  v_provider_id text := nullif(left(btrim(coalesce(datos ->> 'providerId', '')), 150), '');
  v_content text := btrim(coalesce(datos ->> 'content', ''));
  v_direction text := case when datos ->> 'direction' = 'SALIENTE' then 'SALIENTE' else 'ENTRANTE' end;
  v_status text := upper(coalesce(datos ->> 'status', ''));
  v_created_at timestamptz := coalesce(nullif(datos ->> 'createdAt', '')::timestamptz, now());
begin
  if v_jid is null or v_provider_id is null or v_content = ''
     or v_jid ~ '@(g\.us|broadcast|newsletter)$' then return null; end if;

  select * into v_chat from public.conversaciones_whatsapp c
  where c.estado <> 'CERRADA' and (c.proveedor_chat_id = v_jid or c.telefono = v_phone)
  order by (c.proveedor_chat_id = v_jid) desc, c.id desc limit 1;
  if not found then
    perform public.importar_chat_whatsapp(jsonb_build_object(
      'providerChatId', v_jid,
      'phone', v_phone,
      'lastMessage', v_content,
      'lastMessageDirection', v_direction,
      'lastMessageAt', v_created_at
    ));
    select * into v_chat from public.conversaciones_whatsapp c
    where c.estado <> 'CERRADA' and (c.proveedor_chat_id = v_jid or c.telefono = v_phone)
    order by (c.proveedor_chat_id = v_jid) desc, c.id desc limit 1;
  end if;
  if v_chat.id is null then return null; end if;

  select * into v_message from public.mensajes_whatsapp
  where proveedor_id = v_provider_id for update;
  if found then
    v_old_conversation_id := v_message.conversacion_id;
    if v_old_conversation_id <> v_chat.id then
      update public.mensajes_whatsapp
      set conversacion_id = v_chat.id,
          paciente_id = coalesce(paciente_id, v_chat.paciente_id)
      where id = v_message.id;
      perform public.refrescar_resumen_conversacion_whatsapp(v_old_conversation_id, true);
      perform public.refrescar_resumen_conversacion_whatsapp(v_chat.id, false);
    end if;
    return v_message.id;
  end if;

  if v_direction = 'ENTRANTE' then v_status := 'RECIBIDO';
  elsif v_status not in ('ENVIADO','ENTREGADO','LEIDO','FALLIDO') then v_status := 'ENVIADO';
  end if;

  insert into public.mensajes_whatsapp(
    conversacion_id, paciente_id, direccion, contenido, estado, proveedor_id,
    requiere_revision, tipo, plantilla_nombre, creado_en, enviado_en, intentos)
  values (v_chat.id, v_chat.paciente_id, v_direction, v_content, v_status, v_provider_id,
    false, case when v_direction = 'ENTRANTE' then 'ENTRANTE' else 'MANUAL' end,
    'IMPORTADO_EVOLUTION', v_created_at,
    case when v_direction = 'SALIENTE' then v_created_at else null end,
    case when v_direction = 'SALIENTE' then 1 else 0 end)
  returning * into v_message;
  return v_message.id;
exception when unique_violation then
  select * into v_message from public.mensajes_whatsapp where proveedor_id = v_provider_id;
  return v_message.id;
end;
$$;

create or replace function public.actualizar_resumen_conversacion_whatsapp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversaciones_whatsapp c set
    ultimo_mensaje = case
      when c.ultimo_mensaje_en is null or new.creado_en >= c.ultimo_mensaje_en
        then new.contenido else c.ultimo_mensaje
    end,
    ultimo_mensaje_direccion = case
      when c.ultimo_mensaje_en is null or new.creado_en >= c.ultimo_mensaje_en
        then new.direccion else c.ultimo_mensaje_direccion
    end,
    ultimo_mensaje_en = greatest(coalesce(c.ultimo_mensaje_en, new.creado_en), new.creado_en),
    no_leidos = c.no_leidos + case when new.direccion = 'ENTRANTE' then 1 else 0 end,
    actualizado_en = now()
  where c.id = new.conversacion_id;
  return new;
end;
$$;

revoke all on function public.importar_chat_whatsapp(jsonb),
  public.importar_mensaje_whatsapp(jsonb),
  public.actualizar_resumen_conversacion_whatsapp() from public, anon, authenticated;
grant execute on function public.importar_chat_whatsapp(jsonb),
  public.importar_mensaje_whatsapp(jsonb) to service_role;
