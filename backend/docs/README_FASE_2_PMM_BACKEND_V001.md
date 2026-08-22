# FASE 2 — PM&M Backend V001

Fecha: 2026-08-19
Proyecto: Mantto Gestor

## Alcance

Backend exclusivo para PM&M. No incluye frontend ni cambios SQL.

## Endpoints

- `GET /api/instalaciones/pmm/03-pm?page=1`
  - Permiso: `INSTALACIONES_PMM_TABLA_03_PM_LISTADO.VER`
  - Devuelve únicamente equipos activos del Reporte de Instalaciones con estatus `03-PM`.
  - Campos: Sup, %OC, Posible Recepción de Cubo, Proyecto, Referencia en sitio, Comentario y estados visuales.

- `GET /api/instalaciones/pmm/04-m?page=1`
  - Permiso: `INSTALACIONES_PMM_TABLA_04_M_LISTADO.VER`
  - Devuelve únicamente equipos activos del Reporte de Instalaciones con estatus `04-M`.
  - Campos: Sup, %MO, Proyecto, Referencia en sitio, CCR, Subcontratista, Inicio montaje, Fin montaje planeado, Fin montaje modificado, Fin montaje real, Días restantes, Comentarios y estados visuales.

## Reglas

- Paginación fija: 30 registros por página en ambas tablas.
- PM&M no duplica las reglas de alertas. Consume `instalaciones-reporte.service.getReport()` con el estatus forzado, por lo que usa exactamente `estados_visuales_codigos` y el catálogo visual del Reporte de Instalaciones.
- Se agregó `fecha_fin_montaje_real` al SELECT del Reporte de Instalaciones porque la columna ya existe en `ins_fl` y PM&M la requiere. No cambia ninguna regla del Reporte ni su salida existente; únicamente agrega ese campo al payload.
- Fuente: Aiven / tabla `ins_fl`.
- No se crean tablas ni columnas.

## Archivos modificados / nuevos

- `backend/src/modules/instalaciones-reporte/instalaciones-reporte.repository.js`
- `backend/src/routes/index.js`
- `backend/src/modules/instalaciones-pmm/instalaciones-pmm.service.js`
- `backend/src/modules/instalaciones-pmm/instalaciones-pmm.controller.js`
- `backend/src/modules/instalaciones-pmm/instalaciones-pmm.routes.js`
- `backend/docs/README_FASE_2_PMM_BACKEND_V001.md`

## Validaciones

- Sintaxis Node.js de archivos modificados/nuevos.
- `npm run check` del backend.
- Prueba aislada de servicio con mock del Reporte para verificar:
  - estatus forzado por endpoint;
  - `limit=30`;
  - offset derivado de `page`;
  - mapeo de columnas 03-PM y 04-M;
  - conservación de `estados_visuales_codigos`.
