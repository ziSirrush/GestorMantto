# CFFAA-05 - Ventas / Cotizaciones Azure

Versión: V001  
Fecha: 2026-08-03  
Estado: Desarrollo / pruebas

## Objetivo

Convertir la interacción comentario + archivo en una sola operación funcional y mantener la compatibilidad con archivos históricos de Glide/Google Drive y con el versionado existente.

## Contrato nuevo

`POST /api/ventas/cotizaciones/:id/comentarios`

- Acepta `multipart/form-data`.
- Campo de texto opcional: `comentario`.
- Campo de archivo opcional: `archivo`.
- Requiere al menos uno de los dos.
- Crea el comentario, carga el blob y registra el archivo dentro de una sola transacción funcional.
- Si Azure sube el archivo y Aiven falla, se intenta eliminar el blob y se usa la cola CFFAA-01D cuando sea necesario.
- Los comentarios únicamente con archivo se guardan con texto vacío, sin crear el comentario artificial `Archivo adjunto`.

## Acceso a archivos

Las listas y detalles no generan SAS anticipadas. Para archivos Azure se devuelve:

`GET /api/ventas/cotizaciones/:id/archivos/:idArchivo/acceso`

El endpoint valida sesión, permiso de Ventas y visibilidad de la cotización antes de emitir acceso temporal.

Los archivos históricos conservan una URL HTTPS segura cuando existe. No se modifican `drive_file_id`, `drive_folder_id`, `drive_url`, `version_numero` ni `id_archivo_anterior` históricos.

## Bajas coordinadas

Al eliminar un comentario:

1. se bloquean sus archivos activos;
2. comentario y archivos se desactivan en la misma transacción SQL;
3. después del `COMMIT` se eliminan blobs Azure;
4. los fallos se envían a `storage_operaciones_pendientes`.

La eliminación individual de archivo sigue el mismo patrón de baja lógica y limpieza posterior.

## Compatibilidad

- Los comentarios únicamente de texto enviados como JSON siguen siendo aceptados por Express.
- El endpoint independiente `/archivos` se conserva para archivos generales y nuevas versiones.
- Ese endpoint ya no permite asociar un archivo a un comentario; dicha relación debe crearse mediante la interacción multipart atómica.
- No hay migración estructural en esta fase.

## Notificaciones

El frontend emite una sola actualización local `mantto:ventas-cotizacion-actualizada` después de que la única petición de interacción termina correctamente. No se añadió lógica duplicada en `sup_notificaciones`; la integración de notificaciones comerciales debe usar el servicio general pendiente del proyecto.

## Aplicación

1. Aplicar los archivos del FIX.
2. Ejecutar `npm run check`.
3. Ejecutar `node scripts/validate-cffaa-05.js`.
4. Publicar backend y frontend.
5. Ejecutar `sql/20260803_CFFAA_05_POSTFLIGHT.sql`.
6. Probar texto, archivo y texto + archivo.

## Rollback

Restaurar los archivos anteriores del módulo. No hay rollback SQL porque CFFAA-05 no cambia el esquema.
