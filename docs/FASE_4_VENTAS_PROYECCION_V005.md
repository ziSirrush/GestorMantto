# Ventas · Proyección — Fase 4 V005

## Alcance

Integración estable entre Proyección y la vista global de Detalle de Cotización, sin crear vistas paralelas y sin modificar tablas.

## Cambios

- Conserva en `sessionStorage` los filtros de Proyección, la etapa seleccionada y el estado independiente de cada acordeón.
- Al abrir una cotización se envía al router el origen `ventas-proyeccion` y la etapa desde la cual se abrió.
- El Detalle de Cotización emite un evento interno cuando se modifica el estatus o se registra un comentario.
- Proyección escucha ese evento y vuelve a consultar Aiven para reflejar cambios al regresar.
- Se mantiene el detalle global existente y la navegación nativa del router.

## No incluido

- No se agregan tablas ni columnas.
- No se crea un sistema nuevo de notificaciones.
- No se modifica la lógica de permisos.
- No se altera la estructura visual congelada del Detalle de Cotización.

## Archivos modificados

- `modules/ventas-proyeccion/ventas-proyeccion.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
