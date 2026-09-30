# Odontograma: edición visual

El editor reutiliza los servicios y RPC de Supabase existentes. Esta actualización no cambia
datos clínicos, contratos ni convenciones de numeración almacenadas.

## Uso

1. Elige dentición permanente o infantil; opcionalmente filtra un cuadrante.
2. Pulsa el número de una pieza para inspeccionarla o usa las flechas del detalle.
3. Selecciona una superficie en el mapa o en la vista ampliada.
4. Elige condición, estado y observación opcional; pulsa **Registrar hallazgo**.

El modo predeterminado solo selecciona. **Marcado directo** es opcional: cada clic sobre una
superficie solicita guardar un hallazgo con la condición y estado activos. «Pieza completa»
selecciona `GENERAL`; se registra mediante el botón del formulario.

La nota general se guarda por separado. Si está pendiente, el editor permite guardar o
descartar explícitamente antes de cambiar de dentición o aprobar. Un alta/baja de hallazgo
no reemplaza esa nota local. Esto no equivale a persistencia ante cerrar/recargar el navegador.

## Presentación y comprobaciones

- `models/odontogram-presentation.ts` conserva la paleta y el mapeo de superficies existentes.
- `ui/tooth-surface-map` es presentacional: emite selección, no hace llamadas ni guarda datos.
- Los hallazgos específicos tienen prioridad visual sobre los generales; la lista conserva
  todos los registros. El color no sustituye al texto del estado ni al criterio profesional.
- Las pruebas del editor y del mapa utilizan datos sintéticos y servicios simulados.
- Compilar/pruebas automatizadas no sustituyen la revisión visual móvil/escritorio ni una
  prueba controlada de persistencia con una atención de prueba en el entorno de desarrollo.
