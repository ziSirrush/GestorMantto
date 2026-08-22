# FIX BACKEND ALCANCE DE INFORMACION V001

## Alcance

Backend para la pestana `Alcance de informacion` ya preparada en Panel de Control.

No modifica filtros operativos de Ventas, Instalaciones, Logistica, United ni otros modulos. Esta fase solamente crea la fuente oficial de configuracion y las rutas GET/PUT que ya consume el frontend.

## Tabla requerida

La tabla `usuarios_alcance_informacion` debe existir previamente en Aiven.

## Rutas

### GET

`GET /api/panel-control/usuarios/:id/alcance-informacion`

Respuesta `data`:

```json
{
  "dominios_completos": ["CORELLIAN"],
  "ver_propio": true,
  "ver_reporta_a": false,
  "ver_rel_admin": false,
  "usuarios_adicionales": [42, 69],
  "id_usuario": 46,
  "usuario": "Roberto Leon",
  "registros_activos": 4
}
```

### PUT

`PUT /api/panel-control/usuarios/:id/alcance-informacion`

Payload:

```json
{
  "dominios_completos": ["CORELLIAN"],
  "ver_propio": true,
  "ver_reporta_a": false,
  "ver_rel_admin": false,
  "usuarios_adicionales": [42, 69]
}
```

El PUT reemplaza de forma transaccional el alcance activo del usuario. Los registros activos previos se desactivan para conservar trazabilidad y la nueva configuracion se inserta con `created_by` y `updated_by`.

## Mapeo a usuarios_alcance_informacion

- `dominios_completos` -> `DOMINIO_COMPLETO`, uno por dominio.
- `ver_propio` -> `USUARIO` con `id_usuario_visible = id_usuario`.
- `ver_reporta_a` -> `REPORTA_A`.
- `ver_rel_admin` -> `REL_ADMIN`.
- `usuarios_adicionales` -> `USUARIO`, uno por usuario visible.

United/Corellian completo NO es obligatorio. Dejar ambos apagados permite configurar un alcance restringido como `propio + reporta_a` sin convertirlo en acceso total.

## Servicio general preparado para filtros futuros

`backend/src/services/information-scope-gnral.service.js`

Exporta:

- `readInformationScope_gnral`
- `replaceInformationScope_gnral`
- `resolveInformationScope_gnral`
- `effectiveUserIdFromContext_gnral`
- `resolveInformationScopeForContext_gnral`
- `hasCompleteDomain_gnral`

`resolveInformationScope_gnral` combina:

1. Usuario propio, si esta activo.
2. Reportes directos por `usuarios.reporta_a`, si esta activo.
3. Asesores de `usuarios_rel_admin` donde el usuario configurado es `id_admin`, si esta activo.
4. Usuarios adicionales explicitos.
5. Dominios completos por separado para que cada modulo pueda decidir si omite el filtro por usuario dentro de United/Corellian.

Esto permite retirar posteriormente los filtros hardcodeados modulo por modulo sin duplicar la logica.

`resolveInformationScopeForContext_gnral` usa `contextUser` antes que `user`, por lo que queda preparado para respetar la identidad efectiva en modo Visor.

## Seguridad

Las rutas requieren `requireAuth`.

Como el alcance es global y puede conceder informacion entre dominios, esta V001 permite administrarlo solamente a:

- `Programador`
- `Director General`

No se habilito a `Programador United` ni `Programador Corellian` porque la tabla no separa `REPORTA_A`, `REL_ADMIN` y usuarios adicionales por dominio. Permitirles editar la configuracion global podria cruzar su alcance de administracion.

## Archivos

- `backend/src/routes/panel-control.routes.js`
- `backend/src/controllers/panel-control-alcance.controller.js`
- `backend/src/services/information-scope-gnral.service.js`

## Validaciones V001

- Sintaxis Node de los tres archivos.
- Contrato GET compatible con el frontend actual.
- Contrato PUT compatible con el frontend actual.
- Guardado transaccional.
- Verificacion de existencia del usuario configurado.
- Verificacion de existencia de usuarios adicionales.
- Validacion de dominios permitidos: UNITED / CORELLIAN.
- Sin cambios en `backend/src/routes/index.js`: `panel-control.routes.js` ya esta montado en `/api/panel-control`.
