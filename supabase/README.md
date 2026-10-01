# Supabase — Dental Americana

## Local

```bash
npx supabase start
npx supabase db reset
npx supabase functions serve
```

Las migraciones crean el esquema, roles, RLS, RPC, Storage, Realtime, mensajería, copiloto y
administración. El reset no crea usuarios operativos.

Después de crear el primer usuario en Supabase Auth, asígnele explícitamente el perfil propietario odontólogo con
`seed/phase1_roles.sql`, reemplazando primero `REEMPLAZAR_USUARIO_ADMIN`. No ejecute el archivo con el
marcador original.

## Remoto

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
npx supabase functions deploy
```

Angular recibe únicamente URL y clave pública. Los tokens de WhatsApp, la clave IA y cualquier clave
privilegiada se administran como secretos de Edge Functions. Consulte
`../GUIA_CONEXION_SUPABASE_WHATSAPP.md`.
