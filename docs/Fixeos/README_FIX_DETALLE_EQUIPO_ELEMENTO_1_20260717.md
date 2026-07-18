# Fix Detalle Equipo - Elemento 1

Fecha: 17/07/2026

## Alcance

Se modifica únicamente el Elemento 1 del componente global Detalle Equipo.

## Archivo modificado

- `core/details.js`

## Cambios aplicados

La tabla `Detalle del Equipo` ahora muestra, en este orden:

1. Ciudad
2. Estado
3. Estatus Serv.
4. Zona Op.
5. Dirección
6. Fecha instalación
7. Fecha entrega
8. Término garantía
9. Fecha recepción mantenimiento
10. Mes inicio gratuitos
11. Mes término gratuitos
12. Mes objetivo inicio cobranza
13. Fecha ingreso portafolio
14. Superintendente
15. Supervisor

## Reglas conservadas

- Las fechas usan el formateador existente del componente.
- Los valores vacíos continúan mostrando el comportamiento estándar del detalle.
- No se modifican KPIs, gráficas, Servicios Mensuales, Tickets ni PDF.
- No se modifica backend porque el endpoint actual ya entrega los campos requeridos desde `portafolio`.

## Validación

- `node --check core/details.js`: correcto.
