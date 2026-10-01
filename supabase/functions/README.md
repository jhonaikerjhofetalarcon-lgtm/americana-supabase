# Edge Functions

La mensajería admite `evolution` y `meta`. El proveedor se elige con
`WHATSAPP_PROVIDER`; las citas, la cola, la auditoría y los reintentos son comunes a ambos.

- `whatsapp-session`: consulta la conexión y genera el QR cuando se usa Evolution API; requiere usuario autenticado.
- `whatsapp-send`: envío manual; requiere usuario autenticado. En Meta funciona dentro de la ventana de atención iniciada por el paciente.
- `whatsapp-dispatch`: procesa la cola, confirmaciones, recordatorios y reintentos; protegido por `x-cron-secret`.
- `whatsapp-webhook`: recibe respuestas y estados. Valida el secreto de Evolution o la firma HMAC de Meta.
- Reserva guiada: `HOLA` muestra opciones y `RESERVAR` ofrece tres turnos libres de la agenda.
  El paciente responde 1, 2 o 3; el webhook vuelve a verificar el turno antes de registrarlo.
  `EVOLUTION_INTERACTIVE_BUTTONS=true` habilita botones solo en versiones compatibles.
- `whatsapp-sync`: importa de forma idempotente chats y mensajes existentes de Evolution API.
- `copilot-generate`: generación de borradores; nunca aprueba ni modifica la historia clínica.
- `admin-create-user`: alta de personal con perfiles controlados mediante Admin Auth sin exponer la clave privilegiada.

Los secretos de producción se guardan en Supabase, no en Angular ni en Git. Para desarrollo local,
copie `.env.example` como `.env` y ejecute:

```bash
npx supabase functions serve
```

La guía específica de Meta Cloud API está en `../../docs/WHATSAPP_INTEGRATION.md`.
La guía de Evolution está en `../../GUIA_CONEXION_SUPABASE_WHATSAPP.md`.
