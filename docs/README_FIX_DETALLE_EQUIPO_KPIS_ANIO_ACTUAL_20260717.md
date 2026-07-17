# FIX Detalle Equipo - KPIs Año Actual

Fecha: 17/07/2026
Proyecto: Mantto Gestor
Alcance: exclusivamente unificar el periodo de los KPIs superiores con el Ring de responsabilidad.

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `core/details.js`

## Cambio realizado

Los siguientes KPIs ahora se calculan únicamente con tickets cuya `fecha_reporte` pertenece al año calendario actual:

- Total cerrados.
- Total en curso.
- Total abiertos.
- Con filtración.
- Atrapados.
- Por voltaje.
- Total en SLA.
- Promedio de tiempo de llegada.
- Promedio de tiempo de solución.

El backend crea un único universo `currentYearTickets` y lo reutiliza para los KPIs y para el Ring. Así, la suma de Cerrados + En curso + Abiertos corresponde al mismo total anual mostrado en el centro del Ring.

Los subtítulos visuales de esos KPIs cambiaron de `Histórico del equipo` a `Año actual`.

## Sin cambios

- Ring y clasificación BLT / Cliente / Sin responsable.
- MTBC Año Actual.
- MTBC U365.
- Rango U365.
- Elementos 1, 3, 4 y 5.
- PDF.

## Validaciones

- `node --check core/details.js`
- `node --check backend/src/controllers/data.controller.js`
