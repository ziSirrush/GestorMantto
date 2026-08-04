# Fase 3 backend - Azure Blob Storage V001

## Alcance

Infraestructura backend general para Azure Blob Storage, sin sustituir las tablas funcionales de adjuntos.

## Variables requeridas

- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_BLOB_CONTAINER_NAME`
- `AZURE_STORAGE_MAX_FILE_MB`
- `AZURE_STORAGE_SAS_MINUTES`

No usa connection string ni account key.

## Rutas tecnicas

Todas requieren sesion y rol Programador:

- `GET /api/azure-storage/status`
- `POST /api/azure-storage/diagnostico/subir` con multipart campo `archivo`
- `GET /api/azure-storage/diagnostico/acceso?blob_name=...`
- `DELETE /api/azure-storage/diagnostico/blob` con JSON `{ "blob_name": "..." }`

Estas rutas son para validar infraestructura. La integracion funcional debe hacerse modulo por modulo usando el servicio general.

## Seguridad

- Contenedor privado.
- Managed Identity.
- SAS de solo lectura y tiempo limitado.
- Bloqueo de ejecutables y scripts comunes.
- Limite de tamaño configurable.
- Nombre de blob unico y saneado.
- No se exponen secretos.

## SQL

`src/sql/fase_3_azure_storage_aditiva.sql` amplia solamente las tablas antiguas que no tenian metadatos Azure. Las tablas de Ventas ya incluyen estos campos.

## Dependencias nuevas

- `@azure/identity`
- `@azure/storage-blob`

Ejecutar `npm install` en el backend antes del despliegue para actualizar `package-lock.json` en el entorno con acceso al registro npm.
