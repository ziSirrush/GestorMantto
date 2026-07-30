# FIX Backend Ventas - Fecha Solicitud V005

Base acumulativa: FIX_BACKEND_VENTAS_SYNC_ISO_VARCHAR_V004.

## Regla corregida

Cotizaciones usa exclusivamente `fecha_solicitud` para:
- filtro anual del listado;
- Total, En proceso y Equipos;
- distribuciones y graficas dependientes del periodo de cotizacion;
- catalogo de anos.

Se mantienen sin cambios:
- Vendidos por `fecha_cierre`;
- Perdidos por `fecha_cambio_estatus`;
- sincronizacion por `id_cot_origen`;
- fechas ISO almacenadas como VARCHAR.
