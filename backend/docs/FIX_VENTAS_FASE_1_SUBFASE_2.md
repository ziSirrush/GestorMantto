# Ventas - Fase 1 / Subfase 2

## Objetivo
Agregar el listado operativo de cotizaciones sin modificar el CRUD aprobado en la Subfase 1 ni otros módulos.

## Endpoint agregado

`GET /api/ventas/cotizaciones`

Requiere autenticación JWT.

## Parámetros admitidos

- Paginación: `page`, `pageSize` (máximo 100).
- Búsqueda global: `buscar` (también acepta `search` o `q`).
- Ordenamiento: `sortBy`, `sortDirection=asc|desc`.
- Filtros combinables: `estatus_proyecto`, `asesor`, `id_asesor`, `admin`, `id_admin`, `zona`, `estado`, `ciudad`, `tipo_proyecto`, `tipo_equipos`, `anio_mes_cotizacion`, `anio_actual`, `mx`, `activo`.
- Por defecto solo devuelve registros con `activo=1`. Para consultar ambos estados usar `activo=todos`.

## Respuesta
Incluye arreglo `cotizaciones`, metadatos de paginación, orden aplicado y filtros normalizados.

## Archivos modificados
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`

## Validaciones realizadas
- Sintaxis de los cuatro archivos JavaScript con `node --check`.
- Validación estructural del backend con `npm run check`.
- Confirmación de que la ruta de listado se declara antes de `/:id`.
- Ordenamiento limitado a una lista blanca de columnas.
- Consultas parametrizadas para búsqueda, filtros, límite y desplazamiento.

## Alcance pendiente
No incluye catálogos, permisos granulares ni KPIs; corresponden a las Subfases 3 y 4.
