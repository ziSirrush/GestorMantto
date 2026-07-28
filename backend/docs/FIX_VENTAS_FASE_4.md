# FIX Ventas Fase 4 — Comentarios y archivos

## Base
Backend preliminar recibido. Se conserva `id_cot_origen`; el usuario aplicará su `ALTER TABLE` por separado.

## Cambios
- Sustituidas las rutas `/seguimientos` por `/comentarios`.
- Eliminada la dependencia funcional de `ventas_cotizaciones_historial`.
- Agregado CRUD lógico de comentarios tipo chat.
- Agregado CRUD lógico de metadatos de archivos asociados a Google Drive.
- Validada pertenencia de comentarios y archivos a la cotización indicada.
- Los comentarios solo pueden ser editados o eliminados por su autor.
- Los archivos se eliminan lógicamente; el endpoint no elimina el archivo físico de Drive.

## Rutas
- `GET /api/ventas/cotizaciones/:id/comentarios`
- `POST /api/ventas/cotizaciones/:id/comentarios`
- `PATCH /api/ventas/cotizaciones/:id/comentarios/:idComentario`
- `DELETE /api/ventas/cotizaciones/:id/comentarios/:idComentario`
- `GET /api/ventas/cotizaciones/:id/archivos`
- `POST /api/ventas/cotizaciones/:id/archivos`
- `GET /api/ventas/cotizaciones/:id/archivos/:idArchivo`
- `PATCH /api/ventas/cotizaciones/:id/archivos/:idArchivo`
- `DELETE /api/ventas/cotizaciones/:id/archivos/:idArchivo`

## SQL requerido
Ejecutar `sql/20260728_FIX_VENTAS_FASE_4_COMENTARIOS_ARCHIVOS.sql` después de confirmar que `id_cotizacion` y `usuarios.id_SB` conservan los tipos previstos.

## Nota de Drive
El backend registra metadatos (`drive_file_id`, carpeta y URL). La carga/eliminación física en Google Drive debe realizarse por la integración documental correspondiente.
