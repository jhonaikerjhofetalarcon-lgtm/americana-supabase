-- Una constancia firmada conserva el presupuesto y el saldo tal como se mostraron al cobrar.
create table public.acuerdos_pago (
  pago_id bigint primary key references public.pagos(id) on delete restrict,
  detalle jsonb not null,
  firma_png text not null,
  registrado_en timestamptz not null default now(),
  constraint acuerdo_firma_png check (firma_png like 'data:image/png;base64,%' and char_length(firma_png) between 100 and 150000)
);
alter table public.acuerdos_pago enable row level security;
revoke all on public.acuerdos_pago from public, anon, authenticated;

create or replace function public.obtener_acuerdo_pago(pago_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_permission('FINANZA_LEER') then
    raise exception using errcode = '42501', message = 'No autorizado para consultar constancias';
  end if;
  select jsonb_build_object(
    'payment', public.pago_json(p), 'agreement', a.detalle, 'signatureData', a.firma_png
  ) into result
  from public.pagos p join public.acuerdos_pago a on a.pago_id = p.id
  where p.id = obtener_acuerdo_pago.pago_id;
  return result;
end $$;

create or replace function public.listar_acuerdos_plan(plan_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_permission('FINANZA_LEER') then
    raise exception using errcode = '42501', message = 'No autorizado para consultar constancias';
  end if;
  select coalesce(jsonb_agg(public.pago_json(p) order by p.registrado_en desc), '[]'::jsonb)
  into result from public.pagos p join public.acuerdos_pago a on a.pago_id = p.id
  where p.plan_id = listar_acuerdos_plan.plan_id;
  return result;
end $$;

create or replace function public.registrar_adelanto_firmado(datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor bigint := public.validar_finanza();
  cash public.sesiones_caja;
  account public.cuentas_por_cobrar;
  plan public.planes_tratamiento;
  patient public.pacientes;
  payment jsonb;
  prior jsonb;
  receipt jsonb;
  amount numeric(12,2);
  signature text := datos ->> 'signatureData';
  operation_id uuid;
  existing_payment_id bigint;
begin
  if datos ->> 'operationId' is null or
     datos ->> 'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'Identificador de operación inválido';
  end if;
  operation_id := (datos ->> 'operationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation_id::text, 0));
  select public.obtener_acuerdo_pago(p.id) into prior from public.pagos p
  where p.solicitud_id = operation_id and p.registrado_por = actor;
  if prior is not null then return prior; end if;
  select p.id into existing_payment_id from public.pagos p where p.solicitud_id = operation_id;
  if existing_payment_id is not null then
    raise exception using errcode = 'P0001', message = 'Esta operación ya existe sin un acuerdo firmado';
  end if;
  if signature is null or signature !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or
     char_length(signature) not between 100 and 150000 then
    raise exception using errcode = 'P0001', message = 'El paciente debe firmar el acuerdo en pantalla';
  end if;
  if coalesce((datos ->> 'confirmation')::boolean, false) is not true then
    raise exception using errcode = 'P0001', message = 'Confirme el acuerdo de pago';
  end if;
  if jsonb_typeof(datos -> 'amount') <> 'number' then
    raise exception using errcode = 'P0001', message = 'Monto inválido';
  end if;
  amount := (datos ->> 'amount')::numeric;
  select * into cash from public.sesiones_caja where estado = 'ABIERTA' for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Abra la caja antes de cobrar';
  end if;
  select * into account from public.cuentas_por_cobrar
  where id = (datos ->> 'accountId')::bigint for update;
  if not found or account.version is distinct from (datos ->> 'accountVersion')::bigint or
     account.estado not in ('PENDIENTE', 'PARCIAL') or amount <= 0 or amount > account.saldo then
    raise exception using errcode = 'P0001', message = 'El saldo cambió. Actualice el presupuesto antes de firmar';
  end if;
  select * into plan from public.planes_tratamiento where id = account.plan_id;
  if plan.version is distinct from (datos ->> 'planVersion')::bigint or
     plan.estado not in ('ACEPTADO', 'EN_PROCESO', 'COMPLETADO') then
    raise exception using errcode = 'P0001', message = 'El presupuesto cambió. Revíselo antes de firmar';
  end if;
  select * into patient from public.pacientes where id = account.paciente_id;
  receipt := jsonb_build_object(
    'patientName', concat_ws(' ', patient.nombres, patient.apellido_paterno, patient.apellido_materno),
    'patientDocument', patient.numero_documento,
    'planCode', plan.codigo,
    'planTotal', account.monto_total,
    'paidBefore', account.monto_pagado,
    'paymentAmount', amount,
    'paidAfter', account.monto_pagado + amount,
    'balanceAfter', account.saldo - amount,
    'terms', 'He revisado el presupuesto y confirmo el importe entregado como adelanto o abono. El saldo indicado queda pendiente de pago.',
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'name', s.nombre, 'tooth', i.pieza, 'quantity', i.cantidad,
      'subtotal', i.cantidad * i.precio_unitario) order by i.id)
      from public.plan_tratamiento_items i join public.servicios s on s.id = i.servicio_id
      where i.plan_id = plan.id and i.activo), '[]'::jsonb)
  );
  payment := public.registrar_pago(datos);
  insert into public.acuerdos_pago(pago_id, detalle, firma_png)
  values ((payment ->> 'id')::bigint, receipt, signature);
  perform public.registrar_auditoria('FIRMAR_ADELANTO', 'FINANZAS', payment ->> 'id', plan.codigo);
  return jsonb_build_object('payment', payment, 'agreement', receipt, 'signatureData', signature);
end $$;

revoke all on function public.obtener_acuerdo_pago(bigint) from public;
revoke all on function public.listar_acuerdos_plan(bigint) from public;
revoke all on function public.registrar_adelanto_firmado(jsonb) from public;
revoke execute on function public.registrar_pago(jsonb) from authenticated;
grant execute on function public.obtener_acuerdo_pago(bigint) to authenticated;
grant execute on function public.listar_acuerdos_plan(bigint) to authenticated;
grant execute on function public.registrar_adelanto_firmado(jsonb) to authenticated;
