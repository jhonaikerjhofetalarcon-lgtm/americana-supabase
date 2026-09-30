# UI compartida

Las piezas compartidas añaden comportamiento sin reemplazar el diseño de cada módulo.
Antes de incorporar otro componente, comprobar que resuelve una necesidad repetida real.
Los estilos comunes de botones y avisos siguen en `src/styles.css` junto a Tailwind.

## Ventanas modales

Importar `ModalDirective` en el componente y mantener sus clases actuales:

```html
@if (open()) {
  <section appModal class="existing-modal" aria-labelledby="modal-title"
    [modalDismissDisabled]="saving()" (modalDismiss)="close()">
    <h2 id="modal-title">Nueva cita</h2>
    <button type="button" aria-label="Cerrar" [disabled]="saving()" (click)="close()">×</button>
    <!-- formulario existente -->
  </section>
}
```

- CDK mueve el foco al primer control, mantiene Tab dentro y devuelve el foco al control de origen al cerrar.
- Escape solicita el cierre; `close()` también debe respetar el guardado en curso.
- Cada ventana necesita un título identificado por `aria-labelledby` y un botón de cierre con nombre.
- El fondo clicable debe llevar `type="button"`, `tabindex="-1"`, nombre accesible y la misma protección de cierre.
- Usar `@if` para retirar la ventana: ocultarla solo con CSS no destruye el foco atrapado.
- La directiva no crea fondo, estilos, bloqueo de scroll ni orquestación de ventanas anidadas.

Integrado en agenda, revisión de pacientes duplicados y los dos diálogos de WhatsApp.
Las pruebas automatizadas cubren comportamiento del foco y Escape; la validación visual y con
lector de pantalla real sigue siendo una comprobación manual independiente.
