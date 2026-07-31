# FIX Mapa Prospección — Leaflet y estados V008

## Objetivo

Corregir la inicialización del mapa cuando Leaflet no está precargado en la plantilla y evitar que un fallo del componente geográfico se presente como una desconexión de Aiven.

## Cambios

- El módulo carga Leaflet 1.9.4 bajo demanda desde cdnjs.
- Se evita insertar más de una vez el CSS o JavaScript de Leaflet.
- La consulta a `/api/ventas/prospeccion/mapa` se ejecuta antes de inicializar el mapa.
- Los estados se separan:
  - error de API/Aiven;
  - Aiven conectado con mapa no disponible;
  - Aiven conectado y mapa operativo.
- Si falla Leaflet, el resultado conserva el número de puntos consultados y muestra un aviso informativo, no una falsa desconexión de Aiven.
- Se agrega tiempo de espera de 12 segundos para la descarga de Leaflet.

## Dependencia externa

La librería Leaflet y las teselas de OpenStreetMap requieren acceso a Internet desde el navegador. Aiven y el backend pueden seguir conectados aunque el proveedor cartográfico no esté disponible.

## Archivos modificados

- `modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.js`
- `modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.css`
