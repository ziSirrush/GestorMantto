# Dashboard Call Center - Criticidad por usuario

## Cambios

- Se eliminó el uso de la criticidad anual/corporativa para mostrar `💥`.
- El módulo consulta las preferencias del usuario:
  - `criticos_fallas`
  - `criticos_periodo`
- El conjunto de equipos críticos se obtiene desde `/api/equipos-criticos` usando dichas preferencias.
- Valores de respaldo: 3 fallas RESP BLT en 35 días.
- Cuando el usuario actualiza sus preferencias desde Equipos Críticos, Dashboard Call Center refresca el conjunto de críticos durante la sesión.
- El emoji `💥` se concatena al Equipo cuando la tabla contiene Proyecto y Equipo.
- El Proyecto deja de heredar automáticamente el emoji de criticidad.
- El KPI `En críticos` conserva el emoji `💥` y usa el mismo conjunto de equipos críticos del usuario.

## Archivos modificados

- `modules/callcenter/callcenter.js`

## Validaciones

- Sintaxis validada con `node --check`.
- No se modificó backend, SQL, MTBC, PDF ni otros módulos.
- Se conservaron rutas y helpers generales existentes.
