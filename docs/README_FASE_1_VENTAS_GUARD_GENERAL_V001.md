# FASE 1 - Ventas: Guard General y permisos funcionales

Base verificada: `main` commit `9f3bdd05f525ae2989d9479a27795017ddb9e3f5`.

## Objetivo
Unificar las rutas humanas pendientes de la agrupación Ventas bajo la norma:

`Permiso funcional efectivo + CORELLIAN + puerta VENTAS`

usando `humanInformationGuard_gnral` / `dynamicHumanInformationGuard_gnral`.

## Archivos modificados
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `backend/src/modules/ventas-clientes-contactos/ventas-clientes-contactos.routes.js`
- `backend/src/modules/ventas-cotizaciones-historial/ventas-cotizaciones-historial.routes.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.routes.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.routes.js`

## Cambios
- Cotizaciones deja el middleware funcional histórico en rutas humanas y usa Guard General.
- Vendidos, Perdidos y Proyección usan sus permisos propios en sus endpoints.
- El detalle estandarizado de Cotización admite los permisos `ABRIR_DETALLE` de los módulos que realmente lo reutilizan.
- Contactos de Cliente usan permisos reales de ver detalle, crear, editar y desactivar contacto.
- Historial de Cotizaciones queda detrás del permiso real `VENTAS_PROYECCION...VER_HISTORIAL` y la puerta VENTAS.
- Dashboard Ventas pasa por Guard General; selector, KPI, tablas y PDFs usan permisos funcionales del catálogo.
- Mapa Prospección deja de usar el permiso del listado de Prospección para consultar marcadores y usa sus permisos propios.
- El detalle de Prospección admite apertura desde Mapa Prospección y Dashboard mediante sus permisos `ABRIR_DETALLE` existentes.

## No incluido en esta fase
- No cambia consultas SQL ni repositories.
- No sustituye todavía `ventasVisibility` por `req.informationAccess.usuarios_visibles`; eso corresponde a Fase 2.
- No corrige todavía el catálogo rígido de roles comerciales del Dashboard; corresponde a Fase 3.
- No modifica Fotos Mapa / cruce con Instalaciones; corresponde a Fase 3.
- No modifica frontend.
- No incluye SQL.

## Validación realizada
- `node --check` sobre los cinco routers modificados.
- Revisión estática: todas las rutas humanas modificadas resuelven `CORELLIAN` + agrupación `VENTAS`.
- No se modificaron endpoints de integración/sync.
- Los códigos de permiso usados provienen del catálogo ya declarado en `ventas-cotizaciones-permissions.middleware.js`; no se inventaron códigos nuevos.
