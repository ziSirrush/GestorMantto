# FIX Backend Ventas - KPIs por estatus V006

## Base
FIX_BACKEND_VENTAS_VISIBILIDAD_V005.

## Corrección
El endpoint `GET /api/ventas/cotizaciones/kpis` ya devolvía total de cotizaciones y equipos, pero no incluía los campos que consume el frontend para Embudo activo, Vendidas y Perdidas.

Ahora calcula esos KPIs usando la distribución real de `ventas_cotizaciones_cor.estatus_proyecto`, dentro del mismo alcance de visibilidad del usuario.

### Embudo activo
- Contacto
- En Cotizacion
- Sin Respuesta
- Seguimiento con Probabilidad
- En Espera de Definicion
- Pre Asignado
- Asignado
- En Contrato

### Vendidas
- Vendido

### Perdidas
- Perdido

## Campos agregados a la respuesta
- `embudo_activo`
- `total_embudo`
- `vendidas`
- `total_vendidas`
- `perdidas`
- `total_perdidas`

No requiere cambios de SQL ni frontend.
