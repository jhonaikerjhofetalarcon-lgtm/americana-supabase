 # Guía de conexión — Supabase y WhatsApp Cloud API

Esta guía parte del código terminado en la rama `migration/supabase-phase-1`. Reemplace todos los
valores entre `<...>` y nunca copie secretos a Angular, capturas, chats ni Git.

## 1. Crear y conectar Supabase

1. Cree un proyecto en Supabase y espere a que la base esté disponible.
2. En su terminal, desde la raíz del repositorio:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

3. En **Project Settings → API Keys**, copie la URL del proyecto y la clave pública
   `publishable` (o la clave `anon` heredada). Cambie solo estos dos valores en
   `dental-americana-supabase/src/environments/environment.ts`:

```ts
supabaseUrl: 'https://<PROJECT_REF>.supabase.co',
supabaseAnonKey: '<CLAVE_PUBLICA>',
```

La clave `service_role`/secret no se coloca aquí: omite RLS y solo debe vivir en servidor.

4. En **Authentication → URL Configuration** configure:

```text
Site URL: https://<SU_DOMINIO>
Redirect URL: https://<SU_DOMINIO>/sistema/login
```

Agregue también `http://localhost:4200/sistema/login` mientras prueba localmente.

5. En **Authentication → Users**, cree el primer propietario odontólogo con correo real y contraseña fuerte.
   El trigger creará su perfil. Luego ejecute una sola vez en **SQL Editor**, cambiando el correo:

```sql
insert into public.usuarios_roles(usuario_id, rol_id)
select u.id, r.id
from public.usuarios u cross join public.roles r
where lower(u.email) = lower('<CORREO_ADMIN>')
  and r.codigo in ('ADMINISTRADOR', 'ODONTOLOGO')
on conflict do nothing;
```

Salga y vuelva a entrar para refrescar permisos. Desde Administración podrá crear perfiles de propietario
odontólogo, odontólogo, recepción y caja.

## 2. Desplegar las Edge Functions

```bash
npx supabase functions deploy whatsapp-send
npx supabase functions deploy whatsapp-dispatch
npx supabase functions deploy whatsapp-webhook
npx supabase functions deploy copilot-generate
npx supabase functions deploy copilot-chat
npx supabase functions deploy admin-create-user
```

`whatsapp-webhook` y `whatsapp-dispatch` tienen `verify_jwt = false` porque Meta y Cron no poseen una
sesión de usuario. No están abiertos sin control: el webhook valida firma Meta y el despachador exige un
secreto propio. Las demás funciones conservan autenticación de usuario.

## 3. Preparar WhatsApp en Meta

1. Cree o use un **Business Portfolio** verificado en Meta Business.
2. En Meta for Developers cree una aplicación de tipo Business y agregue **WhatsApp**.
3. En **WhatsApp → API Setup** agregue y verifique el número de la clínica. Guarde:
   - `Phone Number ID` (no es el número visible);
   - `WhatsApp Business Account ID`;
   - el secreto de la aplicación de **App Settings → Basic**.
4. Para producción cree un **System User** en Business Settings, asígnele la aplicación y la cuenta de
   WhatsApp, y genere un token con `whatsapp_business_messaging` y
   `whatsapp_business_management`. No use el token temporal para producción.
5. En WhatsApp Manager cree estas tres plantillas de categoría **Utility**, idioma Español. Los nombres y
   el orden de variables deben coincidir:

| Nombre en Meta | Cuerpo | Variables enviadas |
|---|---|---|
| `dental_cita_confirmacion` | `Hola {{1}}, tiene una cita el {{2}} a las {{3}}. Responda CONFIRMO o solicite reprogramación.` | paciente, fecha, hora |
| `dental_cita_recordatorio` | `Hola {{1}}, le recordamos su cita del {{2}} a las {{3}} en Consultorio Dental Americana.` | paciente, fecha, hora |
| `dental_postconsulta` | `Hola {{1}}, ¿cómo se siente después de su atención? Puede responder con sus propias palabras.` | paciente |

