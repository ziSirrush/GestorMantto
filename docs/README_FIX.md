# FIX Backend Ventas - encabezados reales de MySQL

Archivos modificados:

- `src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`

Corrección aplicada:

- El encabezado de Google Sheets `id_cot` se normaliza a la columna real de MySQL `id_cotizacion`.
- Se eliminó toda referencia a la columna inexistente `id_cot_origen`.
- El UPSERT ahora usa la llave primaria real `id_cotizacion`.
- `id_cotizacion` conserva `AUTO_INCREMENT`, pero durante la sincronización recibe explícitamente el valor de `id_cot` de Sheets.

No se modificaron rutas, controlador, autenticación ni Apps Script.
