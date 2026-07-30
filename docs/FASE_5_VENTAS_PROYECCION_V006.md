# Ventas · Proyección — Fase 5 V006

## Alcance

Trazabilidad operativa dentro de Proyección, reutilizando la bitácora existente de cotizaciones y respetando el alcance comercial resuelto por backend.

## Cambios

- Se agrega la acción `Historial` en cada cotización con identificador interno válido.
- El historial se muestra en una ventana integrada sin salir de Proyección.
- Consulta `GET /api/ventas/cotizaciones/:id/historial`.
- Permite filtrar movimientos por tipo de acción.
- Muestra usuario, fecha y hora, motivo o comentario y valores anteriores/nuevos cuando existen.
- Desde el historial se puede abrir el Detalle de Cotización global.
- La consulta respeta el alcance del usuario porque la validación permanece en backend.
- Se conserva el botón `Ver`, la navegación por fila, los acordeones independientes, filtros y paginación de fases anteriores.

## Base de datos

- No agrega tablas.
- No agrega columnas.
- No modifica registros.
- Solo consulta la bitácora existente `ventas_cotizaciones_historial` mediante el endpoint ya disponible.

## Archivos modificados

- `modules/ventas-proyeccion/ventas-proyeccion.html`
- `modules/ventas-proyeccion/ventas-proyeccion.css`
- `modules/ventas-proyeccion/ventas-proyeccion.js`

## Consideraciones

La edición de estatus y el registro de comentarios continúan realizándose desde el Detalle de Cotización global. Proyección no duplica esas acciones.
