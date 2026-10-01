# Casos de uso del sistema dental

## 1. Alcance y objetivo

Este documento consolida los casos de uso funcionales del sistema dental implementado en la aplicación Angular del proyecto `dental-americana-supabase`. Tiene como objetivo describir, sin omitir módulos ni permisos, las acciones que puede realizar cada actor dentro del flujo operativo del consultorio odontológico.

El sistema cubre:

- acceso público y autenticación
- dashboard personal de jornada
- agenda y solicitudes de cita
- atención clínica, odontograma y tratamiento
- gestión de pacientes y historia clínica
- finanzas y pagos
- seguimientos y mensajería
- asistente IA / copiloto
- administración y auditoría

## 2. Actores del sistema

- Paciente: consulta disponibilidad, agenda citas, recibe recordatorios y seguimiento.
- Recepcionista / personal administrativo: maneja agenda, solicitudes, pacientes y control operativo.
- Odontólogo / clínico: atiende citas, registra antecedentes, odontograma, tratamiento y evolución.
- Administración / gerente: administra usuarios, configuración, auditoría y reportes.
- Sistema / automatizado: registra auditoría, sincroniza datos, envía notificaciones y provee asistente IA.

## 3. Módulos y rutas incluidas

Los casos de uso fueron derivados del catálogo real de rutas y pantallas del sistema:

- `/` - Landing público
- `/sistema/login` - Inicio de sesión
- `/sistema/inicio` - Mi jornada
- `/sistema/agenda` - Agenda
- `/sistema/agenda/solicitudes` - Solicitudes de cita
- `/sistema/atencion` - Atención clínica
- `/sistema/atencion/:encounterId/odontograma` - Odontograma
- `/sistema/atencion/:encounterId/tratamiento` - Plan de tratamiento
- `/sistema/pacientes` - Listado de pacientes
- `/sistema/pacientes/nuevo` - Nuevo paciente
- `/sistema/pacientes/:id/editar` - Edición de paciente
- `/sistema/pacientes/:id` - Detalle del paciente
- `/sistema/pacientes/:id/historia` - Historia clínica completa
- `/sistema/finanzas` - Finanzas
- `/sistema/seguimientos` - Seguimientos
- `/sistema/copiloto` - DentalIA
- `/sistema/ajustes` - Administración

## 4. Matriz de casos de uso

### CU-01: Acceso a landing público
- Actor: visitante / paciente.
- Objetivo: visualizar la información institucional pública y navegar hacia login.
- Flujo principal:
  1. El visitante entra a la raíz del sitio.
  2. Ve la landing con información del consultorio.
  3. El usuario puede continuar al login o consultar la oferta general.
- Resultado: el usuario llega a la zona pública o al acceso seguro.
- Excepciones: si no tiene autenticación válida, no puede entrar a módulos internos.

### CU-02: Inicio de sesión al sistema
- Actor: usuario autenticado o administrador.
- Objetivo: ingresar al sistema con credenciales válidas.
- Flujo principal:
  1. El usuario accede a `/sistema/login`.
  2. Ingresa usuario y contraseña.
  3. El sistema valida credenciales y permisos.
  4. Se redirige a la sección `/sistema/inicio`.
- Resultado: acceso autorizado al dashboard del sistema.
- Excepciones: credenciales inválidas, usuario inactivo o sin permisos.

### CU-03: Cierre de sesión
- Actor: cualquier usuario autenticado.
- Objetivo: salir del sistema de forma segura.
- Flujo principal:
  1. El usuario finaliza sesión desde la interfaz.
  2. El sistema invalida la sesión activa.
  3. Se redirige a la pantalla de login o a la landing pública.
- Resultado: la sesión queda cerrada.
- Excepciones: si hay cambios pendientes, se previene el cierre según la guardia de navegación.

### CU-04: Consulta del dashboard “Mi jornada”
- Actor: recepcionista, odontólogo, administrador.
- Objetivo: visualizar la operación diaria del consultorio.
- Flujo principal:
  1. El usuario entra a `/sistema/inicio`.
  2. Revisa citas de hoy, pacientes en espera, por confirmar y pendientes.
  3. Puede actualizar el resumen si hay información parcial.
  4. Selecciona una cita para abrirla o ver el paciente.
