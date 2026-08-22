# FIX V011 — Cobranza United · Venta Adicional

## Alcance
Implementación acumulativa de **Venta Adicional** sobre la base vigente V010.2 de Cobranza United.

## Fuente real
- Aiven / tabla `pc`.
- Relación principal: `pc.id_proyecto_cobranza -> cobranza_proyectos.id_proyecto_cobranza`.
- No crea tablas ni modifica estructura de Aiven.

## MAIN
- Ruta existente: `cobranza-uni-aditivas`.
- KPIs: registros, venta total, pagado IVA, adeudo y facturas pendientes.
- Filtros: búsqueda, estatus, estatus administrativo, zona administrativa, zona operativa y tipo de pago.
- Tabla con proyecto, OV, cliente, concepto, tipo de pago, venta total, estatus, fecha OV, factura y adeudo.
- 30 registros por página.
- Paginación centrada.
- Los nombres de proyecto usan `ManttoFormat.projectName()` a través de `projectName_uni()`.

## DETALLE
Se incluyó detalle porque la tabla `pc` ya tiene suficiente información operativa/financiera para justificar una vista contextual.
- Información completa del registro `pc`.
- KPIs del registro.
- Comentarios de cobranza.
- Relaciones por `id_proyecto_cobranza` con Gestión de Crédito y Mantenimiento Preventivo.
- Botones de navegación a Proyecto, Gestión de Crédito y MP cuando existe relación real.

## Navegación contextual
También se habilita **Gestión de Crédito -> Ir a Venta Adicional** cuando la respuesta de detalle contiene al menos un registro `pc` relacionado. Abre el detalle real por `id_pc`; no crea una vista paralela.

## Backend
Nuevos endpoints dentro de la ruta ya existente `/api/cobranza-uni`:
- `GET /venta-adicional`
- `GET /venta-adicional/:id/detalle`

No se modifica `backend/src/routes/index.js`: `cobranza-uni.routes.js` ya se encuentra montado bajo `/cobranza-uni` en la arquitectura vigente de esta agrupación.

## Archivos modificados
- `modules/cobranza-uni/cobranza-uni.js`
- `modules/cobranza-uni/cobranza-uni.css`
- `backend/src/controllers/cobranza-uni.controller.js`
- `backend/src/routes/cobranza-uni.routes.js`

## Validaciones realizadas
- `node --check` en frontend JS.
- `node --check` en controller backend.
- `node --check` en routes backend.
- Se conserva la ruta existente `cobranza-uni-aditivas`, por lo que no se toca sidebar ni `core/router.js`.
- No se agregan timers, polling ni llamadas por fila. MAIN realiza una solicitud y filtros/paginación trabajan localmente.
