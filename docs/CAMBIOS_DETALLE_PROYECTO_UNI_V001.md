# Detalle Proyecto United V001

## Cambios
- Detalle general reducido a: Ciudad, Estado, Estatus de servicio, Zona Op, Dirección, Fecha instalación, Fecha ingreso Portafolio, Superintendente y Supervisor.
- Indicadores de Total de equipos y Parados sobre la tabla de equipos.
- El indicador Parados filtra la tabla; al pulsarlo nuevamente se restaura la lista completa.
- Se conservan las tablas de Equipos y Tickets, sus enlaces y estados visuales.
- El backend amplía el resumen del proyecto con los campos requeridos, sin crear rutas nuevas.

## Archivos modificados
- core/details.js
- backend/src/controllers/data.controller.js
- index.html

## Validaciones
- Sintaxis JavaScript frontend y backend.
- Ruta existente `/api/proyectos/detalle/:proyecto`.
- Nombres de campos consistentes con `portafolio`.
- Sin cambios en otros módulos.
