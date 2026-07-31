# FIX Fase 3 - Selector de contacto V005

## Alcance

Ajuste incremental del selector de contactos en Nueva visita de Prospeccion.

## Cambios

- El valor predeterminado ahora es `Seleccionar contacto`.
- La segunda opcion es `Nuevo contacto`.
- Los contactos registrados aparecen despues de esas dos opciones.
- Ya no se selecciona automaticamente el contacto principal ni el primero de la lista.
- Al dejar `Seleccionar contacto`, los campos Contacto, Correo y Telefono permanecen vacios y en modo consulta.
- Al elegir `Nuevo contacto`, se habilita la captura manual.
- Al elegir un contacto registrado, se llenan sus datos.

## Archivos modificados

- `modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.html`
- `modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.js`
