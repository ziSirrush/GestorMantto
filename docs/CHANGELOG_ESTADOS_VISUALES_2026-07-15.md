# Fix — Estados visuales centralizados

Fecha: 2026-07-15

## Cambios

- Se agregó `GET /api/estados-visuales` para consultar el catálogo activo de `estados_visuales`.
- Se agregó `core/estados-visuales.js` con funciones generales `EstadosVisuales_gnral`.
- El servicio admite uno o varios códigos por equipo/proyecto y respeta la prioridad configurada en BD.
- Resumen del Día y Dashboard Call Center conservan sus reglas de negocio, pero obtienen emoji, nombre, icono y colores desde el catálogo.
- Un equipo o proyecto puede mostrar simultáneamente CRITICO, ATRAPADO, FILTRACION, VOLTAJE, NO_FUNCIONANDO y FUERA_SLA.
- Se mantienen valores de respaldo para que una falla temporal del catálogo no rompa las vistas.

## Regla

Las funciones del módulo deciden qué códigos aplican. La tabla `estados_visuales` decide cómo se representan.
