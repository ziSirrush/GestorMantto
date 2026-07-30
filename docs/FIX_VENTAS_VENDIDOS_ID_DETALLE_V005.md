# FIX Ventas Vendidos ID Detalle V005

## Objetivo
Corregir la navegación desde el módulo Vendidos hacia la vista global Detalle de cotización.

## Cambios
- La backend normaliza `id_cotizacion` como número en la respuesta de `/api/ventas/cotizaciones/vendidos`.
- El frontend resuelve el identificador desde nombres compatibles (`id_cotizacion`, `idCotizacion`, `cotizacion_id`, `id_cotizacion_cor` o `id`).
- El proyecto, el botón Ver y el renglón completo abren Detalle de cotización usando el ID interno.
- No se utiliza `mx` como llave de navegación.
- Si un registro realmente no incluye ID interno, se muestra `Sin ID interno` y se registra el objeto en consola para diagnóstico.
- No modifica tablas ni requiere ALTER TABLE.

## Archivos modificados
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `modules/ventas-vendidos/ventas-vendidos.js`

## Validación
Ejecutar:

```bash
node --check backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js
node --check modules/ventas-vendidos/ventas-vendidos.js
```
