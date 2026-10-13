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
- Se alineó la lógica con las fórmulas oficiales:
  - MTBC año actual: días transcurridos desde el 1 de enero entre fallas BLT del equipo en el año.
  - MTBC U365: 365 entre fallas BLT del equipo en las últimas 365 fechas.

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

## Validaciones ejecutadas

- `node --check core/details.js`
- `node --check backend/src/controllers/data.controller.js`

Ambos archivos pasaron la validación de sintaxis.
