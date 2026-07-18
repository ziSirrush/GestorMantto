# Fix Detalle Proyecto - Elemento 4

Fecha: 2026-07-17

## Alcance

Se modificó únicamente el componente global de Detalle Proyecto en `core/details.js`.

## Cambios

- Los tickets del proyecto permanecen agrupados por equipo.
- Solo un equipo puede estar expandido a la vez.
- Al abrir otro equipo, el anterior se colapsa automáticamente.
- El primer equipo aparece expandido al abrir el detalle.
- El encabezado de cada grupo muestra:
  - Código del equipo.
  - Referencia en sitio debajo del código, en texto más pequeño y gris.
  - Cantidad de tickets alineada a la derecha.
- Si no existe referencia en sitio, se muestra únicamente el código del equipo.
- Se conserva el clic de cada ticket para abrir su detalle.
- No se modificaron los elementos 1, 2 ni 3 del Detalle Proyecto.
- No se modificó backend ni base de datos.

## Instalación

Reemplazar:

- `core/details.js`

## Validación realizada

- Sintaxis JavaScript validada con `node --check`.
- El ZIP contiene únicamente el archivo modificado y este README.
