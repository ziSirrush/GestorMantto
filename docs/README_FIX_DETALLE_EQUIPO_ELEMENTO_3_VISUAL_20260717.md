# Fix Detalle Equipo - Elemento 3 visual

Fecha: 17/07/2026

## Archivo modificado

- `core/details.js`

## Cambios

- La gráfica `Año en curso` muestra las etiquetas de los 12 meses.
- La gráfica `Bloque 365 días` muestra todas las etiquetas mensuales que forman parte del intervalo móvil.
- Las etiquetas del eje X se rotan para evitar encimamientos.
- Se amplió el margen inferior del SVG para conservar la legibilidad.
- El eje Y evita etiquetas enteras repetidas cuando el máximo de fallas es bajo.
- No se modificaron consultas, datos, backend, MTBC ni el rango U365.

## Validación

- `node --check core/details.js`: correcto.