Espere a que Meta marque cada plantilla como aprobada. Las plantillas son necesarias para mensajes
iniciados por la clínica fuera de la ventana de atención; el envío manual de texto libre se usa cuando la
conversación de servicio está abierta.

## 4. Cargar secretos de WhatsApp en Supabase

Genere dos valores aleatorios distintos para verificación y Cron. Por ejemplo:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Copie `supabase/functions/.env.example` como `supabase/functions/.env`, complete sus valores reales y
cárguelos. Si su terminal está dentro de `dental-americana-supabase` (como en este proyecto), la ruta
correcta lleva `../`:

```bash
npx supabase secrets set --env-file ../supabase/functions/.env
npx supabase secrets list
```

Variables obligatorias:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_GRAPH_VERSION
WHATSAPP_VERIFY_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_CRON_SECRET
WHATSAPP_TEMPLATE_CITA_CONFIRMACION
WHATSAPP_TEMPLATE_CITA_RECORDATORIO
WHATSAPP_TEMPLATE_POSTCONSULTA
WHATSAPP_TEMPLATE_LANGUAGE=es
```

Use una versión vigente de Graph API mostrada en la documentación/panel de Meta. Cambiar secretos en
Supabase no requiere volver a desplegar las funciones.

## 5. Conectar el webhook de Meta

En **Meta Developers → WhatsApp → Configuration → Webhooks**:

```text
Callback URL:
https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook

Verify token:
el mismo valor de WHATSAPP_VERIFY_TOKEN
```

Verifique la URL y suscriba el campo `messages`. El endpoint acepta el `GET` de verificación y, en cada
`POST`, valida `x-hub-signature-256` con `WHATSAPP_APP_SECRET`. Una firma inválida devuelve 403.

## 6. Programar el despachador cada minuto

La forma más simple es **Dashboard → Integrations → Cron → Create job**: seleccione una petición HTTP
`POST` cada minuto a:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-dispatch
```

Agregue los encabezados `Content-Type: application/json` y
`x-cron-secret: <WHATSAPP_CRON_SECRET>`, con cuerpo `{}`. Si prefiere SQL, guarde la URL y el secreto en
Supabase Vault y programe `pg_net`:

