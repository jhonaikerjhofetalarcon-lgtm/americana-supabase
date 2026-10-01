# WhatsApp Business Cloud API (Meta)

## Flujo implementado

1. Agenda registra una cita mediante la RPC `crear_cita`.
2. El trigger de base de datos crea un mensaje `CITA_CONFIRMACION` en `mensajes_whatsapp`.
3. `whatsapp-dispatch` toma el mensaje pendiente y llama a Meta Cloud API.
4. Meta envía la plantilla aprobada con tres respuestas rápidas: confirmar, cancelar o reprogramar.
5. `whatsapp-webhook` valida la firma de Meta y envía la respuesta a `procesar_respuesta_whatsapp_cita`.
6. La RPC valida teléfono, paciente, cita, contexto e idempotencia antes de cambiar el estado.
7. Agenda muestra el nuevo estado porque utiliza la misma tabla `citas`.

La cita se guarda antes de intentar el envío. Una falla de red o de Meta no elimina ni revierte la cita: el mensaje permanece en la cola para revisión o reintento controlado.

## Seguridad

Los secretos viven solamente en Supabase Edge Functions. No deben agregarse a `src/environments`, Angular, Git ni al navegador.

Configure estos secretos en el proyecto Supabase:

```bash
supabase secrets set WHATSAPP_PROVIDER=meta
supabase secrets set WHATSAPP_ACCESS_TOKEN=REEMPLAZAR
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=REEMPLAZAR
supabase secrets set WHATSAPP_VERIFY_TOKEN=REEMPLAZAR_CON_UN_TOKEN_LARGO
supabase secrets set WHATSAPP_APP_SECRET=REEMPLAZAR
supabase secrets set WHATSAPP_GRAPH_VERSION=REEMPLAZAR_POR_VERSION_VIGENTE
supabase secrets set WHATSAPP_APPOINTMENT_TEMPLATE=dental_cita_confirmacion
supabase secrets set WHATSAPP_TEMPLATE_LANGUAGE=es
supabase secrets set WHATSAPP_CRON_SECRET=REEMPLAZAR_CON_UN_SECRETO_LARGO
```

`WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_CRON_SECRET` deben tener al menos 24 caracteres. La versión de Graph API es configurable para poder actualizarla sin cambiar código.

## Plantilla que debe aprobar Meta

Cree una plantilla de utilidad llamada `dental_cita_confirmacion`, o use otro nombre y guárdelo en `WHATSAPP_APPOINTMENT_TEMPLATE`.

Texto sugerido:

```text
Hola {{1}}. Tu cita en Dental Americana está programada para el {{2}} a las {{3}} por {{4}}. Elige una opción:
```

Agregue tres botones de respuesta rápida, en este orden:

1. `Confirmar`
2. `Cancelar`
3. `Reprogramar`

El sistema envía identificadores internos como `appointment_confirm:123`. El paciente solo ve el texto del botón. El número final identifica una cita concreta y la base de datos comprueba que pertenezca al teléfono que respondió.

Los recordatorios y mensajes iniciados fuera de la ventana de atención de Meta también necesitan plantillas aprobadas. Se pueden asociar mediante `WHATSAPP_TEMPLATE_<TIPO>`, como `WHATSAPP_TEMPLATE_CITA_RECORDATORIO` y `WHATSAPP_TEMPLATE_POSTCONSULTA`.

## Configuración en Meta Developers

1. Cree o seleccione una aplicación de tipo Business y agregue el producto WhatsApp.
2. Vincule el portafolio comercial, la cuenta de WhatsApp Business y el número del consultorio.
3. Obtenga un token permanente con los permisos necesarios para enviar mensajes.
4. Copie el `Phone number ID`, el token y el `App secret` a Supabase Secrets.
5. Despliegue `whatsapp-webhook` y use su URL pública como callback:

   ```text
   https://ID_DEL_PROYECTO.supabase.co/functions/v1/whatsapp-webhook
   ```

6. En Meta use exactamente el mismo valor de `WHATSAPP_VERIFY_TOKEN` y suscriba el campo `messages`.
7. Cree y espere la aprobación de la plantilla antes de probar una confirmación real.

El endpoint `GET` responde al reto de verificación de Meta. Cada `POST` exige una firma válida `x-hub-signature-256`, calculada con `WHATSAPP_APP_SECRET`.

## Migración y despliegue

Revise primero el proyecto Supabase enlazado y luego ejecute:

```bash
supabase db push
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-dispatch
supabase functions deploy whatsapp-send
supabase functions deploy whatsapp-session
```

El webhook debe conservar `verify_jwt = false`, ya que Meta no posee una sesión de Supabase. La firma HMAC de Meta es la autenticación del endpoint. Las demás funciones mantienen sus controles actuales.

Configure el trabajo programado que llama a `whatsapp-dispatch` con el encabezado `x-cron-secret`. El despachador crea recordatorios, recupera mensajes detenidos y procesa los pendientes.

## Prueba funcional

1. Cree un paciente con celular peruano válido y consentimiento de WhatsApp activo.
2. Programe una cita futura desde Agenda.
3. Compruebe en `mensajes_whatsapp` que aparezca una fila `CITA_CONFIRMACION`.
4. Ejecute el despachador o espere el cron y verifique el estado `ENVIADO`.
5. Pulse `Confirmar`: la cita debe quedar `CONFIRMADA`.
6. Repita con otra cita y pulse `Cancelar`: debe quedar `CANCELADA` y liberar el horario.
7. Pulse `Reprogramar`: debe quedar `SOLICITUD_REPROGRAMACION` para que el consultorio acuerde un nuevo horario.
8. Revise `historial_estados_cita`, `auditoria` y los estados de entrega del mensaje.

## Diagnóstico

- `401 Firma de Meta inválida`: `WHATSAPP_APP_SECRET` no corresponde a la aplicación o un intermediario modificó el cuerpo del webhook.
- `403 Verificación rechazada`: el token configurado en Meta no coincide con `WHATSAPP_VERIFY_TOKEN`.
- Error de plantilla: confirme nombre, idioma, aprobación y cantidad de variables y botones.
- Mensaje pendiente: revise los secretos, los logs de `whatsapp-dispatch` y que el cron envíe `x-cron-secret`.
- Teléfono no reconocido: guarde el celular del paciente con código de país; los números peruanos locales se normalizan a `51`.
- Respuesta ignorada: confirme que la cita siga futura, pertenezca al paciente y no esté completada, cancelada ni marcada como inasistencia.

No se registran tokens en logs ni se devuelven al frontend. Las respuestas repetidas de Meta se reconocen por `proveedor_id` y no vuelven a modificar la cita.
