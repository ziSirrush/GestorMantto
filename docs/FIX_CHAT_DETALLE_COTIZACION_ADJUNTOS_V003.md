# FIX Chat Detalle de Cotización — Adjuntos dentro del comentario V003

## Objetivo
Mostrar cada imagen o archivo dentro del comentario al que pertenece, encima del texto del mensaje.

## Cambios
- El endpoint `GET /api/ventas/cotizaciones/:id/comentarios` devuelve `archivos: []` por comentario.
- La URL visible usa `storage_url` y mantiene `drive_url` como compatibilidad.
- Se elimina el historial lateral independiente de archivos.
- Las imágenes se muestran como miniatura enlazada.
- PDF y otros archivos se muestran como tarjeta enlazada.
- No agrega ni modifica columnas de base de datos.

## Archivos
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.css`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.html`

## Validación
```bash
node --check backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js
node --check backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js
node --check modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js
```
