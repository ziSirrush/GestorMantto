# FIX_CALLCENTER_U365_PAGINACION_50

Fecha: 2026-07-17
Estado: En revisión

## Objetivo
Agregar paginación de 50 registros por página exclusivamente a las tablas de detalle creadas para Call Center:

- Detalle Llamadas U365D - Proyectos
- Detalle Llamadas U365D - Equipos

## Archivos modificados

- `callcenter/callcenter.html`
- `callcenter/callcenter.js`

## Cambios realizados

- Se agregaron controles Anterior / Siguiente en ambas vistas de detalle.
- Cada tabla muestra un máximo de 50 registros por página.
- La información de paginación muestra el rango visible, el total y la página actual.
- El ordenamiento existente se conserva y se aplica antes de paginar.
- Al cambiar la columna de ordenamiento, la tabla vuelve a la primera página.
- Los enlaces de Proyecto y Equipo continúan usando la navegación de detalle existente.

## Alcance respetado

No se modificaron:

- Dashboard principal.
- KPIs.
- Gráficas.
- Cálculos.
- Endpoints o backend.
- Tablas distintas a los dos detalles U365D.
- CSS, porque se reutiliza el componente de paginación existente.

## Validación técnica

- `callcenter.js` validado con `node --check`.

## Pruebas recomendadas

1. Abrir Detalle Llamadas U365D - Proyectos.
2. Confirmar que se muestran como máximo 50 filas.
3. Avanzar y regresar entre páginas.
4. Ordenar por distintas columnas y confirmar que vuelve a la página 1.
5. Repetir las pruebas en Detalle Llamadas U365D - Equipos.
6. Confirmar que Proyecto y Equipo siguen abriendo sus detalles flotantes.
