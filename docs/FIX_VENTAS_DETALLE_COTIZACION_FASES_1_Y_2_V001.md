# FIX Ventas Detalle de Cotización – Fases 1 y 2 V001

## Cambios

- Elimina Fecha base del resumen visual.
- Mantiene Estatus, Asesor y Equipos.
- Permite actualizar el estatus directamente desde el detalle mediante `PATCH /api/ventas/cotizaciones/:id/estatus`.
- Solicita Fecha de cierre al cambiar a Vendido.
- Solicita Razón de pérdida y permite Empresa competidora al cambiar a Perdido.
- Elimina ID equipo vendido de la vista.
- Elimina Fecha cambio estatus de la vista.
- Muestra Fecha cierre únicamente para Vendido.
- Muestra Razón perdido y Empresa competidora únicamente para Perdido.
- Elimina las tabs Comentarios y Archivos.
- Integra Chat y Gestor de archivos al final de Información.
- Conserva lectura y creación de comentarios reales.
- Conserva consulta de archivos vinculados a Drive.

## Nota sobre archivos

La tabla actual guarda metadatos y referencias de Google Drive; no almacena binarios. Por ello el selector valida el archivo y comunica que la carga física se habilitará con la integración autorizada de Drive. No se agregaron llaves, credenciales ni almacenamiento temporal en Azure.

## Archivos

- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.html`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.css`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `index.html`
