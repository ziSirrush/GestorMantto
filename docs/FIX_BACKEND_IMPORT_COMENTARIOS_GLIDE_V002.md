# FIX Backend Importación Comentarios Glide V002

Corrige el receptor para insertar comentarios usando únicamente las columnas reales de `ventas_cotizaciones_comentarios`:

- id_cotizacion
- id_usuario
- comentario
- id_comentario_padre
- editado
- activo
- created_at
- updated_at

El receptor puede seguir recibiendo `id_origen` y `zona_horaria_origen` desde Apps Script, pero no intenta guardarlos en MySQL.

La tabla `ventas_cotizaciones_archivos` mantiene el uso de `storage_provider` y `storage_url`, porque esas columnas sí aparecen en el dump revisado.

No requiere ALTER TABLE para comentarios.
