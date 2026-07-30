# FIX Ventas Vendidos -> Detalle de cotización + preview permanente V004

## Cambios

1. El módulo Vendidos deja de abrir su drawer independiente.
2. El nombre del proyecto y el botón Ver navegan a la vista global `ventas-cotizaciones-detalle` usando el `id_cotizacion`.
3. Los adjuntos del chat siguen dentro del comentario correspondiente.
4. Imágenes y PDF muestran vista previa permanente con carga diferida (`loading="lazy"`).
5. Otros archivos conservan tarjeta y botón Abrir.
6. No incluye cambios de base de datos ni nuevas columnas.

## Archivos

- `modules/ventas-vendidos/ventas-vendidos.js`
- `modules/ventas-vendidos/ventas-vendidos.css`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.css`

## Base acumulativa

Se tomó la última versión completa compartida y se conservaron los cambios del FIX de adjuntos V003.
