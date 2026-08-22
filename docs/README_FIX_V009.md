# FIX V009 — Detalle Mantenimiento Preventivo + tablas relacionadas

Fecha: 2026-08-14

## Alcance

Este FIX parte de la implementación actual de Cobranza United y modifica únicamente archivos relacionados con Gestión de Crédito y Mantenimiento Preventivo.

### 1. Mantenimiento Preventivo — MAIN
- Conserva la fuente Aiven `detalle_mp_2026`.
- Estándar de tabla: **30 registros por página**.
- Paginación centrada.
- Las filas de la MAIN abren el nuevo Detalle Mantenimiento Preventivo.

### 2. Detalle Mantenimiento Preventivo
- Usa el registro real de `detalle_mp_2026` seleccionado por `id_dmp`.
- Muestra información operativa/comercial disponible en la tabla real.
- KPIs: monto anual, pendiente corriente, pendiente vencido, pendiente total y facturas pendientes.
- Carga selectiva bajo demanda mediante `GET /api/cobranza-uni/detalle-mp-2026/:id`.
- Relaciones por la FK real `id_proyecto_cobranza`:
  - Gestión de Crédito (`gestion_credito`).
  - Mantenimiento Preventivo del mismo proyecto (`detalle_mp_2026`).
  - Venta Adicional (`pc`).
- No se agregan fechas, contratos, archivos o conceptos que no existan en las tablas verificadas.

### 3. Detalle Gestión de Crédito — tablas relacionadas
- La relación prioriza `id_proyecto_cobranza`; conserva fallback por IDNS/proyecto solo para registros antiguos sin FK.
- Tabla Mantenimiento Preventivo:
  - búsqueda local;
  - filtro Estado;
  - filtro Periodicidad;
  - 30 registros por página;
  - paginado centrado;
  - botón Abrir enlazado al nuevo Detalle Mantenimiento Preventivo.
- Tabla Venta Adicional:
  - búsqueda local;
  - filtro Estatus;
  - 30 registros por página;
  - paginado centrado.

## Optimización respetada
- Sin timers propios.
- Sin `fetch` dentro de filas/bucles.
- Los filtros y la paginación operan sobre datos ya cargados; no generan una nueva llamada por cambio de filtro.
- El Detalle MP realiza una sola solicitud selectiva al abrirse.
- Aiven se mantiene como fuente oficial.

## Archivos modificados
- `modules/cobranza-uni/cobranza-uni.js`
- `modules/cobranza-uni/cobranza-uni.css`
- `backend/src/controllers/cobranza-uni.controller.js`
- `backend/src/controllers/detalle-mp-2026.controller.js`
- `backend/src/routes/detalle-mp-2026.routes.js`

## Base de datos
No requiere SQL ni cambios de esquema.

## Validaciones realizadas
- `node --check modules/cobranza-uni/cobranza-uni.js`
- `node --check backend/src/controllers/cobranza-uni.controller.js`
- `node --check backend/src/controllers/detalle-mp-2026.controller.js`
- `node --check backend/src/routes/detalle-mp-2026.routes.js`
- Columnas de las relaciones contrastadas contra el dump `Estrutura completa 0432hrs 0814.sql`.

## Validación posterior al deploy
1. Abrir Mantenimiento Preventivo y confirmar 30 filas por página y paginado centrado.
2. Abrir una fila y confirmar Detalle MP.
3. Confirmar que Gestión de Crédito se carga por el mismo `id_proyecto_cobranza`.
4. Confirmar tablas MP y Venta Adicional relacionadas.
5. En Detalle Gestión de Crédito validar búsqueda/filtros/paginación y botón Abrir en MP.
6. Revisar Network: una solicitud de detalle al abrir y ninguna solicitud adicional al filtrar/paginar localmente.
