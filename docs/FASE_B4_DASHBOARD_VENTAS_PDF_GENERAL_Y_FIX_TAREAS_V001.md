# Fase B4 Dashboard Ventas PDF General + FIX Tareas Bilaterales V001

## Base acumulativa

- `ult ver 1420hrs 0805.zip`
- Fase B1 Dashboard Ventas PDF V001
- Fase B2 Dashboard Ventas Datos PDF V001
- Fase B3 Dashboard Ventas PDF Individual V001

## Corrección de tareas colaborativas

La sección de tareas ya no usa todas las tareas del usuario generador.

Para cada asesor del PDF se consultan únicamente tareas colaborativas abiertas entre:

1. usuario generador crea la tarea y el asesor participa como RESPONSABLE o SEGUIMIENTO; o
2. asesor crea la tarea y el usuario generador participa como RESPONSABLE o SEGUIMIENTO.

Si no existen tareas en ninguna dirección, el reporte del asesor no incluye título ni tabla de tareas.

En el PDF general esta evaluación se realiza de forma independiente para cada asesor.

## Fase B4

- El botón `Generar PDF general` crea un único archivo consolidado.
- Incluye todos los asesores activos devueltos por el selector de Dashboard Ventas.
- Cada asesor inicia en una página nueva.
- Cada bloque incluye encabezado, KPIs y las secciones comerciales/operativas aprobadas.
- Las tareas bilaterales aparecen al final del bloque únicamente cuando existen.
- Pie de página general:
  - `General | DD/MM/AAAA | Generado por: INICIALES`
  - número de página.

## Archivos modificados

- `index.html`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-dashboard/ventas-dashboard-pdf.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`

## Validaciones

- Sintaxis JavaScript con `node --check`.
- Revisión de consulta bilateral contra las columnas reales de `pendientes`, `pendientes_usuarios` y `usuarios`.
- Validación acumulativa mediante `npm run check` sobre una copia completa del proyecto.
- No se agrega SQL ni se modifican permisos de B1.
