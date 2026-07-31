# ADR — Fotografías de Prospección en Google Drive

## Estado
Aprobación técnica requerida al desplegar Fase 3.

## Decisión
Las fotografías se cargan en Google Drive mediante la conexión OAuth del usuario y Aiven conserva metadatos y relaciones en `ventas_prospeccion_archivos`.

## Motivo
`storage_url` es `TEXT` y no debe utilizarse para guardar binarios/base64. El filesystem de Railway es efímero. Mantener archivos fuera de MySQL protege rendimiento y escalabilidad.

## Configuración
- Agregar `https://www.googleapis.com/auth/drive.file` a los alcances OAuth.
- Configurar `VENTAS_PROSPECCION_DRIVE_FOLDER_ID` en el backend. Si no existe, se usa `root` del usuario conectado.
- Los usuarios con una autorización previa de solo lectura deberán reconectar Google una vez.

## Límites
Máximo 4 imágenes por visita y 8 MB por imagen.
