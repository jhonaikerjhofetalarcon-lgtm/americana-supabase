-- Ejecutar solo en una base aislada. Todos los datos se revierten al terminar.
begin;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.payment_user', true), '')::uuid
$$;
create function pg_temp.assert_payment(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
do $$
declare
  uid uuid := '9ad8269c-75b5-499f-96dd-a9f4879b0002';
  actor bigint; patient bigint; plan bigint; account bigint; role_id bigint;
  payload jsonb; receipt jsonb; duplicate jsonb; denied boolean; cancelled jsonb; summary jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data)
    values(uid,'payment-test@example.invalid','{"username":"payment-test"}');
  select id into actor from public.usuarios where auth_user_id=uid;
  insert into public.roles(codigo,nombre) values('PAYMENT_TEST','Prueba de pagos') returning id into role_id;
  insert into public.roles_permisos(rol_id,permiso_id)
    select role_id,id from public.permisos where codigo in ('FINANZA_LEER','FINANZA_ESCRIBIR');
  insert into public.usuarios_roles(usuario_id,rol_id) values(actor,role_id);
  perform set_config('test.payment_user',uid::text,true);
  insert into public.pacientes(numero_historia,tipo_documento,nombres,apellido_paterno,fecha_nacimiento,sexo,creado_por,actualizado_por)
    values('PAYMENT-1','SIN_DOCUMENTO','Paciente','Prueba','1990-01-01','FEMENINO',actor,actor) returning id into patient;
  insert into public.planes_tratamiento(paciente_id,codigo,estado,subtotal,total,aceptado_por_paciente,aceptado_en,creado_por,actualizado_por)
    values(patient,'PLAN-PAYMENT-TEST','ACEPTADO',300,300,true,now(),actor,actor) returning id into plan;
  insert into public.cuentas_por_cobrar(plan_id,paciente_id,monto_total,saldo)
    values(plan,patient,300,300) returning id into account;
  insert into public.sesiones_caja(abierta_por,monto_apertura) values(actor,0);
  payload := jsonb_build_object(
    'accountId',account,'accountVersion',0,'planVersion',0,'amount',100,'confirmation',true,
    'paymentMethodId',(select id from public.metodos_pago where codigo='EFECTIVO'),
    'operationId','9ad8269c-75b5-499f-96dd-a9f4879b0100',
    'signatureData','data:image/png;base64,' || repeat('A',100));
  denied := false;
  begin perform public.registrar_adelanto_firmado(payload - 'signatureData');
    exception when sqlstate 'P0001' then denied := true; end;
  perform pg_temp.assert_payment(denied,'Rechaza pagos sin firma');
  receipt := public.registrar_adelanto_firmado(payload);
  duplicate := public.registrar_adelanto_firmado(payload);
  perform pg_temp.assert_payment(receipt=duplicate,'Reintento devuelve la misma constancia');
  perform pg_temp.assert_payment((select count(*)=1 from public.pagos where cuenta_id=account),'No duplica el cobro');
  perform pg_temp.assert_payment((select saldo=200 and monto_pagado=100 from public.cuentas_por_cobrar where id=account),'Actualiza saldo una sola vez');
  perform pg_temp.assert_payment((receipt->'agreement'->>'balanceAfter')::numeric=200,'Constancia conserva el saldo firmado');
  payload := payload || '{"operationId":"9ad8269c-75b5-499f-96dd-a9f4879b0101"}'::jsonb;
  denied := false;
  begin perform public.registrar_adelanto_firmado(payload);
    exception when sqlstate 'P0001' then denied := true; end;
  perform pg_temp.assert_payment(denied,'Rechaza una version desactualizada de la cuenta');
  payload := payload || '{"accountVersion":1,"amount":250}'::jsonb;
  denied := false;
  begin perform public.registrar_adelanto_firmado(payload);
    exception when sqlstate 'P0001' then denied := true; end;
  perform pg_temp.assert_payment(denied,'Rechaza un importe mayor que el saldo');
  perform pg_temp.assert_payment(not has_function_privilege('authenticated','public.registrar_pago(jsonb)','EXECUTE'),'No permite eludir la firma mediante el RPC anterior');
  denied := false;
  begin perform public.anular_pago_firmado(jsonb_build_object('paymentId',receipt->'payment'->'id','version',99,'reason','Cobro duplicado','confirmation',true));
    exception when sqlstate 'P0001' then denied := true; end;
  perform pg_temp.assert_payment(denied,'No anula una version desactualizada');
  payload := jsonb_build_object('paymentId',receipt->'payment'->'id','version',0,'reason','Cobro duplicado','confirmation',true);
  cancelled := public.anular_pago_firmado(payload);
  duplicate := public.anular_pago_firmado(payload);
  perform pg_temp.assert_payment(cancelled=duplicate,'Anulacion idempotente');
  perform pg_temp.assert_payment((select saldo=300 and monto_pagado=0 and estado='PENDIENTE' from public.cuentas_por_cobrar where id=account),'La anulacion restituye el saldo una vez');
  perform pg_temp.assert_payment((select count(*)=1 from public.movimientos_caja where origen='ANULACION_PAGO'),'Un solo ajuste en caja');
  perform pg_temp.assert_payment(public.obtener_acuerdo_pago((receipt->'payment'->>'id')::bigint)->'agreement'=receipt->'agreement','Conserva el documento firmado original');
  perform pg_temp.assert_payment(cancelled->>'voidReason'='Cobro duplicado' and (cancelled->>'voidedBy')::bigint=actor,'Conserva motivo y responsable');
  summary := public.resumen_finanzas(now()-interval '1 day',now()+interval '1 day');
  perform pg_temp.assert_payment((summary->>'income')::numeric=0 and (summary->>'expenses')::numeric=0 and (summary->>'net')::numeric=0,'La anulacion reduce ingresos sin inflar gastos');
  -- Un segundo pago no puede anularse tras cerrar la caja.
  payload := jsonb_build_object('accountId',account,'accountVersion',2,'planVersion',0,'amount',100,'confirmation',true,
    'paymentMethodId',(select id from public.metodos_pago where codigo='EFECTIVO'),
    'operationId','9ad8269c-75b5-499f-96dd-a9f4879b0102','signatureData','data:image/png;base64,'||repeat('A',100));
  receipt := public.registrar_adelanto_firmado(payload);
  perform public.cerrar_caja((receipt->'payment'->>'cashSessionId')::bigint,100,'Prueba',0,true);
  denied := false;
  begin perform public.anular_pago_firmado(jsonb_build_object('paymentId',receipt->'payment'->'id','version',0,'reason','Cobro duplicado','confirmation',true));
    exception when sqlstate 'P0001' then denied := true; end;
  perform pg_temp.assert_payment(denied,'No altera una caja cerrada');
  raise notice 'Adelanto: firma obligatoria, saldo, constancia, reintentos y version verificados';
end $$;
rollback;
