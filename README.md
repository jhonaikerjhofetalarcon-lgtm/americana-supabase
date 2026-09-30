# Sistema Web Integral Dental Americana — Supabase

Aplicación Angular 21 independiente conectada directamente a Supabase Auth, PostgreSQL/RPC, Storage,
Realtime y Edge Functions. No necesita el backend Spring ni un proxy `/api`.

Incluye página pública, agenda y solicitudes, pacientes, historia clínica, odontograma, tratamientos,
presupuestos, caja, WhatsApp/seguimientos, copiloto supervisado y administración.

## Desarrollo local

Desde la raíz del repositorio:

```bash
npx supabase start
npx supabase db reset
cd dental-americana-supabase
npm ci
npm start
```

Abra `http://localhost:4200`. Para probar Edge Functions, copie
`../supabase/functions/.env.example` como `../supabase/functions/.env` y ejecute desde la raíz:

```bash
npx supabase functions serve
```

## Validación

```bash
npm run test:ci -- --coverage=false
npm run build
```

Las pruebas automatizadas usan dobles de los servicios; no sustituyen la validación con Supabase y WhatsApp conectados.

## Flujo de trabajo para un consultorio unipersonal

La cuenta principal debe usar el perfil **Propietario odontólogo**, que combina los roles
`ADMINISTRADOR` y `ODONTOLOGO`. Esta combinación permite administrar el sistema y ejecutar las
aprobaciones clínicas que requieren de forma explícita a un odontólogo activo.

1. En **Inicio → Mi jornada**, revisa las citas pendientes de atender, solicitudes por agendar,
   conversaciones sin leer y envíos fallidos. Usa Actualizar para consultar los pendientes nuevamente.
   Si aparece «Información parcial», no asumas que los módulos que fallaron están al día.
2. Selecciona una cita y abre su atención. Avanza por los cinco pasos de **Historia**; si intentas
   finalizar con datos esenciales pendientes, el sistema te lleva al primero. Al abrir **Odontograma**
   o **Plan y pagos**, la historia modificada se guarda antes de cambiar de sección.
3. En **Plan y pagos**, crea o edita el presupuesto en borrador: agrega procedimientos, ajusta
   descuento y observaciones, guarda y presenta el plan. Tras la aceptación expresa del paciente,
   el saldo y los adelantos aparecen en esa misma sección. La aceptación se registra desde
   **Revisar y firmar presupuesto**: el paciente revisa el detalle, firma y confirma. La copia
   guardada se consulta con **Presupuesto y firma** y se puede imprimir o guardar como PDF.
   Los planes aceptados previamente también permiten registrar su firma, con la fecha actual.
   Cada nuevo abono exige la firma del
   paciente en pantalla y genera una constancia imprimible.
   En **Finanzas → Pagos**, **Anular** permite corregir un cobro de la caja que sigue abierta.
   Requiere motivo y confirmación, conserva la firma original, devuelve el importe al saldo
   pendiente y registra un ajuste de caja. Las cajas cerradas no se modifican desde esta acción.
4. **Agendar control** precarga paciente y odontólogo; utiliza la fecha del próximo control si es válida
   y no está en el pasado. Selecciona un horario disponible y confirma para crear la cita.
5. Los borradores modificados de historia clínica, odontograma y presupuesto muestran una advertencia
   al salir, recargar o cerrar sesión. El guardado al cambiar de sección se aplica solo a la historia;
   guarda el odontograma y el presupuesto desde sus controles antes de salir.

### Comprobación manual pendiente en el entorno conectado

Con un paciente de prueba, recorrer cita → atención → odontograma → presupuesto → adelanto firmado → control.
Comprobar que siempre corresponde al mismo paciente; cancelar el descarte de un borrador y verificar
que sigue intacto. Verificar también el flujo en móvil y contrastar los contadores de Mi jornada con
la bandeja real. Esta actualización no despliega Edge Functions ni prueba envíos reales de WhatsApp.

## Historia clínica para imprimir

En **Pacientes → ficha del paciente → Historia clínica completa**, revisa el documento y pulsa
**Imprimir / Guardar PDF**. Para descargarlo, selecciona **Guardar como PDF** en el diálogo del navegador.
Requiere `PACIENTE_LEER` y `CLINICA_LEER`. Tratamientos y citas se incluyen según los permisos del usuario;
las secciones sin autorización se identifican en el documento.

El informe muestra la ficha actual, antecedentes, alergias, medicamentos, atenciones finalizadas,
odontogramas aprobados de esas atenciones, planes fuera de borrador y citas del paciente.
Las atenciones borrador/anuladas se cuentan como excluidas. Los archivos tienen descarga individual
auditada: el PDF contiene su relación, no el contenido de radiografías, fotografías o PDF adjuntos.
No se genera una firma digital ni se envía el documento a otra clínica automáticamente.

La consulta se instala con `202609150003_patient_clinical_report.sql`. Las pruebas de permisos,
aislamiento por paciente y aprobación están en `supabase/tests/patient-clinical-report.sql`.

## Chatbot DentalIA

En **DentalIA**, escribe una consulta y pulsa **Enviar** o **Enter**; **Shift + Enter** añade un
salto de línea. Puedes usar la conversación general o seleccionar una atención reciente para
consultar sus datos. Cambiar de atención o pulsar **Nueva conversación** limpia el chat.
Los mensajes se mantienen en memoria mientras la pantalla está abierta; no se guardan en la
historia clínica. Cada consulta incluye como máximo los últimos 19 mensajes y vuelve a consultar
el contexto de la atención en el servidor. **Preparar y revisar borradores clínicos** conserva el
flujo de generación, edición y aprobación existente.

El chat requiere `IA_ESCRIBIR` y la nueva Edge Function. Desde la raíz del repositorio:

```bash
npx supabase functions deploy copilot-chat
```

Usa la misma configuración de servidor que `copilot-generate`: `EXTERNAL_AI_ENABLED=true` y
`GEMINI_API_KEY`/`GEMINI_MODEL`, o el proveedor alternativo `AI_API_KEY`/`AI_API_URL`/`AI_MODEL`.
No coloques claves en Angular. Con IA externa desactivada o sin proveedor configurado, la
respuesta se identifica como **Modo básico** y permite consultar resúmenes, campos pendientes e
indicaciones registradas; no ofrece conversación libre. La configuración externa permanece
desactivada por defecto. Los identificadores estructurados del paciente se excluyen del contexto
externo, aunque los mensajes y textos clínicos libres pueden contener información personal.

Validación específica del chat:

```bash
npm run test:ci -- --include='src/app/features/copilot/**/*.spec.ts'
npx deno test ../supabase/functions/copilot-chat/chat_test.ts
```

## Producción

Las firmas de presupuesto y las anulaciones requieren la migración
`202609290006_signed_budget_and_payment_void.sql`, además de las anteriores. Desplegar la base
antes del frontend actualizado: la aceptación antigua por casilla pasa a requerir la firma.
Las pruebas SQL `supabase/tests/signed-budget.sql` y `signed-advance.sql` verifican permisos,
versiones, reintentos, conservación del acuerdo, saldo y bloqueo de cajas cerradas.

La ruta preparada para producción está en `../ops/production/README.md`. Requiere separar el proyecto
Supabase de desarrollo, configurar dominio y túnel estables, respaldos y pruebas controladas antes de
atender pacientes. No coloque `service_role`, credenciales de Evolution API ni claves de IA en Angular.

Consulte `../GUIA_CONEXION_SUPABASE_WHATSAPP.md` para el despliegue y la conexión de WhatsApp.
