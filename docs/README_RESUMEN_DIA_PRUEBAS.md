# Resumen del Día - Pruebas v2

Entregable solo para el entorno `Pruebas`.

## Cambios aplicados

1. Se mantiene el Home aprobado, Header estilo Proyecto Final, barra contextual, panel lateral y Nori de pruebas.
2. Se integró el módulo `Resumen del Día` en `modules/resumen-dia/`.
3. El módulo queda preparado para consumir datos reales desde Aiven mediante backend:
   - `GET /api/tickets?limit=5000`
   - fallback `GET /api/tickets`
   - `GET /api/portafolio?limit=5000`
   - fallback `GET /api/portafolio`
4. Se conserva la paginación de tickets en bloques de 30 registros, ordenados del más nuevo al más viejo.
5. Se agregó tabla nueva antes de `Tickets del periodo`:
   - `Equipos con más llamadas del periodo`
   - Top 20
   - Columnas: zona, proyecto, referencia en sitio, llamadas del periodo, Resp. BLT, Resp. Cliente, crítico.
6. Se agregó tabla nueva después de `Tickets del periodo`:
   - `Proyectos con más llamadas del periodo`
   - Top 20
   - Columnas: zona, proyecto, equipos activos, llamadas del periodo, Resp. BLT, Resp. Cliente, equipos críticos.
7. Las filas de equipos y proyectos son clickeables y quedan preparadas para navegar a Portafolio o Proyectos mediante `ManttoRouter.openTarget()`.

## Observaciones

- No se encontró una tabla llamada `Mensajes no leídos` dentro del módulo `Resumen del Día` de esta versión de Pruebas. Por lo tanto, no se eliminó dentro de este módulo.
- Si esa tabla aparece en otra pantalla o en otro archivo del proyecto, debe retirarse cuando integremos Notificaciones.
- Si `/api/portafolio` no está disponible en backend local, el conteo de equipos activos usa fallback por equipos únicos detectados en tickets del periodo.
