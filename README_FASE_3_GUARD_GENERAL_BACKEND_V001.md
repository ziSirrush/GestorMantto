# FASE 3 - Guard General backend V001

Base verificada: `dfe19feaf4c6679d8ea800c4473e26678ba0861d` (`Implementacion de Norma 081926.5 - Alcance de Informacion`).

## Alcance de esta fase

Se agrega una sola pieza ejecutable nueva:

- `backend/src/middleware/information-access-gnral.middleware.js`

No se modifica ninguna ruta ni modulo operativo en esta fase. Por tanto, desplegar este archivo por si solo no cambia el comportamiento actual de Tickets, Portafolio, Ventas, Instalaciones, PM&M, etc. La conexion ruta por ruta corresponde a Fase 4.

## Flujo implementado

```text
requireAuth
  -> usuario efectivo (req.contextUser || req.user)
  -> permiso funcional efectivo (hasEffectivePermission)
  -> dominio/agrupacion real de perm_agrupaciones
  -> resolveInformationScopeForContext_gnral
  -> Acceso General
  -> contexto autorizado en req.informationAccess
  -> controlador/repositorio
```

El Guard usa directamente el resolver moderno. No usa fallback LEGACY ni `INFORMATION_SCOPE_FALLBACK_ON_ERROR`. Si la validacion tecnica falla, la ruta protegida falla cerrada.

## Contrato para Fase 4

### Ruta que todavia no tiene requireAuth

```js
const {
  humanInformationGuard_gnral
} = require('../middleware/information-access-gnral.middleware');

router.get(
  '/ruta',
  ...humanInformationGuard_gnral({
    permissionCode: '<CODIGO_PERMISO_REAL>',
    domain: 'UNITED',
    groupingCode: '<CODIGO_AGRUPACION_REAL>'
  }),
  controller
);
```

### Ruta que ya tiene requireAuth

Para no autenticar dos veces:

```js
const { requireAuth } = require('../middleware/auth.middleware');
const {
  buildInformationAccessGuard_gnral
} = require('../middleware/information-access-gnral.middleware');

router.get(
  '/ruta',
  requireAuth,
  buildInformationAccessGuard_gnral({
    permissionCode: '<CODIGO_PERMISO_REAL>',
    domain: 'CORELLIAN',
    groupingCode: '<CODIGO_AGRUPACION_REAL>'
  }),
  controller
);
```

Los codigos reales se deben tomar del catalogo de permisos/agrupaciones en cada migracion de Fase 4. Esta Fase 3 no inventa codigos.

## Contexto entregado al controlador

Cuando la solicitud es autorizada, queda disponible:

```js
req.informationAccess = {
  actor_user_id,
  effective_user_id,
  permission_code,
  dominio,
  agrupacion,
  acceso_dominio_completo,
  requiere_filtro_usuario,
  usuarios_visibles,
  usuarios_automaticos,
  usuarios_adicionales,
  alcance
};
```

Regla importante:

- `acceso_dominio_completo === true`: `usuarios_visibles` es `null`; el dominio completo no aplica filtro individual de usuario.
- `requiere_filtro_usuario === true`: el repositorio debe limitar su consulta a los IDs de `usuarios_visibles` usando la columna de relacion correcta del modulo.
- El Guard no construye SQL generico porque la columna que relaciona un registro con un usuario cambia entre modulos. Esa parte se implementa de forma explicita en Fase 4.

Helpers incluidos:

- `informationAccessRequiresUserFilter_gnral(req)`
- `informationAccessVisibleUserIds_gnral(req)`
- `informationAccessAllowsUser_gnral(req, idUsuario)`

Para un detalle individual fuera de alcance, Fase 4 debe usar `informationAccessAllowsUser_gnral` sobre la relacion real del registro y responder 404, evitando revelar su existencia.

## Visor de usuarios

El permiso y el alcance se calculan con el usuario efectivo (`req.contextUser || req.user`). `req.actorUser` se conserva solamente para identidad real/auditoria.

Si existe `req.viewerContext.active`, el Guard bloquea cualquier metodo distinto de GET/HEAD/OPTIONS con `VIEWER_READ_ONLY`.

## M2M / integraciones

Este Guard es para rutas humanas. No debe montarse sobre sincronizaciones, webhooks internos ni rutas protegidas por `integration-auth.middleware.js`.

## General / informacion personal

Home, Tareas, Interacciones, Notificaciones, Mis Solicitudes y Mi Perfil no se convierten a acceso de empresa mediante este Guard. Conservan sus reglas propias de usuario actual/participacion.

## Respuestas de seguridad

- `401 EFFECTIVE_USER_REQUIRED`: no existe usuario efectivo autenticado.
- `403 FUNCTIONAL_PERMISSION_DENIED`: falta permiso funcional.
- `403 INFORMATION_ACCESS_DENIED`: permiso funcional presente, pero Acceso General no autoriza dominio/agrupacion.
- `403 VIEWER_READ_ONLY`: intento de escritura desde Visor.
- `500 INFORMATION_GUARD_CONFIGURATION_ERROR`: la ruta fue configurada con dominio/agrupacion invalida.
- `503 INFORMATION_SCOPE_UNAVAILABLE`: no fue posible validar alcance; no se abre fallback.

## Validaciones realizadas

- `node --check backend/src/middleware/information-access-gnral.middleware.js`
- verificacion estatica de imports contra la base `dfe19fe`
- verificacion de que el Guard usa `hasEffectivePermission`
- verificacion de usuario efectivo `req.contextUser || req.user`
- verificacion de validacion dominio + agrupacion
- verificacion de fail-closed sin fallback LEGACY
- verificacion de helper de filtro: dominio completo devuelve `null`; alcance restringido devuelve IDs

## Archivos no tocados

No se modifican:

- `backend/src/routes/*`
- `backend/src/controllers/*`
- `backend/src/services/information-scope-gnral.service.js`
- `backend/src/services/permissions/effective-permission.service.js`
- frontend
- SQL / tablas
- modulos operativos
