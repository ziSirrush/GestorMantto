# CHANGELOG - Equipos Críticos Pruebas V0.3

## Agregado

- Nuevo módulo frontend `pruebas/modules/equipos-criticos/`.
- Nueva vista `view-criticos` en `pruebas/index.html`.
- Nueva integración de router para abrir Equipos Críticos.
- Nuevos endpoints backend:
  - `GET /api/equipos-criticos`
  - `GET /api/equipos-criticos/:codigo/tickets`
  - `GET /api/proyectos-criticos`
  - `GET /api/proyectos-criticos/:proyecto/tickets`

## Respetado

- No se modificó `pruebas/modules/resumen-dia/`.
- No se movieron variables ni funciones internas de Resumen del Día.
- Criterios de Equipos Críticos y Proyectos Críticos son independientes.

## Pendiente por validar

- Datos reales en Aiven.
- Exactitud de criterio BLT contra valores reales de `tickets.responsabilidad`.
- Diseño visual y orden de columnas.
- Validar descarga PDF en navegador objetivo. Si CDN falla, se usa CSV de respaldo.
