# FIX INSTALACIONES REPORTE LLAVE MAESTRA V001

Fecha: 2026-08-20
Repositorio: `ziSirrush/GestorMantto`
Base: `main`
Archivo base verificado: `backend/src/modules/instalaciones-reporte/instalaciones-reporte.service.js`
Git blob base: `07266abdc52e8bcb2568b06ce7a1be84ec349ac1`

## Causa

El controlador de Reporte de Instalaciones entrega `req.informationAccess` al servicio, pero `getReport()` no recibía ese segundo argumento y las consultas del repository se ejecutaban sin contexto de alcance.

El repository aplica fail-closed cuando no recibe alcance (`1 = 0`), por lo que el reporte regresaba cero registros incluso para un usuario con acceso completo CORELLIAN / llave maestra válida.

## Cambio

Solo se modificó:

- `backend/src/modules/instalaciones-reporte/instalaciones-reporte.service.js`

Cambios funcionales:

1. `getReport(query)` ahora recibe `getReport(query, informationAccess)`.
2. Se propaga `informationAccess` a:
   - `repository.getDeliveredYears(informationAccess)`
   - `repository.listReportRows(filters, deliveredYear, informationAccess)`
   - `repository.countReportRowsByStatus(filters, deliveredYear, informationAccess)`
   - `repository.getFilterOptions(deliveredYear, informationAccess)`
3. `getRulesDate()` y `getVisualStates()` permanecen sin alcance porque no consultan población de usuarios/proyectos.

## No modificado

- Sin SQL.
- Sin cambios de tablas.
- Sin cambios en rutas.
- Sin cambios en Guard General.
- Sin cambios en permisos efectivos.
- Sin cambios frontend.
- Sin cambios en otros módulos de Instalaciones.

## Validaciones

- Se reconstruyó el archivo original revirtiendo únicamente las cinco sustituciones del FIX y su Git blob coincide exactamente con el blob de `main`: `07266abdc52e8bcb2568b06ce7a1be84ec349ac1`.
- `node --check` sobre el archivo modificado: OK.
- Prueba aislada del servicio con repository simulado: OK (`INSTALACIONES_REPORTE_SCOPE_PROPAGATION: OK`).
- La prueba confirmó que el mismo objeto `informationAccess` llega a las cuatro consultas poblacionales del repository.

## Validación runtime pendiente

No puedo confirmar el resultado contra Aiven hasta desplegar el backend. Después del deploy validar:

1. `/api/health` responde OK.
2. Usuario con permiso funcional de Reporte + `DOMINIO_COMPLETO CORELLIAN` visualiza el reporte completo.
3. Usuario sin dominio completo conserva el filtro por alcance de personas.
4. Usuario sin permiso funcional continúa recibiendo 403.
