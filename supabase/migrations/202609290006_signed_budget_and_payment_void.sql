-- Presupuesto aceptado con copia inmutable y corrección de cobros sin borrar historial.
create table public.acuerdos_presupuesto (
  plan_id bigint primary key references public.planes_tratamiento(id) on delete restrict,
  detalle jsonb not null,
  firma_png text not null check (firma_png ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(firma_png) between 100 and 150000),
  firmado_en timestamptz not null default now(),
  registrado_por bigint not null references public.usuarios(id)
);
alter table public.acuerdos_presupuesto enable row level security;
revoke all on public.acuerdos_presupuesto from public, anon, authenticated;

create function public.obtener_acuerdo_presupuesto(plan_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not (public.has_permission('TRATAMIENTO_LEER') or public.has_permission('FINANZA_LEER')) then
    raise exception using errcode='42501', message='No autorizado para consultar presupuestos';
  end if;
  select jsonb_build_object('plan',a.detalle,'signatureData',a.firma_png,'signedAt',a.firmado_en,
    'registeredBy',a.registrado_por,'currentStatus',p.estado) into result
    from public.acuerdos_presupuesto a join public.planes_tratamiento p on p.id=a.plan_id
    where a.plan_id=obtener_acuerdo_presupuesto.plan_id;
  return result;
end $$;

-- Conservar la implementación transaccional existente, pero cerrar la aceptación sin firma.
alter function public.gestionar_plan(text,jsonb) rename to gestionar_plan_interno;
revoke all on function public.gestionar_plan_interno(text,jsonb) from public, anon, authenticated;
create function public.gestionar_plan(accion text, datos jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if accion='ESTADO' and datos->>'status'='ACEPTADO' then
    raise exception using errcode='P0001', message='Solicite la firma del paciente para aceptar el presupuesto';
  end if;
  return public.gestionar_plan_interno(accion,datos);
end $$;

create function public.firmar_presupuesto(datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor bigint:=public.current_app_user_id(); p public.planes_tratamiento; signature text:=datos->>'signatureData';
begin
  if actor is null or not public.has_permission('TRATAMIENTO_ESCRIBIR') or not exists(
    select 1 from public.usuarios_roles ur join public.roles r on r.id=ur.rol_id
    where ur.usuario_id=actor and r.codigo='ODONTOLOGO' and r.activo
  ) then raise exception using errcode='42501',message='La firma requiere un odontólogo autorizado'; end if;
  select * into p from public.planes_tratamiento where id=(datos->>'planId')::bigint for update;
  if not found then raise exception using errcode='P0001',message='Presupuesto no encontrado'; end if;
  -- Un reintento conserva exactamente la primera firma y no repite la aceptación.
  if exists(select 1 from public.acuerdos_presupuesto a where a.plan_id=p.id) then
    return public.obtener_acuerdo_presupuesto(p.id);
  end if;
  if p.version is distinct from (datos->>'version')::bigint or p.estado not in ('PRESENTADO','ACEPTADO','EN_PROCESO','COMPLETADO') then
    raise exception using errcode='P0001',message='El presupuesto cambió. Actualice y solicite una nueva firma';
  end if;
  if coalesce((datos->>'confirmation')::boolean,false) is not true or signature is null
    or signature !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or char_length(signature) not between 100 and 150000 then
    raise exception using errcode='P0001',message='Revise el presupuesto y registre la firma del paciente';
  end if;
  if p.estado='PRESENTADO' then
    perform public.gestionar_plan_interno('ESTADO',jsonb_build_object('planId',p.id,'version',p.version,'status','ACEPTADO','patientAcceptance',true));
    select * into p from public.planes_tratamiento where id=p.id;
  end if;
  insert into public.acuerdos_presupuesto(plan_id,detalle,firma_png,registrado_por)
    values(p.id,public.plan_json(p),signature,actor);
  perform public.registrar_auditoria('FIRMAR_PRESUPUESTO','PLAN_TRATAMIENTO',p.id::text,p.codigo);
  return public.obtener_acuerdo_presupuesto(p.id);
end $$;

create or replace function public.pago_json(p public.pagos) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'accountId',p.cuenta_id,'patientId',p.paciente_id,
    'patientName',concat_ws(' ',x.nombres,x.apellido_paterno,x.apellido_materno),'planId',p.plan_id,'planCode',t.codigo,
    'cashSessionId',p.sesion_caja_id,'paymentMethodId',m.id,'paymentMethod',m.nombre,'amount',p.monto,
    'reference',p.referencia,'receiptNumber',p.numero_constancia,'status',p.estado,'registeredAt',p.registrado_en,
    'version',p.version,'voidedAt',p.anulado_en,'voidedBy',p.anulado_por,'voidReason',p.motivo_anulacion)
  from public.pacientes x join public.planes_tratamiento t on t.id=p.plan_id
    join public.metodos_pago m on m.id=p.metodo_pago_id where x.id=p.paciente_id
$$;

create function public.anular_pago_firmado(datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor bigint:=public.validar_finanza(); cash public.sesiones_caja; p public.pagos;
  reason text:=btrim(datos->>'reason'); account public.cuentas_por_cobrar;
begin
  if coalesce((datos->>'confirmation')::boolean,false) is not true or reason is null or char_length(reason) not between 5 and 500 then
    raise exception using errcode='P0001',message='Confirme la anulación e indique un motivo de 5 a 500 caracteres';
  end if;
  -- Mismo orden de bloqueos que los cobros: caja, cuenta y pago.
  select * into cash from public.sesiones_caja where estado='ABIERTA' for update;
  select * into p from public.pagos where id=(datos->>'paymentId')::bigint;
  if not found then raise exception using errcode='P0001',message='Pago no encontrado'; end if;
  select * into account from public.cuentas_por_cobrar where id=p.cuenta_id for update;
  select * into p from public.pagos where id=p.id for update;
  if p.estado='ANULADO' then return public.pago_json(p); end if;
  if cash.id is null or cash.id<>p.sesion_caja_id then
    raise exception using errcode='P0001',message='Solo puede anular cobros de la caja que sigue abierta. Una caja cerrada requiere una devolución conciliada';
  end if;
  if p.version is distinct from (datos->>'version')::bigint or account.estado='ANULADA' or account.monto_pagado<p.monto then
    raise exception using errcode='P0001',message='El pago o la cuenta cambiaron. Actualice antes de anular';
  end if;
  update public.pagos set estado='ANULADO',anulado_por=actor,anulado_en=now(),motivo_anulacion=reason,version=version+1
    where id=p.id returning * into p;
  update public.cuentas_por_cobrar set monto_pagado=monto_pagado-p.monto,saldo=saldo+p.monto,
    estado=case when monto_pagado-p.monto=0 then 'PENDIENTE' else 'PARCIAL' end,version=version+1,actualizado_en=now()
    where id=account.id;
  insert into public.movimientos_caja(sesion_caja_id,tipo,categoria,origen,origen_id,metodo_pago_id,monto,descripcion,creado_por)
    values(cash.id,'EGRESO','ANULACION_COBRO','ANULACION_PAGO',p.id,p.metodo_pago_id,p.monto,'Anulación '||p.numero_constancia,actor);
  perform public.registrar_auditoria('ANULAR_PAGO','FINANZAS',p.id::text,reason);
  return public.pago_json(p);
end $$;

revoke all on function public.obtener_acuerdo_presupuesto(bigint),public.firmar_presupuesto(jsonb),
  public.gestionar_plan(text,jsonb),public.anular_pago_firmado(jsonb) from public,anon;
grant execute on function public.obtener_acuerdo_presupuesto(bigint),public.firmar_presupuesto(jsonb),
  public.gestionar_plan(text,jsonb),public.anular_pago_firmado(jsonb) to authenticated;

-- Las devoluciones de cobros reducen ingresos; no son gastos del consultorio.
alter function public.resumen_finanzas(timestamptz,timestamptz) rename to resumen_finanzas_base;
revoke all on function public.resumen_finanzas_base(timestamptz,timestamptz) from public,anon,authenticated;
create function public.resumen_finanzas(desde timestamptz,hasta timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; adjusted numeric; cash_adjusted numeric; voided_count bigint;
begin
  result:=public.resumen_finanzas_base(desde,hasta);
  select coalesce(sum(m.monto),0),coalesce(sum(m.monto) filter(where pm.codigo='EFECTIVO'),0),count(*)
    into adjusted,cash_adjusted,voided_count from public.movimientos_caja m
    join public.metodos_pago pm on pm.id=m.metodo_pago_id
    where m.origen='ANULACION_PAGO' and m.creado_en between desde and hasta;
  return result || jsonb_build_object(
    'income',(result->>'income')::numeric-adjusted,
    'expenses',(result->>'expenses')::numeric-adjusted,
    'cashIncome',(result->>'cashIncome')::numeric-cash_adjusted,
    'digitalIncome',(result->>'digitalIncome')::numeric-(adjusted-cash_adjusted),
    'voidedPaymentsCount',voided_count,'voidedAmount',adjusted);
end $$;
revoke all on function public.resumen_finanzas(timestamptz,timestamptz) from public,anon;
grant execute on function public.resumen_finanzas(timestamptz,timestamptz) to authenticated;