- Resultado: el usuario obtiene un resumen operativo del día.
- Excepciones: información parcial, módulos pendientes de sincronización, ausencia de citas,
  permisos limitados para abrir ciertos módulos.

### CU-05: Actualización del dashboard para datos frescos
- Actor: personal autorizado.
- Objetivo: forzar la recarga de pendientes y estado operativo.
- Flujo principal:
  1. El usuario presiona “Actualizar”.
  2. El sistema consulta nuevamente los datos pendientes.
  3. Muestra advertencias si información parcial o desactualizada.
- Resultado: se actualiza el resumen sin asumir datos obsoletos.
- Excepciones: fallos de servicio, error remoto o restricciones de permiso.

### CU-06: Ver agenda del consultorio
- Actor: recepcionista, odontólogo, administrador con permiso de lectura de citas.
- Objetivo: visualizar las citas por tiempo, paciente, servicio y estado.
- Flujo principal:
  1. El usuario entra a `/sistema/agenda`.
  2. Revisa el calendario de citas y disponibilidad.
  3. Puede abrir una cita para atenderla o editar su proceso.
- Resultado: control de agenda y flujo de atención del día.
- Excepciones: ausencia de citas, fechas no disponibles, conflicto de horario o permisos insuficientes.

### CU-07: Gestionar solicitudes de cita
- Actor: recepcionista, personal administrativo, odontólogo.
- Objetivo: revisar y resolver solicitudes enviadas por pacientes o canales externos.
- Flujo principal:
  1. El usuario entra a `/sistema/agenda/solicitudes`.
  2. Revisa las solicitudes pendientes.
  3. Confirma, rechaza o convierte la solicitud en cita.
- Resultado: la solicitud queda en flujo de atención o calendario programado.
- Excepciones: solicitud duplicada, no tiene paciente identificado o contiene datos incompletos.

### CU-08: Crear o programar una cita
- Actor: recepcionista / administrativo.
- Objetivo: agendar una cita con paciente y profesional.
- Flujo principal:
  1. El usuario selecciona horario disponible.
  2. Asocia paciente, motivo, servicio y odontólogo.
  3. Confirma programación.
- Resultado: la cita queda registrada en la agenda.
- Excepciones: horario ocupado, fecha en el pasado, paciente inexistente o permisos denegados.

### CU-09: Agendar control posterior
- Actor: odontólogo o personal clínico.
- Objetivo: programar una cita de control a partir de una atención.
- Flujo principal:
  1. El usuario accede a la atención del paciente.
  2. Define fecha y hora del próximo control.
  3. El sistema precarga paciente y profesional.
  4. Se valida que la fecha sea válida y futura.
  5. Confirma la cita.
- Resultado: la cita de control queda registrada.
- Excepciones: fecha inválida, pasada o ocupada; paciente no disponible; cambios pendientes no guardados.

### CU-10: Abrir atención clínica
- Actor: odontólogo, recepcionista con permisos clínicos.
- Objetivo: atender a un paciente en la consulta.
- Flujo principal:
  1. El usuario selecciona una cita desde dashboard o agenda.
  2. Abre `/sistema/atencion` con el identificador del encuentro.
  3. Revisa datos del paciente, motivo de consulta y estado del caso.
- Resultado: se crea o se recupera una sesión activa de atención.
- Excepciones: no hay cita asociada, paciente inactivo, sesión inexistente o permisos insuficientes.

### CU-11: Guardar borrador de atención
- Actor: odontólogo o clínico.
- Objetivo: proteger información en progreso antes de navegar.
- Flujo principal:
  1. El usuario modifica campos de la atención.
  2. Guarda el borrador.
  3. Puede continuar a odontograma, tratamiento o salir de la pantalla.
- Resultado: no se pierde la información en curso.
- Excepciones: si abandona sin guardar, el sistema puede advertir con guardia de cambios pendientes.

