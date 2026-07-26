# Google Drive Backend V001

## Alcance

Integración de lectura de Google Drive reutilizando el OAuth por usuario ya aprobado.

El alcance OAuth configurado actualmente es `drive.readonly`; por ello esta versión no incorpora crear, subir, renombrar ni eliminar archivos.

## Archivos nuevos

- `src/services/google/drive.service.js`
- `src/controllers/google-drive.controller.js`
- `src/routes/google-drive.routes.js`

## Archivos modificados

- `src/services/google/google-oauth.repository.js`
- `src/routes/index.js`

## Endpoints

- `GET /api/google/drive/about`
- `GET /api/google/drive/files`
- `GET /api/google/drive/files/:fileId`
- `GET /api/google/drive/files/:fileId/download`

Todos requieren `Authorization: Bearer <JWT Mantto Gestor>`.

## Funciones

- Creación de cliente Drive con tokens cifrados del usuario.
- Renovación automática del access token mediante refresh token.
- Persistencia de tokens renovados y `last_refresh_at`.
- Detección de autorización revocada y solicitud de reconexión.
- Listado paginado de carpetas y archivos.
- Búsqueda por nombre y filtro por tipo.
- Metadatos de archivo.
- Descarga de archivos binarios.
- Exportación de Google Docs, Sheets, Slides y Drawings.

## Prueba inicial

`GET /api/google/drive/about`

Después:

`GET /api/google/drive/files?folder_id=root&page_size=100`
