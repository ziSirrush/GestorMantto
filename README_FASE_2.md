# BLT NOW | Cobranza UNI / Administración | FASE 2/6 - V001

**Origen revisado:** `ziSirrush/GestorMantto`, rama `main`, commit `6889a51a770c70f16c9baf2fbe122c26359e0dc4` (Version 102226.1).

## Estado

**ENTREGA PARCIAL: backend y Main preparados, integración del cascarón de BLT NOW pendiente.**
Para cumplir la norma de archivos completos, no se incluyen supuestas versiones completas de `index.html`, `core/router.js` o `core/module-loader.js`; NO sustituyas esos archivos por fragmentos. La integración en ellos debe hacerse sobre la última versión que tengas en local, con revisión de diferencias. Este ZIP no incluye instaladores, .patch ni scripts de reemplazo.

## Alcance de fase 2

- Main selector aislado para `gestion_credito`, `pc`, `detalle_mp_2026`.
- Permisos separados: 1 acceso a Administración + VER y EDITAR por tabla (7 permisos diferentes); el backend exige el permiso principal, la puerta UNITED/COBRANZA_UNI y el de cada tabla.
- Backend `GET /api/cobranza-uni/administracion/contrato` y `GET /api/cobranza-uni/administracion/tablas/:tabla/acceso`. No existen endpoints de edición en esta fase.
- Catálogo SQL idempotente para aplicación MANUAL y autorizada (no ejecutado), sin asignaciones automáticas de roles ni usuarios.
- Edición tipo Excel, datos reales, guardados, auditoría y cálculos automáticos NO implementados: fases 3–6.

## Archivos completos en el ZIP

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants.js` (Fase 1, idéntico)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.permissions.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js`
- `backend/src/routes/cobranza-uni.routes.js` (sustitución completa con montaje nuevo, sin alterar `/sync`)
- `modules/cobranza-uni/administracion/main/main.js` y `main.css` (versiones completas actualizadas de Fase 1)
- `modules/cobranza-uni/administracion/admin-menu.js`
- `database/migrations/20261023_cobranza_uni_administracion_fase2_permisos.sql` (NO aplicar sin autorización)
- `tests/cobranza-uni-administracion-fase1.test.js` (adaptado al nuevo Main)
- `tests/cobranza-uni-administracion-fase2.test.js`

## Integración del cascarón pendiente (NO ejecutada)

Se requiere actualizar tres archivos existentes SIN reemplazarlos por versiones parciales:

**A. `index.html`**

En el grupo de Cobranza UNI, después de Venta Adicional, añadir:

```html
<button id="side-cobranza-uni-administracion" class="side-item" data-route="cobranza-uni-administracion" type="button" hidden style="display:none"><span>🗂️</span><b>Administración</b></button>
```

Después de la vista `view-cobranza-uni-aditivas`, añadir:

```html
<section aria-label="Administración Cobranza UNI" class="view cua-uni-view" data-view="cobranza-uni-administracion" id="view-cobranza-uni-administracion"></section>
```

Antes de `./core/app.js`, añadir:

```html
<script src="./modules/cobranza-uni/administracion/admin-menu.js?v=20261023-f2-v001"></script>
```

**B. `core/module-loader.js`**

En el objeto `ROUTES`, añadir una entrada:

```js
'cobranza-uni-administracion': {
  css: ['./modules/cobranza-uni/administracion/main/main.css?v=20261023-f2-v001'],
  js: ['./modules/cobranza-uni/administracion/main/main.js?v=20261023-f2-v001']
},
```

**C. `core/router.js`**

- Registrar `'cobranza-uni-administracion':'Administración'` en `routeNames`.
- Después de `showCobranza_uni`, añadir esta función:

```js
function showCobranzaAdministracion_uni() {
  const route='cobranza-uni-administracion';
  const view=document.getElementById('view-'+route);
  if(!view)return false;
  activateViewById('view-'+route);
  setActiveSide(route);
  updateContext(route,'Cobranza UNITED · administración por tabla');
  if(window.ManttoCobranzaAdministracion_uni?.init)
    window.ManttoCobranzaAdministracion_uni.init().catch(()=>{});
  return true;
}
```

- En `showPlaceholder`, ANTES de la rama `COBRANZA_ROUTES_UNI.has(route)`:

```js
if(route==='cobranza-uni-administracion' && showCobranzaAdministracion_uni()) return;
```

Al editar archivos compartidos conservar sus demás rutas y cambios recientes. No publicar ni guardar cambios en la base sin autorización.

## Verificación

`node --test tests/cobranza-uni-administracion-fase1.test.js tests/cobranza-uni-administracion-fase2.test.js`

- 10/10 tests unitarios correctos en el entorno de preparación.
- `node --check` de los JS que integran el ZIP: OK.
- NO se probaron el SQL en MySQL, permisos de usuarios reales, flujo HTTP con sesión ni montaje de la navegación en una instalación de BLT NOW. Esas validaciones aún están pendientes.

## Normas de aplicación

No se aplicó ninguna modificación en Aiven, ni commit, push, deploy, publicación, instalador, .patch o script automatizado para modificar el repositorio.
