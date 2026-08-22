# FASE 1 - ALCANCE_GNRAL V001

## Base verificada

Repositorio: `ziSirrush/GestorMantto`  
Rama: `main`  
Commit base revisado: `f03066618a6c329eab8669f2d61a0d5b546e9c4e`

## Objetivo

Crear el motor base `alcance_gnral` para agrupaciones con `perm_agrupaciones.empresa = 'GENERAL'`.

La regla es directa y no configurable por jerarquia:

- creado por el usuario efectivo;
- asignado al usuario efectivo;
- relacionado/participante con el usuario efectivo cuando la tabla real lo represente.

No utiliza:

- `REPORTA_A`;
- `REL_ADMIN`;
- usuarios adicionales de CORELLIAN;
- Zonas Operativas de UNITED.

## Archivos incluidos

- `backend/src/services/alcance/alcance-gnral.service.js`
- `backend/scripts/test-alcance-gnral.js`
- `ADR_ALCANCE_POR_EMPRESA_V001.md`
- `README_FASE_1_ALCANCE_GNRAL_V001.md`

## Contrato creado

`resolveAlcanceGnral_gnral(source, options)`

- usa `req.contextUser || req.user` para respetar la identidad efectiva del Viewer;
- devuelve el motor, empresa, identidad efectiva y reglas activas;
- no consulta ni modifica Aiven.

`buildPendientesScopeSql_gnral(source, alias, options)`

Reproduce la estructura real ya existente:

- PERSONAL -> `pendientes.creado_por_email`;
- COLABORATIVA -> creador o relacion en `pendientes_usuarios.iniciales_usuario`.

`buildSupportTicketScopeSql_gnral(source, alias, options)`

Usa las columnas reales de `sup_tickets`:

- `id_usuario` = creador;
- `id_soporte` = usuario asignado.

`buildUserIdScopeSql_gnral(source, column, options)`

Helper para tablas cuyo registro pertenece directamente a un usuario mediante una FK/ID, por ejemplo notificaciones o interacciones personales cuando se migren.

## Llaves maestras

La Fase 1 NO detecta roles ni llaves maestras por su cuenta.

Los builders admiten `{ masterAccess: true }`, pero esa bandera debe venir exclusivamente de la capa superior despues de validar una llave maestra real. Con `masterAccess: true` el filtro devuelve `1 = 1`.

Esto evita crear una segunda logica de permisos o hardcodear roles dentro del motor GENERAL.

## Seguridad

- Si falta identidad suficiente para un filtro, devuelve `1 = 0` (fail closed).
- Los aliases/columnas SQL se validan antes de incorporarlos al SQL.
- No se agregan tablas ni columnas.
- No se modifica ningun modulo actual.
- No se toca M2M/Sync.

## Alcance deliberadamente NO incluido

Esta fase no conecta todavia el motor a rutas humanas. La seleccion automatica por `perm_agrupaciones.empresa`, el Guard unificado, la capa de informacion cruzada y el Panel de Control corresponden a fases posteriores.

Tampoco cambia la logica actual de cola de Soporte. Al migrar Soporte se debera conservar cualquier acceso administrativo/llave maestra existente mediante la capa superior, sin hardcodearlo en `alcance_gnral`.

## Validaciones realizadas

- `node --check backend/src/services/alcance/alcance-gnral.service.js`
- `node --check backend/scripts/test-alcance-gnral.js`
- `node backend/scripts/test-alcance-gnral.js`

Resultado esperado de la prueba: `ALCANCE_GNRAL_V001: OK`.
