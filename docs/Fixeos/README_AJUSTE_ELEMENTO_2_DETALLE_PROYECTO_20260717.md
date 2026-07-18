# Ajuste Elemento 2 - Detalle Proyecto

Fecha: 2026-07-17

## Alcance

Se ajusta exclusivamente el Elemento 2 del Detalle Proyecto.

### KPIs

- Se conserva la distribución 3-4.
- Los siete KPIs adoptan el lenguaje visual familiar de United: tarjetas tipo botón, colores sólidos/degradados, icono, cifra, nombre y contexto.
- No se agrega navegación ni filtrado al hacer clic; el cambio es visual para evitar alterar la lógica aprobada.

### Rings por equipo

- Ring Resp. BLT por equipo: la leyenda muestra `identificacion_sitio`.
- Ring Resp. Cliente por equipo: la leyenda muestra `identificacion_sitio`.
- Si un equipo no tiene referencia en sitio, se utiliza `codigo_equipo` como respaldo para no dejar la etiqueta vacía.
- El cálculo y la proporción de llamadas por equipo no cambian.

## Archivos modificados

- `core/details.js`
- `backend/src/controllers/data.controller.js`

## No modificado

- Elemento 1: Detalle del Proyecto.
- Elemento 3: Equipos del Proyecto.
- Elemento 4: Tickets del Proyecto.
- Módulos congelados de United.

## Validación

- Sintaxis JavaScript frontend validada con `node --check`.
- Sintaxis JavaScript backend validada con `node --check`.
- ZIP contiene únicamente los dos archivos modificados y este README.
