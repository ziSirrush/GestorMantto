# FIX Backend Import Comentarios Glide V001

## Endpoint de carga única

`POST /api/ventas/cotizaciones/comentarios/sync`

Recibe una sola petición desde Apps Script, valida cotizaciones y usuarios, procesa bloques de 300 y conserva todos los duplicados funcionales.

## Lectura para Detalle de Cotización

`GET /api/ventas/cotizaciones/:id/comentarios` ahora devuelve cada comentario con `archivos: []`.

Los enlaces históricos se leen desde `storage_url` y se exponen como `archivo_url`.

## Orden

1. Ejecutar `backend/sql/20260730_VENTAS_COMENTARIOS_GLIDE_IMPORT_V001.sql`.
2. Desplegar backend.
3. Ejecutar Apps Script una sola vez.
4. Revisar contadores y errores devueltos.
