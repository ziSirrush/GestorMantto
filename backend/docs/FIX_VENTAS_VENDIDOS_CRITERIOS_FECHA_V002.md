# FIX Ventas - criterios de fecha V002

## Reglas oficiales

- Total, En proceso y Equipos cotizados del módulo Cotizaciones: año de `COALESCE(fecha_cotizacion, fecha_solicitud)`.
- Vendidas: estatus `Vendido` y año de `fecha_cierre`.
- Perdidas: estatus `Perdido` y año de `fecha_cambio_estatus`.
- Con fecha de cierre: estatus `Vendido` y `fecha_cierre` con valor.
- Sin fecha de cierre: estatus `Vendido` y `fecha_cierre` vacía o NULL. Es un control global porque no puede asignarse a un año.

## Alcance

Todas las consultas conservan la visibilidad común de Ventas y los filtros autorizados del usuario.

## Archivos modificados

- backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js
- backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js
- modules/ventas-vendidos/ventas-vendidos.js
