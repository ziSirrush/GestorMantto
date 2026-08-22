# FASE 3 - VENTAS - CASOS ESPECIALES V001

## Base

- Repositorio: `ziSirrush/GestorMantto`
- Base publicada revisada: `main` commit `9f3bdd05f525ae2989d9479a27795017ddb9e3f5`
- Aplicar DESPUES de:
  1. `FASE_1_VENTAS_GUARD_GENERAL_V001`
  2. `FASE_2_VENTAS_ALCANCE_INFORMACION_V001`

## Objetivo

Cerrar los casos especiales de la agrupacion Ventas antes del check funcional final:

1. Dashboard Ventas debe consumir el Alcance de Informacion generado por el Guard General.
2. El selector y los PDF no deben decidir alcance mediante la lista rigida historica de roles comerciales.
3. Fotos Mapa debe pertenecer funcionalmente a la puerta `CORELLIAN -> VENTAS`, aunque reutilice datos reales de `ins_fl` e `ins_proyecto_fotos`.
4. Mapa Prospeccion e Historial se conservan sobre la migracion realizada en Fase 1 + Fase 2; no requieren un segundo parche en esta fase.

## Dashboard Ventas

### Antes

- El controller reconstruia el alcance sin propagar `req.informationAccess`.
- El selector se generaba desde una lista fija de roles comerciales.
- `isCommercialUser()` podia volver a descartar un usuario que si estaba autorizado por REPORTA_A / REL_ADMIN / Usuarios adicionales.
- El PDF general volvia a resolver el alcance desde un objeto de usuario minimo y despues cruzaba contra el catalogo rigido de roles.

### Ahora

- `ventas-dashboard.controller.js` propaga `req.informationAccess`.
- El alcance resuelto por el Guard de Fase 1 y priorizado por Fase 2 es la fuente de autorizacion.
- Alcance LIMITED: el selector parte de los IDs exactos de `usuarios_visibles` y conserva solo usuarios activos de Ventas/Corellian, sin lista fija de IDs de rol.
- CORELLIAN completo: el selector usa usuarios activos de Ventas/Corellian, sin lista fija de IDs de rol.
- Los checks de target dejan de usar `isCommercialUser()` como autorizacion adicional; se valida:
  1. que el target este dentro del scope en controller;
  2. que el usuario exista, este activo y pertenezca a Ventas/Corellian en service.
- PDF general usa exactamente los usuarios del scope del request.
- PDF individual sigue requiriendo permiso funcional + target dentro del scope.
- Se agrega el helper `normalize()` que ya era utilizado por la normalizacion del PDF y no estaba definido en el service publicado.

## Fotos Mapa

Se agrega una ruta dedicada de Ventas:

- `GET /api/ventas/fotos-mapa/proyectos`
  - permiso: `VENTAS_FOTOS_MAPA_GALERIA_PROYECTOS_LISTADO.VER`
- `GET /api/ventas/fotos-mapa/proyectos/fotografias`
  - permiso: `VENTAS_FOTOS_MAPA_GALERIA_PROYECTOS_FOTOGRAFIA.VER`

Ambas rutas pasan por:

- dominio `CORELLIAN`
- agrupacion `VENTAS`
- `humanInformationGuard_gnral`

Las rutas reutilizan las lecturas existentes de `ins_fl` / `ins_proyecto_fotos`. Como el request ya contiene `req.informationAccess`, Fase 2 hace que `ventas-visibility.service.js` use ese scope como fuente autoritativa.

El frontend deja de solicitar:

- `/api/ins-fl`
- `/api/ins-fl/proyectos/fotografias`

por lo que un usuario de Fotos Mapa ya no necesita abrir la agrupacion `INSTALACIONES` solo para consultar este modulo de Ventas.

## Mapa Prospeccion e Historial

No se modifican nuevamente en Fase 3:

- Fase 1 corrigio Guard General y permisos funcionales.
- Fase 2 propago `req.informationAccess` a Prospeccion/Mapa e Historial.
- Duplicar otra capa en Fase 3 agregaria logica innecesaria.

## Archivos modificados

- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/routes/index.js`
- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js`

## Archivo nuevo

- `backend/src/modules/ventas-fotos-mapa/ventas-fotos-mapa.routes.js`

## No modificado

- SQL / esquema Aiven
- tablas
- rutas M2M / sync
- Logistica
- Instalaciones como agrupacion
- Cobranza
- Panel de Control
- Mapa Prospeccion (ya cubierto por F1/F2)
- Historial (ya cubierto por F1/F2)

## Validaciones realizadas

- `node --check` en los 5 archivos JS entregados: OK.
- Dashboard propaga `req.informationAccess`: OK.
- Dashboard entregado no contiene `isCommercialUser`: OK.
- Dashboard entregado no contiene constantes de roles comerciales rigidos: OK.
- Fotos Mapa no contiene llamadas frontend a `/api/ins-fl`: OK.
- Nuevos endpoints Fotos Mapa usan puerta `VENTAS`: OK.
- Nuevos endpoints usan permisos existentes `VENTAS_FOTOS_MAPA_*`: OK.
- `backend/src/routes/index.js` monta el nuevo router bajo `/ventas`: OK.
- Sin archivos `APLICAR_*.js`: OK.

## Check funcional

Pendiente intencionalmente. Se realizara al final de las fases de Ventas, de acuerdo con el flujo acordado.

No se declara todavia Ventas congelado ni validado en runtime.
