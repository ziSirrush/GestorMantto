# Fix PDF Proyectos Críticos

## Archivo modificado

- `equipos-criticos/equipos-criticos.js`

## Corrección

El PDF de **Proyectos Críticos** ya no reconstruye los proyectos en el frontend mediante una comparación exacta entre el nombre del proyecto de Tickets y el nombre del proyecto de Portafolio.

Ahora consume la misma fuente oficial utilizada por la tabla en pantalla:

```text
GET /api/proyectos-criticos
```

Esto mantiene consistentes entre pantalla y PDF los siguientes valores:

- Proyecto oficial de Portafolio.
- Equipos activos.
- Fallas BLT del período.
- Equipos críticos.
- Filtros de días, fallas mínimas, fallas por equipo, zona y proyecto.

El enriquecimiento de MTBC se conserva sin cambios.

## Alcance

No se modificaron:

- Pantalla de Equipos Críticos.
- Tabla de Proyectos Críticos.
- PDF de Equipos Críticos.
- HTML o CSS.
- Backend o base de datos.

## Validación

Se validó la sintaxis JavaScript con:

```text
node --check equipos-criticos/equipos-criticos.js
```
