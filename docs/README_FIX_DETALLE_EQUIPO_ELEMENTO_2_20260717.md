# FIX Detalle Equipo - Elemento 2

Fecha: 17/07/2026
Proyecto: Mantto Gestor
Alcance: exclusivamente Elemento 2 de Detalle Equipo.

## Archivos modificados

- `core/details.js`
- `backend/src/controllers/data.controller.js`

## Cambios realizados

### Backend

- Se agregó `metrics.sin_responsabilidad_anio` al endpoint de Detalle Equipo.
- El valor considera tickets del año actual cuya responsabilidad no corresponde a BLT ni Cliente.
- Se revisó la lógica existente de MTBC y se conservó sin cambios:
  - MTBC año actual: promedio de días entre fallas BLT del año actual.
  - MTBC U365: promedio de días entre fallas BLT del periodo U365.

### Frontend

- Se reemplazó la presentación gris de KPIs por el estilo visual oficial de United.
- Se implementó la distribución aprobada `5 - 4 - 2 - 1`:
  - 5 KPIs de estado/incidencias.
  - 4 KPIs de operación y tiempos.
  - 2 KPIs de MTBC.
  - 1 Ring de responsabilidad.
- Se agregó un Ring único con:
  - Resp. BLT.
  - Resp. Cliente.
  - Sin responsable.
- El centro del Ring muestra el total de llamadas del año actual.
- Se agregó comportamiento responsive para escritorio, tableta y móvil.

## Fuera de alcance

No se modificaron:

- Elemento 1.
- Elemento 3.
- Elemento 4.
- Elemento 5.
- PDF.
- Rango U365.
- Fórmula de MTBC.

## Validaciones ejecutadas

- `node --check core/details.js`
- `node --check backend/src/controllers/data.controller.js`

Ambos archivos pasaron la validación de sintaxis.
