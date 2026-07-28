# FIX Backend Ventas Sync ISO VARCHAR V003

## Base acumulativa
Incluye los cambios de `FIX_VENTAS_VENDIDOS_CRITERIOS_FECHA_V002`.

## Cambios
- El `id_cot` recibido desde Google Sheets se guarda en `id_cot_origen`.
- `id_cotizacion` deja de enviarse en el INSERT y queda a cargo del AUTO_INCREMENT de MySQL.
- La detección de existentes y el UPSERT se realizan por la llave UNIQUE `id_cot_origen`.
- Las fechas continúan como `VARCHAR(50)` con valores ISO.
- Cotizaciones por año: primeros cuatro caracteres de `fecha_cotizacion` o `fecha_solicitud`.
- Vendidos por año: primeros cuatro caracteres de `fecha_cierre`.
- Perdidos por año: primeros cuatro caracteres de `fecha_cambio_estatus`.
- Vendidos sin fecha de cierre siguen siendo un control global y respetan visibilidad/filtros restantes.

## Archivos modificados
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`

## Aplicación
Copiar ambos archivos sobre la backend vigente, publicar en Azure y después ejecutar nuevamente Apps Script.

No requiere cambios SQL adicionales si existe:
- `id_cotizacion` AUTO_INCREMENT PRIMARY KEY
- `id_cot_origen` con UNIQUE KEY
- las cuatro fechas como VARCHAR(50)
