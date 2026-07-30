# FIX Ventas Perdidos - Fase 1 V001

Base acumulativa:
1. Local Ver 1400 hrs.zip
2. FIX de Clientes V001 a V010
3. FIX Contactos y Detalle Cotizacion V011
4. FIX Anadir Cliente Directo V012

## Alcance
- Integra el modulo independiente Ventas > Perdidos al panel lateral.
- Usa datos reales de Aiven.
- Incluye KPI, busqueda, filtros, tabla y paginacion.
- El periodo de perdida usa exclusivamente `fecha_cambio_estatus`.
- Solo incluye registros con `estatus_proyecto = Perdido`.
- Agrega filtros por ano, asesor y razon de perdida.
- Abre la vista unica `ventas-cotizaciones-detalle` al seleccionar una fila.
- Respeta el alcance comercial resuelto por backend.

## KPI
- Cotizaciones perdidas.
- Equipos perdidos.
- Con razon registrada.
- Sin razon registrada.

## Backend
Se completa el endpoint existente:
`GET /api/ventas/cotizaciones/perdidos`

El catalogo de cotizaciones ahora tambien expone:
- `anios_perdidos`
- `razones_perdido`

No requiere SQL.