### CU-12: Gestionar odontograma del paciente
- Actor: odontólogo / clínico.
- Objetivo: registrar el estado de los dientes, superficies y procedimientos en la boca.
- Flujo principal:
  1. El usuario entra a `/sistema/atencion/:encounterId/odontograma`.
  2. Selecciona dientes y superficies.
  3. Aplica estados, marcas o tratamientos.
  4. Guarda el cambio.
- Resultado: queda registrado el diagnóstico visual y el plan clínico.
- Excepciones: cambios pendientes no guardados, navegador con cierre accidental o permiso denegado.

### CU-13: Gestionar plan de tratamiento
- Actor: odontólogo / clínico.
- Objetivo: definir el plan terapéutico a seguir con el paciente.
- Flujo principal:
  1. El profesional entra a `/sistema/atencion/:encounterId/tratamiento`.
  2. Crea o modifica tratamientos asociados al caso.
  3. Establece prioridades, costos o fases si se aplican.
  4. Guarda el plan.
- Resultado: el paciente cuenta con un tratamiento formalizado.
- Excepciones: permisos de tratamiento insuficientes, plan fuera de borrador o información incompleta.

### CU-14: Consultar lista de pacientes
- Actor: recepcionista, odontólogo, administrador.
- Objetivo: buscar y localizar pacientes registrados.
- Flujo principal:
  1. El usuario entra a `/sistema/pacientes`.
  2. Filtra por nombre, documento, estado o criterios de búsqueda.
  3. Selecciona un paciente para ver detalle o atención.
- Resultado: acceso rápido a la base de pacientes.
- Excepciones: paciente inexistente, permisos de lectura no concedidos o búsqueda sin resultados.

### CU-15: Registrar nuevo paciente
- Actor: recepcionista o administrativo con permiso de escritura.
- Objetivo: crear la ficha del paciente.
- Flujo principal:
  1. El usuario entra a `/sistema/pacientes/nuevo`.
  2. Completa datos personales, contacto, antecedentes relevantes y documentación.
  3. Guarda la ficha.
- Resultado: el paciente queda registrado en la base del consultorio.
- Excepciones: datos obligatorios faltantes, duplicidad de paciente, permisos insuficientes.

### CU-16: Editar información de paciente
- Actor: administrativo, clínico y personal autorizado.
- Objetivo: actualizar los datos del paciente.
- Flujo principal:
  1. El usuario abre la ficha de un paciente.
  2. Modifica datos personales, antecedentes, medicamentos o contacto.
  3. Guarda la actualización.
- Resultado: el expediente queda actualizado.
- Excepciones: cambios no autorizados, errores en validación, sesión caducada.

### CU-17: Consultar detalle del paciente
- Actor: cualquier usuario con permiso de lectura.
- Objetivo: revisar el perfil y la información general del paciente.
- Flujo principal:
  1. El usuario entra a `/sistema/pacientes/:id`.
  2. Revisa datos generales, citas relacionadas, historial clínico y estado.
- Resultado: contexto completo del paciente para atención o coordinación.
- Excepciones: paciente no encontrado, acceso no autorizado o información parcialmente visible por permisos.

### CU-18: Generar historia clínica completa
- Actor: odontólogo, personal clínico y usuarios con permisos de clínica.
- Objetivo: imprimir o guardar la historia clínica del paciente.
- Flujo principal:
  1. El usuario entra a `/sistema/pacientes/:id/historia`.
  2. Revisa ficha médica, antecedentes, alergias, medicamentos, atenciones finalizadas y tratamientos.
  3. Selecciona impresión o PDF.
  4. El navegador genera el documento.
- Resultado: se obtiene el reporte clínico para impresión o almacenamiento.
- Excepciones: el sistema excluye borradores, atenciones anuladas o contenido no autorizado; se muestra la sección no autorizada según permisos.

### CU-19: Registrar antecedentes, alergias y medicamentos
- Actor: odontólogo o personal clínico.
- Objetivo: mantener actualizados los datos clínicos esenciales del paciente.
- Flujo principal:
  1. El usuario actualiza la ficha del paciente o la historia clínica.
  2. Agrega antecedentes relevantes, alergias o medicamentos.
  3. Guarda la información.
