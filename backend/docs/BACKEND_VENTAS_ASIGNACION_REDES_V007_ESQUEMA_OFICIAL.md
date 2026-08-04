# Backend Ventas > Asignación a Redes V007

## Objetivo

Corregir la importación histórica para utilizar exclusivamente las columnas oficiales ya creadas en:

- `ventas_redes`
- `ventas_redes_archivos`
- `ventas_redes_comentarios`
- `ventas_redes_comentarios_adjuntos`

No agrega columnas, no requiere migración SQL y no modifica las cuatro tablas.

## Archivos modificados

- `backend/src/modules/ventas-redes/ventas-redes-sync.repository.js`
- `backend/src/modules/ventas-redes/ventas-redes-sync.service.js`

## Correcciones

- Se retiraron por completo las referencias a columnas no oficiales:
  - `contacto_via_origen`
  - `estado_origen`
  - `solicitud_origen`
  - `estatus_origen`
  - `cotizacion_origen`
- El `INSERT ... ON DUPLICATE KEY UPDATE` usa únicamente los encabezados oficiales de `ventas_redes`.
- Los valores de catálogo se resuelven por la ruta oficial; si no existe una coincidencia única, se guarda `NULL` y se registra una advertencia sin rechazar la fila.
- La cotización se intenta resolver contra cotizaciones activas por:
  - `id_cotizacion`
  - `id_cot_origen`
  - coincidencia única con `nombre_proyecto`, `visualiza` o `cliente`
- Si la referencia de cotización no puede resolverse de forma única, se guarda `NULL` y la fila continúa.
- Las evidencias y comentarios conservan las tablas oficiales existentes.

## SQL requerido

Ninguno.

No ejecutar la migración V006 que agregaba columnas `*_origen`.

## Validación

- Sintaxis Node.js validada en ambos archivos.
- `npm run check` ejecutado correctamente sobre la última versión publicada.
- Confirmado que el SQL del repository no utiliza columnas adicionales en `ventas_redes`.

## Resultado esperado

Después de vaciar las cuatro tablas y desplegar este FIX, la importación no debe producir `ER_BAD_FIELD_ERROR` por columnas inexistentes.

Las relaciones históricas no resueltas aparecerán como advertencias y se guardarán como `NULL`, sin rechazar el registro completo.
