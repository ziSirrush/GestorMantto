# FIX Cargas de archivos hacia Azure Storage V001

## Hallazgos
- Soporte guardaba archivos físicamente en `backend/uploads/support`.
- Home/Pendientes guardaba evidencias en `backend/uploads/pendientes` y comentarios como URL local.
- Ventas/Prospección enviaba cargas nuevas a Google Drive.
- Ventas/Cotizaciones tenía la tabla preparada, pero la carga física seguía deshabilitada.
- Instalaciones/Proyectos solo conserva una vista previa local de demostración; no existe una carga persistente activa y el módulo permanece sin tocar.

## Cambios
- Todas las cargas persistentes activas pasan por el servicio general `azure-storage.service.js`.
- Azure Blob conserva el archivo físico en el contenedor privado.
- Aiven conserva la relación y metadatos en la tabla propia de cada módulo.
- Las vistas reciben enlaces SAS temporales; no se guarda la SAS en la base.
- Se conservan enlaces históricos de Glide, Drive y rutas locales para lectura gradual.
- Límite unificado: 25 MB por archivo, respetando `AZURE_STORAGE_MAX_FILE_MB`.

## Flujos incluidos
- Home: evidencia inicial y adjunto de comentarios.
- Soporte: adjuntos de solicitudes.
- Ventas/Prospección: fotos de visita y archivos de comentarios.
- Ventas/Cotizaciones: archivo adjunto dentro de una interacción.

## SQL
Ejecutar `backend/src/sql/20260803_AZURE_STORAGE_ARCHIVOS_ACTIVOS_V002.sql` solo si aún no se ejecutó `fase_3_azure_storage_aditiva.sql`.

## No modificado
- Gestor de carpetas de Instalaciones y navegación de Google Drive.
- Archivos históricos existentes.
- Tablas funcionales y llaves foráneas.
- Permisos de Ventas y fallback de Acceso total.
