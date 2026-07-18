# Fix Detalle Proyecto - Elemento 4 V2

Fecha: 2026-07-17

## Alcance

Se modificó únicamente el componente global de Detalle Proyecto en `core/details.js`.

## Correcciones

- Todos los grupos de tickets inician contraídos.
- Puede permanecer todo el acordeón cerrado.
- Solo un equipo puede estar expandido a la vez.
- Al hacer clic nuevamente sobre el equipo abierto, también se contrae.
- La referencia en sitio se busca con varias llaves compatibles:
  - `identificacion_sitio`
  - `referencia_en_sitio`
  - `referencia_sitio`
  - `referencia_en_zona_operativa`
  - `referencia`
- La relación entre ticket y equipo se normaliza para evitar diferencias por espacios o mayúsculas/minúsculas.
- La referencia se muestra debajo del código del equipo, con letra más pequeña y gris.
- Si la API no entrega ninguna referencia para el equipo, se conserva únicamente el código.

## Se conserva

- Agrupación por equipo.
- Conteo de tickets.
- Emojis del No. Ticket.
- Apertura del Detalle Ticket.
- Elementos 1, 2 y 3 sin cambios.
- Backend y base de datos sin cambios.

## Instalación

Reemplazar:

- `core/details.js`

## Validación realizada

- Sintaxis JavaScript validada con `node --check`.
- ZIP con únicamente el archivo modificado y este README.
