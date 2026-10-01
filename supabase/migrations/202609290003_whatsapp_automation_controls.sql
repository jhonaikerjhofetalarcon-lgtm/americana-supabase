-- Controles explícitos para activar cada automatización después de probar la conexión.
insert into public.configuracion_sistema(clave, valor, descripcion)
values
  ('whatsapp.automatizacion.activa', 'false', 'Interruptor general de automatizaciones de WhatsApp'),
  ('whatsapp.automatizacion.citas', 'false', 'Confirmaciones, cancelaciones y recordatorios de citas por WhatsApp'),
  ('whatsapp.automatizacion.reservas', 'false', 'Menú y reserva de citas por WhatsApp con horarios disponibles'),
  ('whatsapp.automatizacion.postconsulta', 'false', 'Seguimientos postconsulta enviados por WhatsApp')
on conflict (clave) do nothing;

update public.configuracion_sistema
set valor = 'false'
where clave in (
  'whatsapp.automatizacion.activa',
  'whatsapp.automatizacion.citas',
  'whatsapp.automatizacion.reservas',
  'whatsapp.automatizacion.postconsulta'
) and valor not in ('true', 'false');

alter table public.configuracion_sistema
  add constraint chk_configuracion_whatsapp_automatizacion_boolean
  check (
    clave not in (
      'whatsapp.automatizacion.activa',
      'whatsapp.automatizacion.citas',
      'whatsapp.automatizacion.reservas',
      'whatsapp.automatizacion.postconsulta'
    ) or valor in ('true', 'false')
  );

create or replace function public.cancelar_reservas_whatsapp_al_pausar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.clave in ('whatsapp.automatizacion.activa', 'whatsapp.automatizacion.reservas')
    and new.valor = 'false' then
    delete from public.whatsapp_reservas_flujo;
  end if;
  return new;
end;
$$;

drop trigger if exists cancelar_reservas_whatsapp_al_pausar on public.configuracion_sistema;
create trigger cancelar_reservas_whatsapp_al_pausar
after update of valor on public.configuracion_sistema
for each row execute function public.cancelar_reservas_whatsapp_al_pausar();

revoke all on function public.cancelar_reservas_whatsapp_al_pausar() from public, anon, authenticated;