- Resultado: hay un historial médico de referencia para la atención.
- Excepciones: dato obligatorio ausente, información inconsistente o permiso restringido.

### CU-20: Gestionar finanzas del consultorio
- Actor: administrador, finanzas, recepcionista con permisos de lectura/finanza.
- Objetivo: revisar el estado financiero del consultorio y del paciente.
- Flujo principal:
  1. El usuario accede a `/sistema/finanzas`.
  2. Consulta saldo, pagos, movimiento financiero y cuentas por paciente.
  3. Puede filtrar registros para analizar cobros o pendientes.
- Resultado: se controla la operación económica del consultorio.
- Excepciones: sin permisos de finanzas, sin pagos registrados o faltan movimientos de una cuenta.

### CU-21: Ver saldo y cobrar de un paciente
- Actor: personal financiero o clínico autorizado.
- Objetivo: revisar cuentas y registrar cobros asociados al paciente.
- Flujo principal:
  1. El usuario entra a la atención del paciente.
  2. Selecciona “Ver saldo y cobrar”.
  3. Revisa pagos y deuda del paciente.
  4. Registra cobro o cierre de cuenta si corresponde.
- Resultado: la cuenta queda actualizada.
- Excepciones: cobros no automatizados, no se aplican cambios sin validación explícita, permiso de finanzas restringido.

### CU-22: Gestionar seguimientos y mensajes
- Actor: recepcionista, administrador o clínico con acceso de seguimiento.
- Objetivo: gestionar conversaciones, recordatorios y estados de seguimiento con pacientes.
- Flujo principal:
  1. El usuario entra a `/sistema/seguimientos`.
  2. Consulta mensajes, recordatorios y seguimientos pendientes.
  3. Responde, marca como leído, reenvía o cierra tarea.
- Resultado: la comunicación con el paciente queda registrada y operativa.
- Excepciones: mensajes fallidos, conversaciones sin leer, mensajes fuera del alcance del permiso.

### CU-23: Enviar o revisar mensajes de WhatsApp / recordatorios
- Actor: sistema y personal administrativo.
- Objetivo: coordinar recordatorios o avisos automatizados.
- Flujo principal:
  1. El usuario identifica un paciente o tarea pendiente.
  2. El sistema prepara el mensaje o recordatorio.
  3. Se envía mediante WhatsApp/seguimientos.
  4. Se registra el estado de entrega.
- Resultado: hay seguimiento operativo y comunicación con el paciente.
- Excepciones: fallo de envío, credenciales no configuradas, número no disponible, servicio no conectado.

### CU-24: Usar el asistente IA DentalIA
- Actor: odontólogo, administrativo o personal autorizado.
- Objetivo: consultar ayuda contextual y apoyar decisiones asistidas por IA.
- Flujo principal:
  1. El usuario entra a `/sistema/copiloto`.
  2. Solicita ayuda, resumen o análisis del caso.
  3. El sistema devuelve apoyo contextual supervisado.
- Resultado: se obtiene asistencia de apoyo a la operación clínica y administrativa.
- Excepciones: acceso sin permiso, información insuficiente para responder, supervisión humana requerida.

### CU-25: Administrar usuarios del sistema
- Actor: administrador.
- Objetivo: gestionar alta, baja y estado de usuarios.
- Flujo principal:
  1. El usuario entra a `/sistema/ajustes` y a la pestaña de usuarios.
  2. Crea un usuario, asigna rol y permisos.
  3. Activa o desactiva accesos.
- Resultado: la organización tiene control de quién accede al sistema.
- Excepciones: usuario duplicado, permisos inválidos, usuario no activo o falta de confirmación.

### CU-26: Cambiar contraseña de usuario
- Actor: cualquier usuario autenticado.
- Objetivo: proteger el acceso del sistema.
- Flujo principal:
  1. El usuario entra a configuración general.
  2. Informa contraseña actual y nueva.
  3. Confirma contraseña.
  4. El sistema valida complejidad y actualiza la credencial.
