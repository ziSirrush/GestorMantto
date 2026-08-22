# FASE 2-A — Mantenimiento Preventivo United · Vista MAIN

## Alcance
- Crea la vista MAIN del módulo **Mantenimiento Preventivo**.
- Fuente operativa: Aiven, tabla real `detalle_mp_2026`.
- No crea ni altera tablas operativas.
- No implementa Detalle, alta, edición ni navegación por registro.
- Una sola carga HTTP del MAIN; los filtros y la paginación trabajan sobre el snapshot cargado.
- Sin timers propios ni consultas dentro de bucles.

## Endpoint
`GET /api/cobranza-uni/detalle-mp-2026`

Devuelve filas, catálogos y KPIs en una sola respuesta.

## Campos mostrados
Solo columnas existentes en `detalle_mp_2026`: proyecto, IDNS, cliente, periodicidad, momento_facturacion, estado, z_oper, zona_adm, forma_pago, iguala, condiciones_pago, monto_anual, pendiente_corriente, pendiente_vencido, pendiente y facturas_pendientes.

## Archivos modificados
- `index.html`
- `core/router.js`
- `modules/cobranza-uni/cobranza-uni.js`
- `modules/cobranza-uni/cobranza-uni.css`
- `backend/src/controllers/detalle-mp-2026.controller.js`
- `backend/src/routes/detalle-mp-2026.routes.js`

## SQL
`backend/sql/20260814_FASE_2A_COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO.sql` solo registra el módulo y su permiso visual en el catálogo existente.
