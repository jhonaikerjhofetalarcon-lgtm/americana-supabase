begin;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.budget_user',true),'')::uuid
$$;
create function pg_temp.assert_budget(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end $$;
do $$
declare actor bigint; patient bigint; plan bigint; version bigint; payload jsonb; result jsonb; denied boolean;
  uid uuid:='9ad8269c-75b5-499f-96dd-a9f4879b0003';
begin
  insert into auth.users(id,email,raw_user_meta_data) values(uid,'budget-test@example.invalid','{"username":"budget-test"}');
  select id into actor from public.usuarios where auth_user_id=uid;
  insert into public.usuarios_roles(usuario_id,rol_id) select actor,id from public.roles where codigo='ODONTOLOGO';
  perform set_config('test.budget_user',uid::text,true);
  insert into public.pacientes(numero_historia,tipo_documento,nombres,apellido_paterno,fecha_nacimiento,sexo,creado_por,actualizado_por)
    values('BUDGET-1','SIN_DOCUMENTO','Paciente','Presupuesto','1990-01-01','FEMENINO',actor,actor) returning id into patient;
  plan:=public.gestionar_plan('CREAR',jsonb_build_object('patientId',patient));
  perform public.gestionar_plan('AGREGAR_ITEM',jsonb_build_object('planId',plan,
    'serviceId',(select id from public.servicios where codigo='CONSULTA'),'quantity',1,'unitPrice',300,'sessions',1));
  select p.version into version from public.planes_tratamiento p where p.id=plan;
  perform public.gestionar_plan('ESTADO',jsonb_build_object('planId',plan,'version',version,'status','PRESENTADO'));
  select p.version into version from public.planes_tratamiento p where p.id=plan;
  payload:=jsonb_build_object('planId',plan,'version',version,'signatureData','data:image/png;base64,'||repeat('A',100),'confirmation',true);
  denied:=false;
  begin perform public.gestionar_plan('ESTADO',jsonb_build_object('planId',plan,'version',version,'status','ACEPTADO','patientAcceptance',true));
    exception when sqlstate 'P0001' then denied:=true; end;
  perform pg_temp.assert_budget(denied,'Requiere firma para aceptar');
  denied:=false;
  begin perform public.firmar_presupuesto(payload || '{"version":-1}'::jsonb);
    exception when sqlstate 'P0001' then denied:=true; end;
  perform pg_temp.assert_budget(denied,'Rechaza presupuesto cambiado');
  denied:=false;
  begin perform public.firmar_presupuesto(payload - 'signatureData');
    exception when sqlstate 'P0001' then denied:=true; end;
  perform pg_temp.assert_budget(denied,'No acepta sin firma');
  result:=public.firmar_presupuesto(payload);
  perform pg_temp.assert_budget(result=public.firmar_presupuesto(payload),'Reintento conserva la primera firma');
  perform pg_temp.assert_budget(result->'plan'->>'status'='ACEPTADO','Acepta con firma');
  perform pg_temp.assert_budget((result->'plan'->>'total')::numeric=300,'Conserva importe');
  perform pg_temp.assert_budget((select count(*)=1 from public.cuentas_por_cobrar where plan_id=plan),'Genera una sola cuenta');
  select p.version into version from public.planes_tratamiento p where p.id=plan;
  perform public.gestionar_plan('ESTADO',jsonb_build_object('planId',plan,'version',version,'status','EN_PROCESO'));
  perform pg_temp.assert_budget(public.obtener_acuerdo_presupuesto(plan)->'plan'=result->'plan','La evolucion del plan no cambia la copia firmada');
  perform pg_temp.assert_budget(not has_function_privilege('authenticated','public.gestionar_plan_interno(text,jsonb)','EXECUTE'),'No expone la aceptacion interna');
  perform set_config('test.budget_user','',true);
  denied:=false;
  begin perform public.obtener_acuerdo_presupuesto(plan); exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.assert_budget(denied,'No expone firmas sin autorizacion');
  raise notice 'Presupuesto: firma, permisos, versiones, aceptacion, cuenta y copia inmutable verificados';
end $$;
rollback;
