# FIX Dashboard Instalaciones · Documentación en Modo Junta V001

Fecha: 2026-08-19
Estado: Pruebas
Base: `Contexto.zip` + `FIX_SESION_HOME_REFRESH_CIERRE_PREMATURO_V001`

## Objetivo

Llevar al `Dashboard > Modo Junta` la tabla de `Instalaciones > Documentación Pendiente` y su `% Cumplimiento`, actualizándolos con el/los supervisores seleccionados en el Dashboard.

## Comportamiento

- La nueva sección `Documentación Pendiente` aparece únicamente en `Modo Junta`.
- Usa el universo de supervisores seleccionado en el Dashboard.
- Si se selecciona un supervisor, porcentaje y tabla corresponden a ese supervisor.
- Si se seleccionan varios supervisores, porcentaje y tabla se consolidan para ese conjunto.
- AFL por sí solo no sustituye a un supervisor para esta tabla; se requiere al menos un supervisor regular seleccionado.
- La tabla conserva las columnas documentales del módulo original: CPVP, CCNR, CCR, Cond. Obra, CTI, Rev. Sup, Eval. Montaje, Minuta Interfon, Cert. Regulador, Req., Gen., Pend. y %.
- Se conserva paginación de 30 registros.
- Proyecto y Equipo reutilizan la navegación de detalle ya existente cuando el usuario tiene permiso de abrir detalle.

## Regla de cálculo reutilizada

No se creó una segunda fórmula documental. El Dashboard reutiliza `instalaciones-documentacion.repository.js`:

- Estatus incluidos: `04-M`, `05-PA`, `06-A`, `07-PE`.
- `04-M`: 6 documentos requeridos.
- `05-PA`, `06-A`, `07-PE`: 9 documentos requeridos.
- `% Cumplimiento = documentos generados para progreso / documentos requeridos * 100`.
- Los documentos generados para progreso se limitan al total requerido del equipo, igual que en Documentación Pendiente.

## Permisos

No se agregaron tablas, registros ni permisos nuevos.
La visualización dentro del Dashboard reutiliza el permiso existente:

`INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.VER`

La apertura de Proyecto/Equipo reutiliza:

`INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.ABRIR_DETALLE`

## Archivos del FIX actual

Cambios propios de este FIX:

- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.service.js`
- `backend/src/modules/instalaciones-documentacion/instalaciones-documentacion.repository.js`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.html`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.css`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.js`
- `index.html` (cache-bust del Dashboard y conservación del cache-bust de sesión)

Cambios acumulativos conservados del FIX anterior de sesión:

- `core/auth.js`
- `modules/home/home.js`
- `index.html`

## Validaciones realizadas

- `node --check modules/instalaciones-dashboard/instalaciones-dashboard_cor.js` → OK.
- `node --check backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.service.js` → OK.
- `node --check backend/src/modules/instalaciones-documentacion/instalaciones-documentacion.repository.js` → OK.
- `node --check core/auth.js` → OK.
- `node --check modules/home/home.js` → OK.
- `npm run check` en backend → OK.
- Prueba aislada de servicio: Modo Junta + supervisores múltiples → porcentaje, filas y scope documental → OK.
- IDs HTML de la nueva sección vs referencias JS → OK, sin IDs duplicados.
- `core/auth.js` y `modules/home/home.js` comparados contra el FIX anterior de sesión → idénticos.

## Deploy

Este FIX sí requiere desplegar:

1. Backend, por los cambios de lectura/reutilización de Documentación Pendiente.
2. Frontend, por la nueva sección del Dashboard y cache-bust.

No requiere SQL.
