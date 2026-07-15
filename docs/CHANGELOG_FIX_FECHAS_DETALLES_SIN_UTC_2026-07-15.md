# Fix: fechas operativas en detalles sin conversión UTC

Fecha: 2026-07-15

## Archivo modificado

- `core/details.js`

## Cambio

Se ajustó la función general `fmtDate()` utilizada por los detalles de Ticket, Equipo y Proyecto.

Las fechas recibidas como `AAAA-MM-DD`, `AAAA-MM-DDTHH:mm:ss...`, `DD/MM/AAAA` o `AAAA/MM/DD` ahora se presentan directamente como `DD/MM/AAAA`, sin crear objetos `Date` ni aplicar conversiones de zona horaria.

## Resultado esperado

- `2026-07-15` se muestra como `15/07/2026`.
- `2026-07-15T00:00:00.000Z` se muestra como `15/07/2026`.
- Se evita que una fecha operativa aparezca como el día anterior.

## Alcance

Afecta únicamente la presentación de fechas en vistas que reutilizan `core/details.js`. No modifica backend, SQL, consultas ni valores almacenados.
