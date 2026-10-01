# Automatizaciones de WhatsApp

## Control desde el sistema

El propietario odontólogo abre **WhatsApp → Automatizaciones** para consultar la conexión
y activar el interruptor general y cada flujo: avisos de citas, reserva por horarios y
seguimiento postconsulta. Los flujos se pueden dejar preparados mientras el interruptor
general está apagado. El estado **Preparada** indica que ese flujo aún no envía mensajes.

Al pausar un flujo se cancelan sus mensajes automáticos que sigan pendientes. Con el
interruptor general apagado, las respuestas recibidas quedan para revisión y no modifican
citas automáticamente. Los mensajes manuales continúan disponibles. Al reactivar, los avisos cancelados no se reenvían; las
nuevas citas y los futuros recordatorios siguen la configuración vigente.

Para probar la vinculación, usar un número propio con autorización de WhatsApp, enviar
`HOLA` y luego `RESERVAR`. El webhook de Evolution debe apuntar a
`https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook` y enviar el secreto
configurado como `x-webhook-secret`. El despacho requiere el trabajo Cron y el secreto
`WHATSAPP_CRON_SECRET`. Los botones dependen de la versión de Evolution; el paciente
también puede responder 1, 2 o 3 por texto.

## Comportamiento

| Evento | Resultado |
|---|---|
| Nueva cita pendiente | Solicitud de confirmación |
| Nueva cita confirmada o confirmación posterior | Aviso de cita confirmada |
| Cita dentro de las próximas 24 horas | Recordatorio de cita |
| Cita dentro de las próximas 2 horas | Recordatorio cercano |
| Cambio de horario | Cancela los avisos pendientes anteriores y programa el nuevo horario |
| Cancelación | Retira los recordatorios pendientes y programa el aviso de cancelación |
| `CONFIRMO` / `CONFIRMAR` | Confirma una cita futura identificada |
| `CANCELAR` / `CANCELO MI CITA` | Cancela una cita futura identificada |
| `REPROGRAMAR` / `QUIERO OTRA FECHA` | Solicitud para recepción; marca la cita identificada como SOLICITUD_REPROGRAMACION |
| Mensaje ambiguo, HUMANO, ASESOR o varias citas sin contexto | Conversación derivada para revisión |

El programador existente debe ejecutarse cada minuto. Los recordatorios se preparan al entrar en
su ventana de tiempo; no son una garantía de entrega a una hora exacta. Se omiten si ya se creó otro
aviso de cita en las últimas dos horas para evitar acumular mensajes. No se envían avisos de citas vencidas.
Las fechas del texto se muestran en America/Lima y los instantes se almacenan como timestamptz.

Una respuesta citada solo modifica la cita del paciente y la programación a la que correspondía
el aviso. Las preguntas y negaciones, por ejemplo «no quiero cancelar», quedan para revisión.
La atención postconsulta existente se conserva; los mensajes automáticos no generan indicaciones clínicas nuevas.

## Plantillas

Los textos están centralizados en `public.plantillas_mensaje`. Las nuevas plantillas son
`CITA_CANCELACION`, `CITA_REPROGRAMACION`, `CITA_CONFIRMADA` y `CITA_RECORDATORIO_2H`.
Se pueden editar desde el Table Editor de Supabase usando `{{paciente}}`, `{{fecha}}` y `{{hora}}`.
`activo = false` impide preparar avisos nuevos de esa plantilla. Los mensajes ya programados conservan
su texto; desactivar una plantilla no retira su cola. La migración no reemplaza textos personalizados existentes.

## Reintentos y errores

- Antes de cada envío se verifican autorización WhatsApp, paciente activo, celular actual,
  conversación y vigencia de la cita. Cambiar el celular o revocar autorización bloquea avisos anteriores.
- Una clave por cita, tipo y programación evita duplicar el mismo aviso. Volver a un horario anterior
  cuenta como una programación nueva.
- El despacho reintenta únicamente rechazos explícitos HTTP 429, con esperas de 1, 5 y 15 minutos
  y hasta cuatro intentos totales para nuevos avisos de cita.
- Los timeouts y errores ambiguos quedan en FALLIDO: comprobar en WhatsApp si llegó el mensaje antes
  de usar Reintentar. No se presupone que un timeout significa que el proveedor no envió el mensaje.
- Si falla la persistencia del webhook, devuelve HTTP 500. El proveedor debe tener habilitada la
  reentrega de webhooks; el procesamiento repetido del mismo identificador no repite la acción.
- Los estados entregado/leído no retroceden por avisos antiguos del proveedor.

## Activación en el proyecto Supabase conectado

Desde la raíz del repositorio, revisar primero las migraciones pendientes:

```bash
npx supabase db push --dry-run
```

Esta actualización agrega `202609150001_whatsapp_automation_reliability.sql` y
`202609150002_whatsapp_safe_replies.sql`. Aplicar las migraciones antes de desplegar las funciones:

```bash
npx supabase db push
npx supabase functions deploy whatsapp-send
npx supabase functions deploy whatsapp-dispatch
npx supabase functions deploy whatsapp-webhook
```

Usa los secretos ya configurados de Evolution y del webhook. Verifica el trabajo
`dental-whatsapp-dispatch` en Supabase Cron; su definición está en `whatsapp-dispatch-cron.sql`.
Requiere `project_url` y `whatsapp_cron_secret` en Vault. Evolution debe poder enviar eventos al webhook
y Supabase debe poder acceder a la URL vigente de Evolution.

La activación empezará a procesar la cola existente. Revisar los pendientes antes de habilitar Cron.

## Validación realizada y prueba conectada

Se prueban migraciones y reglas en PostgreSQL aislado, con tablas mínimas que sustituyen Auth y Storage.
Las pruebas no verifican permisos efectivos de un usuario conectado, Realtime, pg_cron/pg_net ni entrega real.

```bash
npx --yes deno test --allow-env supabase/functions/_shared/whatsapp_test.ts supabase/functions/whatsapp-webhook/handler_test.ts
```

`supabase/tests/whatsapp-automation.sql` verifica confirmación, cancelación, reprogramación, duplicados,
consentimiento revocado, cambio de celular, recordatorios y respuestas a horarios antiguos. El job
`whatsapp-database` de CI prepara una base vacía y ejecuta estas pruebas.
`bootstrap-postgres.sql` es exclusivo de una base vacía de pruebas, nunca del Supabase real.

Para la prueba conectada, utilizar un paciente de prueba autorizado con un número propio:
crear cita → comprobar envío → responder CONFIRMO → comprobar estado en agenda → reprogramar
→ comprobar nuevo aviso → responder CANCELAR citando ese aviso → comprobar cancelación y retiro
de recordatorios pendientes. Revisar también la bandeja y el historial. Esta prueba debe hacerse
después del despliegue; las pruebas locales no envían mensajes.
