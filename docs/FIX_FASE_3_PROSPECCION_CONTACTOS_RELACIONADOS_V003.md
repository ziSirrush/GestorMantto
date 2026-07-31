# FIX Fase 3 - Contactos relacionados V003

## Alcance

- Los resultados de búsqueda muestran el proyecto como título y el cliente como subtítulo.
- Al seleccionar una fuente con cliente relacionado se cargan sus contactos activos.
- Se puede elegir un contacto existente o `+ Nuevo contacto`.
- Un contacto existente completa Contacto, Correo y Teléfono.
- Un contacto nuevo se inserta en `ventas_clientes_contactos` y se relaciona con la visita.
- Si existe cotización relacionada, la cotización se actualiza con el nuevo contacto.
- En Instalaciones, la relación con cotización se detecta por `ventas_cotizaciones_cor.id_equipo_vendido = ins_fl.id_proyecto`.

## Archivos modificados

- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.service.js`
- `modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.html`
- `modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.css`
- `modules/ventas-prospeccion-nueva/ventas-prospeccion-nueva.js`

## Base requerida

Aplicar sobre Fase 3 V001 más el FIX de vista y catálogos V002.

## Base de datos

No requiere nuevas tablas ni columnas.
