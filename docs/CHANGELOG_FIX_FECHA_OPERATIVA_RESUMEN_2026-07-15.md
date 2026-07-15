# Fix de fecha operativa - Resumen del Dia

Fecha: 2026-07-15

## Cambio aplicado

Se corrigio la normalizacion de `fecha_reporte` en `modules/resumen-dia/resumen-dia.js`.

- Los campos de fecha operativa se tratan como dias de calendario.
- Se elimino el fallback que convertia cadenas mediante `new Date(...).toISOString()`.
- Las fechas `YYYY-MM-DD`, MySQL `DATETIME`, ISO, `YYYY/MM/DD` y `DD/MM/YYYY` se procesan sin conversion de zona horaria.
- Un formato desconocido ya no se transforma de manera silenciosa; se registra una advertencia en consola y se descarta.

## Resultado esperado

- `2026-07-15` permanece como `2026-07-15`.
- No se resta ni suma un dia por UTC o zona horaria.
- Resumen del Dia agrupa los tickets usando exactamente la fecha operativa recibida.

## Archivos modificados

- `modules/resumen-dia/resumen-dia.js`
