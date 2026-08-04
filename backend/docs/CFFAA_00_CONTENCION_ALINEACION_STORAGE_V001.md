# CFFAA-00 — Contención y alineación de Azure Storage

## Objetivo

Alinear de forma aditiva las tablas existentes con el backend de Azure Storage, sin unificar tablas, eliminar registros históricos ni modificar llaves foráneas.

## Hallazgos validados

- `sup_adjuntos` no tenía `storage_provider`, `storage_container` ni `storage_blob_name`.
- `pendientes_comentarios_adjuntos` no tenía los metadatos Azure requeridos por el backend.
- Ventas/Prospección y Ventas/Cotizaciones ya disponen de columnas Azure y no reciben cambios estructurales en esta fase.
- Los scripts `fase_3_azure_storage_aditiva.sql` y `20260803_AZURE_STORAGE_ARCHIVOS_ACTIVOS_V002.sql` eran duplicados y quedan obsoletos.

## Cambios

1. Migración idempotente `20260803_CFFAA_00_ALINEACION_STORAGE.sql`.
2. Postflight de solo lectura `20260803_CFFAA_00_POSTFLIGHT.sql`.
3. Validación de esquema al iniciar el backend.
4. Bloqueo preventivo de las rutas de carga de Soporte y comentarios de Pendientes cuando falten columnas.
5. `GET /api/pendientes` requiere sesión y aplica el alcance oficial: personales creadas por el usuario; colaborativas creadas por el usuario o relacionadas con sus iniciales.
6. Sincronizaciones históricas de Prospección y Cotizaciones quedan deshabilitadas por defecto, requieren sesión y rol Programador.
7. Diagnósticos de Azure quedan deshabilitados por defecto y requieren rol Programador.

## Aplicación

1. Ejecutar `backend/sql/20260803_CFFAA_00_ALINEACION_STORAGE.sql` en Aiven.
2. Ejecutar `backend/sql/20260803_CFFAA_00_POSTFLIGHT.sql`.
3. Confirmar que aparecen todas las columnas e índices esperados.
4. Publicar los archivos backend del FIX.
5. Validar `npm run check` y `/api/health`.
6. Probar un archivo pequeño en Pendientes y Soporte.

## Variables nuevas

```env
CFFAA_SCHEMA_CACHE_MS=60000
CFFAA_HISTORICAL_SYNC_ENABLED=false
AZURE_STORAGE_DIAGNOSTICS_ENABLED=false
```

Las sincronizaciones históricas solo deben activarse durante una importación controlada y volver a `false` al terminar.

## Fuera de alcance

- Cambio de Base64 a multipart en Home.
- Nueva tabla `pendientes_archivos`.
- Cola de eliminación de blobs.
- Rediseño de Soporte, Prospección o Cotizaciones.
- Migración de históricos Glide/Drive/locales.
