# Backend Historial de Cotizaciones V001

## Objetivo
Preparar la backend para que Dirección pueda consumir una bitácora comercial real y verificable sin depender únicamente de los campos sobrescritos en `ventas_cotizaciones_cor`.

## Tabla utilizada
Se utiliza la tabla ya definida por Desarrollo en:

`backend/sql/20260728_VENTAS_COTIZACIONES_FASE_3.sql`

No se crea una segunda tabla y no se agregan credenciales, claves, tokens ni variables de entorno.

## Escritura automática
El historial se registra dentro de la misma transacción de:

- creación de cotización;
- edición;
- cambio de estatus;
- cierre perdido;
- cierre vendido;
- reactivación;
- cambio de asignación;
- desactivación lógica.

No existe endpoint POST público para insertar historial manualmente.

## Consulta
- `GET /api/ventas/cotizaciones/historial`
- `GET /api/ventas/cotizaciones/:id/historial`

Ambas rutas respetan el alcance comercial resuelto por `ventas-visibility.service`.

## Filtros globales
`accion`, `id_cotizacion`, `buscar`, `desde`, `hasta`, `page`, `page_size`.

## Requisito de base de datos
Confirmar que fue ejecutado previamente:

`backend/sql/20260728_VENTAS_COTIZACIONES_FASE_3.sql`
