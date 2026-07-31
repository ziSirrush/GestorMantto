# Fase 4A — Detalle de visita de Prospección V001

## Alcance
- Vista completa, no modal.
- Apertura desde listado y desde cada marcador del mapa.
- Consulta del endpoint existente `GET /api/ventas/prospeccion/:id`.
- Información general, contacto y puesto, relaciones comerciales, comentario inicial, archivos, ubicación, seguimientos existentes y auditoría básica.
- Regreso mediante el historial del router para conservar el contexto de navegación.

## No incluido
- Alta de seguimientos.
- Edición de la visita.
- Cambio de estatus.
- Descarga autenticada/proxy de archivos privados de Google Drive.

## Nota de archivos
La vista usa `thumbnail_url` o `storage_url`. Si Google Drive exige autenticación y no permite renderizar la miniatura directamente, se conserva el enlace “Abrir archivo”. La descarga autorizada mediante backend corresponde a una fase posterior.
