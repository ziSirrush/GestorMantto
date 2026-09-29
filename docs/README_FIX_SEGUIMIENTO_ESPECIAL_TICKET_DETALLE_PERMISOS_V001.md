# FIX Seguimiento Especial · Ticket Detalle · Permisos V001

## Objetivo
Corregir el caso observado en `GITHUB_PAGES · Version 092926.1 · 30ffa97` donde el Detalle de Ticket cargaba normalmente pero no aparecía la tarjeta `Seguimiento Especial`.

## Causa confirmada en código
`modules/seguimiento-especial/seguimiento-especial-global.js` ejecutaba:

```js
if(!targetKey||!canManage()||!isManttoTarget(payload))return;
```

Por lo tanto, el control desaparecía antes de ejecutar el GET si la facultad local `GESTIONAR_SEGUIMIENTO` no estaba efectiva o todavía no había terminado de cargar.

El backend ya tenía el contrato correcto:
- GET: lectura con `ACCESO_VISUAL` o `GESTIONAR_SEGUIMIENTO`;
- PUT: modificación solo con `GESTIONAR_SEGUIMIENTO`.

## Corrección
1. Se elimina `canManage()` como puerta previa del montaje.
2. El GET exacto del detalle se usa como autoridad de lectura.
3. Un usuario con lectura pero sin gestión ve el control en modo `Solo lectura`.
4. Un estado de gestión todavía desconocido no bloquea anticipadamente el PUT; el backend lo decide.
5. Un 403 de PUT revierte el estado y deja el control en `Solo lectura`.
6. Se recupera el montaje cuando el acceso se confirma después de abrir el Detalle.
7. MutationObserver ya no exige permiso de gestión para recuperar el control.
8. Se actualiza el cache-bust de `seguimiento-especial-global.js` en `core/module-loader.js`.

## Archivos productivos modificados
- `modules/seguimiento-especial/seguimiento-especial-global.js`
- `core/module-loader.js`

## Validaciones actualizadas
- `validation/seguimiento-especial-ticket-fase3-frontend-detalle.test.js`
- `validation/seguimiento-especial-ticket-fase4-listado-frontend.test.js`
- `validation/seguimiento-especial-notificaciones.test.js`

No se modifica `backend/package.json`: estas pruebas ya están registradas en la suite oficial.

## Comportamiento esperado
### Con gestión efectiva
El Detalle muestra:

`Seguimiento Especial · Activo/Inactivo` con switch editable.

### Con lectura pero sin gestión
El Detalle muestra la misma tarjeta, pero:

`Activo/Inactivo · Solo lectura`

El switch permanece visible y deshabilitado.

### Permisos todavía cargando
No se oculta el componente preventivamente. Si se intenta cambiar el estado antes de que el frontend tenga el permiso local, el PUT queda sujeto al guard real del backend.

### Modo Visor
Se mantiene bloqueado porque Seguimiento Especial es estado personal del usuario actor.

## No incluido
- SQL.
- Cambios de roles/permisos en Aiven.
- Cambios al endpoint GET/PUT.
- Cambios al motor de notificaciones.
- Cambios a `seguimiento_especial` o `portafolio_interes`.
- Deploy automático.

## Cache
El archivo global lleva un nuevo cache-bust dentro de `core/module-loader.js`:

`20260929-fix-seguimiento-ticket-detalle-permisos-v001`

El `index.html` no se reemplaza en este FIX para no sobrescribir cambios concurrentes del shell. Después de publicar el commit se recomienda una recarga forzada (`Ctrl+F5`) en la primera comprobación.

## Validación ejecutada
- `node --check` de todos los JS modificados: PASS.
- Pruebas dirigidas Fase 3 + Fase 4: 36/36 PASS.
- Caso runtime lectura sin gestión: PASS; el control existe y el checkbox queda deshabilitado.
- Caso runtime permiso de gestión aún no cargado: PASS; el PUT llega al backend.
- Baseline de todos los archivos verificado contra Git blob del commit `30ffa97` antes de modificar.

## Verificación real pendiente
No puedo confirmar el comportamiento con la sesión real del usuario ni el estado efectivo de sus permisos en Aiven hasta aplicar el FIX y probarlo en el entorno desplegado.
