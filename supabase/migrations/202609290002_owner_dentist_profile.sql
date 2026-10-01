-- Un consultorio operado por su propietario necesita administración y firma clínica.
-- Conservamos ambos roles porque varias acciones sensibles exigen ODONTOLOGO de forma explícita.

insert into public.usuarios_roles(usuario_id, rol_id)
select distinct administrator.usuario_id, dentist.id
from public.usuarios_roles administrator
join public.roles administrator_role
  on administrator_role.id = administrator.rol_id
  and administrator_role.codigo = 'ADMINISTRADOR'
  and administrator_role.activo
join public.usuarios user_account
  on user_account.id = administrator.usuario_id
  and user_account.activo
  and not user_account.bloqueado
cross join public.roles dentist
where dentist.codigo = 'ODONTOLOGO'
  and dentist.activo
on conflict (usuario_id, rol_id) do nothing;

update public.roles
set descripcion = 'Propietario o responsable con acceso completo y configuración del sistema'
where codigo = 'ADMINISTRADOR';
