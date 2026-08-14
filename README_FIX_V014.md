# FIX V014 — Relaciones Cobranza United por Proyecto

## Regla aplicada
Las relaciones funcionales y de navegación entre:
- Gestión de Crédito (`gestion_credito`)
- Mantenimiento Preventivo (`detalle_mp_2026`)
- Venta Adicional (`pc`)

se resuelven por coincidencia de `proyecto`, normalizando mayúsculas/minúsculas y espacios externos.

`id_proyecto_cobranza` se conserva como dato técnico donde exista, pero deja de ser requisito o criterio de consulta para estas relaciones cruzadas.

## Flujo resultante
- GC → MP: busca todos los MP del mismo proyecto.
- GC → Venta Adicional: busca todas las facturas/ventas del mismo proyecto.
- MP → GC: busca Gestión de Crédito del mismo proyecto.
- MP → Venta Adicional: busca todas las facturas/ventas del mismo proyecto.
- Venta Adicional → GC: busca Gestión de Crédito del mismo proyecto.
- Venta Adicional → MP: busca los MP del mismo proyecto.

Esto permite que varias filas/facturas de `pc` pertenezcan funcionalmente al mismo proyecto sin requerir que cada factura tenga `id_proyecto_cobranza` poblado.

## Archivos modificados
- `backend/src/controllers/cobranza-uni.controller.js`
- `backend/src/controllers/detalle-mp-2026.controller.js`
- `modules/cobranza-uni/cobranza-uni.js`

## Sin cambios
- No SQL.
- No tablas nuevas.
- No cambios de schema Aiven.
- No cambios en `index.html`.
- No cambios en sidebar/permisos.
- No cambios en `core/router.js`.
- Se conserva el historial interno V013.
