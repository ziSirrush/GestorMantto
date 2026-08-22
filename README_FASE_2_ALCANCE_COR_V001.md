# FASE 2 - ALCANCE_COR V001

## Base verificada

Repositorio: `ziSirrush/GestorMantto`  
Rama: `main`  
Commit base revisado: `f03066618a6c329eab8669f2d61a0d5b546e9c4e`

Prerequisito conceptual: Fase 1 `alcance_gnral` V001.

## Objetivo

Crear el motor independiente `alcance_cor` para informacion de agrupaciones con `perm_agrupaciones.empresa = 'CORELLIAN'`.

CORELLIAN se filtra por **personas visibles**, no por Zonas Operativas.

La composicion acordada es:

- usuario efectivo siempre visible;
- usuarios activos que `reporta_a` al usuario efectivo, cuando `REPORTA_A` esta habilitado;
- asesores activos relacionados mediante `usuarios_rel_admin`, cuando `REL_ADMIN` esta habilitado;
- usuarios adicionales configurados mediante el alcance existente.

## Estructura real reutilizada

No se agrega ni modifica ninguna tabla.

Se reutiliza la estructura que el backend actual ya consume:

- `usuarios_alcance_informacion` para `REPORTA_A`, `REL_ADMIN` y `USUARIO`;
- `usuarios.reporta_a` para subordinados directos;
- `usuarios_rel_admin.id_admin -> id_asesor` para relaciones administrativas.

La estructura compartida del proyecto confirma `usuarios.reporta_a` y `usuarios_rel_admin`. La tabla `usuarios_alcance_informacion` se usa actualmente en `information-scope-gnral.service.js`; esta fase no cambia su esquema.

## Archivos incluidos

- `backend/src/services/alcance/alcance-cor.service.js`
- `backend/scripts/test-alcance-cor.js`
- `ADR_ALCANCE_COR_V001.md`
- `README_FASE_2_ALCANCE_COR_V001.md`

## Contrato creado

### `resolveAlcanceCor_cor(executor, source, options)`

Resuelve el usuario efectivo mediante `req.contextUser || req.user`, por lo que mantiene compatibilidad con Viewer.

Devuelve:

- motor y empresa;
- si existe bypass por llave maestra ya validada;
- usuarios automaticos;
- usuarios adicionales;
- usuarios visibles;
- si el modulo debe aplicar filtro por usuario.

### `buildUserColumnsScopeSql_cor(...)`

Helper asincrono para que cada modulo CORELLIAN mapee sus columnas reales de responsabilidad al conjunto de usuarios visibles.

No supone que todos los modulos usan `created_by`.

### `buildInsFlScopeSql_cor(...)`

Builder especifico preparado para la estructura ya conocida de Instalaciones FL:

- `id_asesor`;
- `id_sup`;
- `id_admin`.

Los demas modulos se mapearan con sus columnas reales durante su migracion; no se inventan campos universales.

## Llaves maestras

El motor **no detecta roles ni llaves maestras por su cuenta**.

Admite `{ masterAccess: true }` exclusivamente cuando una capa superior ya valido la llave maestra correspondiente a CORELLIAN.

Con esa bandera:

- no consulta configuracion de personas;
- `usuarios_visibles = null`;
- `requiere_filtro_usuario = false`;
- los builders devuelven `1 = 1`.

Esto conserva la arquitectura acordada y evita duplicar la logica de permisos.

## Seguridad

- El usuario propio siempre forma parte del conjunto normal.
- `REPORTA_A` y `REL_ADMIN` solo incorporan usuarios activos, igual que la logica actual.
- IDs duplicados se eliminan.
- Columnas y aliases SQL se validan antes de construir filtros.
- Si un builder recibe un contexto invalido, falla cerrado mediante error de configuracion.
- No se toca M2M/Sync.

## Historial de Chats

Esta fase no cambia Chats. Se conserva la regla acordada: el alcance decide si el usuario puede entrar al hilo; una vez autorizado, el historial del hilo se mantiene completo con los mensajes de todos los participantes. No se filtran mensajes historicos por participante.

## Alcance deliberadamente NO incluido

Todavia no se modifica:

- Guard actual;
- rutas/controladores de modulos;
- Panel de Control;
- frontend;
- Aiven;
- `alcance_uni`;
- seleccion automatica por `perm_agrupaciones.empresa`;
- capa de informacion cruzada.

Por lo tanto, aplicar solo esta Fase 2 no cambia el comportamiento productivo de los modulos.

## Validaciones realizadas

- `node --check backend/src/services/alcance/alcance-cor.service.js`
- `node --check backend/scripts/test-alcance-cor.js`
- `node backend/scripts/test-alcance-cor.js`

Resultado esperado: `ALCANCE_COR_V001: OK`.