```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<WHATSAPP_CRON_SECRET>', 'whatsapp_cron_secret');

select cron.schedule(
  'dental-whatsapp-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/whatsapp-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

Si el Dashboard solicita habilitarlas, active las extensiones `pg_cron`, `pg_net` y Vault. Revise el
historial del Job y los logs de `whatsapp-dispatch` después de crearlo. Para actualizar un cron ya
creado sin volver a copiar el SQL, ejecute `npx supabase db query --linked --file supabase/ops/whatsapp-dispatch-cron.sql`
desde la raíz del repositorio. El límite HTTP predeterminado de `pg_net` es 5 segundos; por eso aquí
se configura en 120 segundos. El despachador procesa hasta 5 mensajes por ejecución.

## 7. Prueba final controlada

1. Ingrese con el propietario odontólogo y confirme que puede ver Agenda, Atención, Finanzas, DentalIA y Ajustes.
2. Cree un paciente de prueba con celular en formato internacional, por ejemplo `51XXXXXXXXX`, y marque
   autorización WhatsApp solo con consentimiento real.
3. Cree una cita futura. Debe aparecer una confirmación en Seguimientos.
4. Ejecute el Cron o espere un minuto; verifique estado `ENVIADO` y luego `ENTREGADO`.
5. Desde el teléfono responda `CONFIRMO`: la cita debe pasar a `CONFIRMADA`.
6. Reprográmela: los mensajes pendientes anteriores deben quedar `CANCELADO` y debe generarse una nueva
   confirmación.
7. Finalice una atención de prueba: debe programarse un seguimiento para 24 horas después.
8. Pruebe una frase clínica de alerta solo con datos ficticios; debe quedar derivada para revisión.

Revise **Edge Functions → Logs**, **Cron → Job runs**, `mensajes_whatsapp`, `cita_historial_estados` y
`auditoria`. No haga la primera prueba masiva: use uno o dos números autorizados.

## 8. Reservas guiadas por WhatsApp con Evolution API

La migración `202609290001_whatsapp_self_booking.sql` añade el menú de citas. El paciente registrado,
con número único y autorización de WhatsApp, envía `HOLA` o `RESERVAR`; recibe tres horas disponibles
para **consulta y evaluación** y responde `1`, `2` o `3`. Las horas fijas son 09:00, 10:00, 11:00,
15:00, 16:00 y 17:00, hora de Perú, según las jornadas de los odontólogos. La selección vence a los
10 minutos. La agenda se valida de nuevo justo antes de crear la cita, para evitar dobles reservas.
`CANCELAR` cancela una única cita futura identificable; si hay varias o falta una identidad segura,
recepción revisa el mensaje. `REPROGRAMAR` se deriva a recepción. El número desconocido también
requiere revisión antes de agendar.

El modo predeterminado ofrece opciones numeradas en texto porque la conexión actual usa Baileys.
Los botones reales se habilitan con `EVOLUTION_INTERACTIVE_BUTTONS=true` **solo después** de comprobar
en un teléfono real que la versión instalada de Evolution los entrega y recibe: algunas versiones
[aceptan `sendButtons` pero no entregan el mensaje](https://github.com/evolution-foundation/evolution-api/issues/2404).
Si el proveedor rechaza el botón con un error HTTP 4xx, el despachador envía el texto con las mismas
opciones. Una respuesta ambigua o un fallo de entrega requiere revisión manual.

Prueba de extremo a extremo con un paciente de ensayo autorizado: `HOLA` → `RESERVAR` → elegir una
hora → comprobar la cita `WHATSAPP` en agenda → `CONFIRMO` → `CANCELAR` → comprobar que el turno
quedó libre. Repetir con una hora ocupada entre la oferta y la respuesta, con dos citas futuras y
con un número desconocido. El webhook y el despachador deben desplegarse tras aplicar la migración.


## 9. Copiloto IA opcional

`copilot-generate` funciona con un borrador estructurado local. Para conectar Gemini o un proveedor
compatible, configure su API key como secreto; para el proveedor compatible también hacen falta
`AI_API_URL` y `AI_MODEL`. El envío de datos clínicos a terceros permanece desactivado hasta establecer
`EXTERNAL_AI_ENABLED=true` en Supabase Secrets. Antes de activarlo, revise consentimiento, condiciones
del proveedor y los posibles identificadores en textos clínicos libres. La aprobación profesional
continúa siendo obligatoria; nunca coloque esa clave en Angular.

## Lista de salida a producción

- Dominio con HTTPS y URLs de Auth registradas.
- Primer administrador y roles comprobados.
- RUC, dirección, teléfono y horario revisados en Configuración.
- Políticas de privacidad, consentimiento WhatsApp y retención de historias aprobadas por el responsable.
- Backups y restauración ensayados.
- Número y negocio aprobados por Meta; token de System User guardado como secreto.
- Tres plantillas aprobadas, webhook `messages` activo y Cron con ejecuciones correctas.
- Prueba de confirmación, cancelación, recordatorio, seguimiento, alerta y reintento completada.
- Monitoreo de errores, consumo y calidad del número activado.

Referencias oficiales: [Supabase CLI y despliegue](https://supabase.com/docs/guides/deployment/database-migrations),
[secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets),
[programar Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions),
[Supabase Cron](https://supabase.com/docs/guides/cron),
[WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/),
[colección oficial de Meta para webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/ozgs3jn/webhook-subscriptions).
