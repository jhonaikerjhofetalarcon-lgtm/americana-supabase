# Preparación para producción — Dental Americana

Esta carpeta prepara un despliegue nuevo, **no lo activa automáticamente**. El entorno actual todavía usa el mismo Supabase remoto para desarrollo y una instalación local de Evolution API; no conviene anunciarlo como producción hasta separar entornos y probar restauración, mensajería y acceso.

## 1. Separar desarrollo y producción

Use Supabase local u otro proyecto para desarrollo y un proyecto diferente para producción. Configure `dental-americana-supabase/src/environments/environment.ts` con la URL y la clave **pública** del proyecto de producción, y `environment.development.ts` con el proyecto de desarrollo. La comprobación previa falla si ambos apuntan al mismo origen. No copie datos clínicos reales al entorno de prueba sin anonimización y autorización.

Antes de aplicar migraciones a producción, pruebe todas las migraciones en un proyecto de ensayo, realice una copia de seguridad de la base y de Storage, y verifique una restauración. En planes Supabase gratuitos no suponga que hay respaldo automático disponible: siga la [guía oficial de respaldos](https://supabase.com/docs/guides/platform/backups). Nunca use `db reset` en producción.

## 2. Preparar el servidor y el túnel nombrado

En `ops/production/`, copie `.env.example` a `.env` y reemplace todos los marcadores por valores reales. Fije **digests sha256** de imágenes probadas; no use `latest`. Genere claves distintas de desarrollo (por ejemplo, con `openssl rand -hex 32`); la contraseña PostgreSQL usada en la URI debe contener solo letras y números.

Cree en Cloudflare un túnel **nombrado** y configure dos hostnames públicos:

- `sistema.su-dominio.com` → `http://web:80`
- `evolution.su-dominio.com` → `http://evolution-api:8080`

Guarde el token del túnel mediante un editor en `ops/production/secrets/cloudflare_tunnel_token` y aplique permisos `0600` tanto a ese archivo como a `.env`. No lo pegue en comandos, chats ni capturas. El token da acceso al túnel; [Cloudflare explica cómo rotarlo y revocarlo](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/).

La red `data` de Docker aísla PostgreSQL y Redis, y el archivo Compose no publica puertos del servidor. Para el hostname de Evolution, configure Cloudflare Access con una política **Service Auth** y un token de servicio; las Edge Functions enviarán `CF-Access-Client-Id` y `CF-Access-Client-Secret` cuando ambos secretos estén configurados. Consulte los [headers y la rotación oficiales](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/). Configure HTTPS y HSTS en Cloudflare; el Nginx de origen sirve HTTP solamente dentro de Docker.

## 3. Verificar sin iniciar contenedores

Desde `ops/production/`:

```bash
node preflight.mjs
docker compose --env-file .env -f docker-compose.yml config --quiet
```

La primera orden nunca imprime valores secretos. No comparta la salida de `docker compose config` **sin** `--quiet`: podría mostrar variables sensibles.

Luego ejecute en la raíz del repositorio:

```bash
cd dental-americana-supabase
npm ci
npm run test:ci
npm run build
npm audit --audit-level=moderate
cd ..
npx deno check supabase/functions/*/index.ts
```

La CI ejecuta estas comprobaciones en cada cambio. El frontend se sirve con CSP, fuentes locales y sin caché persistente de `index.html`; Nginx expone `/healthz` para supervisión.

## 4. Supabase y funciones Edge

En el proyecto de producción, compruebe [RLS, SSL, restricciones de red, MFA y Auth](https://supabase.com/docs/guides/deployment/going-into-prod). Configure la URL del sitio y las redirecciones para `WEB_PUBLIC_ORIGIN`, SMTP propio para correos de recuperación y límites de autenticación. Revise las políticas de Storage y quién puede descargar historiales clínicos.

Guarde en **Supabase Secrets**, nunca en Angular ni Git: `EVOLUTION_API_URL` (el hostname estable), `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_WEBHOOK_SECRET`, `WHATSAPP_CRON_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` y, si se usa DentalIA externa, `GEMINI_API_KEY`. Los dos secretos de Cloudflare Access deben configurarse juntos. Use un archivo local ignorado dentro de `ops/production/secrets/` para cargarlos con `npx supabase secrets set --project-ref "$PROD_REF" --env-file RUTA_DEL_ARCHIVO_REAL` tras verificar el proyecto de destino. DentalIA utiliza borradores locales aunque exista una API key, hasta establecer `EXTERNAL_AI_ENABLED=true`: antes de hacerlo, revise autorización de uso de datos clínicos y condiciones del proveedor. El filtro excluye identificadores estructurados, pero los campos de texto libre todavía podrían contener datos personales.

Despliegue migraciones y funciones primero en ensayo. En producción, registre el cron de `whatsapp-dispatch` con el secreto de Vault y verifique el **HTTP** en `net._http_response`, no solo el estado de `cron.job_run_details`.

Para la reserva por WhatsApp aplique `202609290001_whatsapp_self_booking.sql` antes de actualizar
`whatsapp-webhook` y `whatsapp-dispatch`. Las opciones numeradas funcionan por texto. El secreto
opcional `EVOLUTION_INTERACTIVE_BUTTONS=true` activa botones solo tras verificar en teléfonos reales
que la versión de Evolution y el canal WhatsApp los entregan y devuelven sus respuestas.

## 5. Cambio controlado y pruebas

La instalación de esta carpeta usa volúmenes nuevos. **No conserva automáticamente** los chats, la base ni el QR de Evolution local. Antes de iniciarla decida si migrará esos volúmenes con respaldo verificado o si volverá a vincular WhatsApp por QR. No ejecute `docker compose down -v` sobre datos clínicos o chats.

Solo después de aprobar el preflight y la migración elegida:

```bash
docker compose --env-file .env -f docker-compose.yml build
docker compose --env-file .env -f docker-compose.yml up -d
```

Pruebe con un paciente ficticio y un número propio: iniciar sesión, reservar, confirmar, cancelar, reprogramar, recibir y responder mensajes, ver estados de entrega, restaurar sesión y comprobar móvil/tablet. Compruebe la recuperación de contraseña y la restauración de una copia de seguridad. No envíe pruebas a pacientes reales.

Mantenga los digests anteriores para volver a la versión previa si falla el frontend/Evolution. Las migraciones de base de datos son de avance; planifique un respaldo y una corrección nueva, no un `db reset`. Antes de aceptar pacientes reales, complete la revisión de consentimiento, retención de datos y acceso del personal responsable.
