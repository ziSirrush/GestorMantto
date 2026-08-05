# FIX Clientes - conteos por nombre de cliente y asesor V003

## Regla aplicada
Las métricas del listado de Clientes se calculan exclusivamente cuando coinciden:

- `ventas_cotizaciones_cor.cliente` con `ventas_clientes.nombre_empresa`.
- `ventas_cotizaciones_cor.asesor` con `ventas_clientes.iniciales`.

La comparación usa `TRIM` y `UPPER` para ignorar espacios externos y diferencias de mayúsculas/minúsculas.

## Métricas
- Cotizaciones: mismo cliente + mismo asesor.
- En proceso: mismo cliente + mismo asesor + estatus distinto de Vendido/Perdido.
- Vendidas: mismo cliente + mismo asesor + estatus Vendido.
- Perdidas: mismo cliente + mismo asesor + estatus Perdido.

## Alcance
No modifica tablas, permisos, frontend ni otras consultas.