- Resultado: se actualiza la contraseña del usuario.
- Excepciones: requisito de complejidad no cumplido, contraseña actual incorrecta, confirmación distinta.

### CU-27: Configuración general del sistema
- Actor: administrador.
- Objetivo: modificar parámetros institucionales del consultorio.
- Flujo principal:
  1. El usuario abre la pestaña “Configuración”.
  2. Edita variables de negocio o institucionales.
  3. Guarda cambios asociados a usuario y audita la operación.
- Resultado: sistema ajustado a configuración institucional.
- Excepciones: valores inválidos, cambios sin permiso, fallo de persistencia.

### CU-28: Consultar auditoría del sistema
- Actor: administrador.
- Objetivo: revisar trazabilidad de acciones internas.
- Flujo principal:
  1. El usuario entra a `/sistema/ajustes` y a la pestaña de auditoría.
  2. Busca por usuario, acción o recurso.
  3. Revisa registros temporales de cambios.
- Resultado: se obtiene evidencia y control de acciones.
- Excepciones: sin registros válidos, filtros sin coincidencias o falta de permisos.

### CU-29: Consultar reportes del sistema
- Actor: administrador.
- Objetivo: revisar indicadores clave del consultorio.
- Flujo principal:
  1. El usuario entra a la pestaña de reportes.
  2. Consulta métricas de pacientes, citas, atenciones finalizadas y resultado financiero.
- Resultado: habilita toma de decisiones basada en métricas operativas.
- Excepciones: falta de datos, métricas no disponibles o permisos insuficientes.

### CU-30: Protección de cambios pendientes y navegación segura
- Actor: cualquier usuario con formularios o sesiones de trabajo.
- Objetivo: evitar pérdida de información al salir o recargar la página.
- Flujo principal:
  1. El usuario modifica un borrador de atención o historia clínica.
  2. Intenta cerrar la pestaña, recargar página o navegar a otra ruta.
  3. El sistema muestra protectora de cambios pendientes.
- Resultado: el usuario no pierde datos sin confirmación.
- Excepciones: el usuario descarta la advertencia o guarda antes de continuar.

## 5. Casos de uso por tipo de permiso

### 5.1 Permisos de lectura

Los usuarios con permisos de lectura pueden acceder a:

- inicio / jornada
- agenda
- solicitudes de cita
- pacientes (listado y detalle)
- historia clínica según alcance
- finanzas (si aplica)
- seguimientos
- copiloto y reportes a nivel autorizado

### 5.2 Permisos de escritura

Los usuarios con permisos de escritura pueden:

- crear y editar pacientes
- guardar cambios en atención
- registrar odontograma
- generar planes de tratamiento
- actualizar configuración institucional
- afectar datos operativos y administrativos

### 5.3 Permisos administrativos

Los administradores pueden:

- gestionar usuarios
- activar/desactivar cuentas
- cambiar contraseñas
- revisar auditoría
- consultar reportes
- administrar configuraciones del consultorio

## 6. Reglas transversales del sistema

- La autenticación es obligatoria para entrar a áreas internas.
- Los permisos de acceso se validan por ruta y por funcionalidad.
- La jornada del consultorio se enfoca en la atención del día y pendientes visibles.
- Los borradores de atención y clínica se protegen para no perder información.
- La historia clínica completa es un documento imprimible o exportable a PDF.
- La auditoría registra acciones relevantes del sistema y del administrador.
- El sistema requiere supervisión humana para decisiones clínicas y de comunicación automatizadas.

## 7. Resultado del análisis

El sistema posee un conjunto completo de casos de uso de negocio, administrativos y operativos para un consultorio dental moderno. La cobertura incluye:

- atención del paciente
- gestión clínica
- agenda y cita
- administración y seguridad
- finanzas
- comunicaciones
- IA supervisada
- trazabilidad y reportes

Este documento representa la cobertura funcional principal sin omitir módulos, rutas ni permisos relevantes del producto.
