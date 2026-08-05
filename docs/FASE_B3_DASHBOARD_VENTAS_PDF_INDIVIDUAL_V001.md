# Fase B3 - Dashboard Ventas PDF individual V001

## Base acumulativa
- `ult ver 1420hrs 0805.zip`
- Fase B1 permisos y botones
- Fase B2 preparación de datos PDF

## Implementación
- Generación real del PDF individual en frontend mediante jsPDF + AutoTable ya existentes.
- Diseño basado en el segundo dummy aprobado: sin portada, identificación simple, KPIs y tablas.
- Pie de página: `INICIALES_ASESOR | DD/MM/AAAA | Generado por: INICIALES_CREADOR`.
- Tareas colaborativas al final y omitidas completamente cuando no existen.
- Tablas con márgenes de 18 pt, fuente 6.5-7 pt, texto envuelto, filas de altura automática y encabezados repetidos.
- Logística y Clientes ajustadas al ancho imprimible.
- Colores de botones corregidos a la paleta azul de Mantto Gestor; se eliminan azul brillante y morado de identificación temporal.

## Alcance
- El botón individual genera el PDF del asesor seleccionado.
- El botón general conserva la preparación de datos de B2 y se completará en B4.
- No hay cambios de base de datos ni SQL nuevo.

## Archivos modificados
- `index.html`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-dashboard/ventas-dashboard.css`

## Archivo nuevo
- `modules/ventas-dashboard/ventas-dashboard-pdf.js`
