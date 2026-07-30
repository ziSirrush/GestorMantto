# FIX Ventas Clientes - Actividad comercial V008

- Relaciona cotizaciones históricas por nombre de cliente + asesor, normalizados por backend mediante filtros exactos existentes.
- Agrega selector de año con los años disponibles de Cotizaciones.
- Usa `/api/ventas/cotizaciones/kpis` para métricas oficiales por periodo.
- Total, En proceso y Equipos cotizados usan fecha_solicitud con respaldo fecha_cotizacion.
- Vendidas y Equipos vendidos usan fecha_cierre.
- Perdidas usa fecha_cambio_estatus.
- Corrige "Equipos página" a "Equipos vendidos".
- No requiere SQL ni cambios de backend.
