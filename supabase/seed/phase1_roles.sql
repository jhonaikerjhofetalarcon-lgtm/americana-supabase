-- Roles y permisos ya se insertan de forma idempotente en la migración base.
-- Después de crear el primer usuario en Supabase Auth, asígnele el perfil propietario odontólogo:
insert into public.usuarios_roles(usuario_id, rol_id)
select u.id, r.id
from public.usuarios u cross join public.roles r
where u.username = 'REEMPLAZAR_USUARIO_ADMIN'
  and r.codigo in ('ADMINISTRADOR', 'ODONTOLOGO')
on conflict do nothing;
