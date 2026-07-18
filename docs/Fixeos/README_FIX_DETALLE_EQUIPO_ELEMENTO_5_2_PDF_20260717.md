# Fix Detalle Equipo — Elemento 5.2 PDF

Fecha: 17/07/2026

## Archivo modificado
- `core/details.js`

## Cambio aplicado
El botón **PDF Archivo de equipo** de Detalle Equipo reutiliza la misma plantilla visual y estructura de la sección **Detalle Equipo** del PDF de Equipos Críticos.

El PDF exporta únicamente:
- El equipo actualmente abierto.
- Los tickets del año seleccionado en Detalle Equipo.
- Los emojis oficiales en el número de ticket.

Se reutilizan de la plantilla aprobada:
- Encabezado de sección.
- Colores.
- Columnas y anchos.
- Tipografía y tamaño.
- Márgenes.
- Filas alternadas.
- Pie de página y numeración del motor general de PDF.

## No modificado
- Backend.
- Elementos 1, 2, 3 y 4.
- Barra de indicadores y tabla en pantalla del Elemento 5.1.
- PDF general de Equipos Críticos.

## Validación
- `node --check core/details.js`: correcto.
