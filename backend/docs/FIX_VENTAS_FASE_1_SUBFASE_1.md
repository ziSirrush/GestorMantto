# FIX Ventas - Fase 1 / Subfase 1

## Alcance

Se agregó el CRUD unitario base para `ventas_cotizaciones_cor`, sin modificar módulos ajenos ni eliminar el endpoint de sincronización existente.

## Archivos modificados

- `src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
- `src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`

## Archivo agregado

- `docs/FIX_VENTAS_FASE_1_SUBFASE_1.md`

## Endpoints agregados

Todos requieren sesión JWT válida:

- `GET /api/ventas/cotizaciones/:id`
- `POST /api/ventas/cotizaciones`
- `PUT /api/ventas/cotizaciones/:id`
- `DELETE /api/ventas/cotizaciones/:id`

Se conserva:

- `POST /api/ventas/cotizaciones/sync`

## Reglas implementadas

- Creación con auditoría `created_by` y `updated_by` tomada de la sesión.
- Edición parcial de campos permitidos.
- Validación de `nombre_proyecto`, `cliente`, correo, enteros y usuarios relacionados.
- Conflicto HTTP 409 cuando `id_cot_origen` ya existe.
- Eliminación lógica mediante `activo = 0`.
- Respuestas 400, 401, 404 y 409 según corresponda.
- Transacciones para crear, editar y desactivar.

## Validaciones realizadas

- Validación sintáctica de los cuatro archivos JavaScript.
- Validación de carga de rutas y consistencia de nombres exportados.
- Ejecución del validador estructural existente del backend.
- Confirmación de que `/api/health` y el registro global de `/api/ventas` no fueron modificados.

## Fuera de alcance

- Listado paginado, búsqueda y filtros: Subfase 2.
- Permisos granulares y catálogos: Subfase 3.
- KPIs: Subfase 4.
