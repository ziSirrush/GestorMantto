# FIX FASE 2 - PANEL DE CONTROL / PRUEBA DE CARGA - HALLAZGOS V001

**Fecha:** 28/09/2026
**Base de integración:** versión local entregada por Joseph (`Version Local.zip`)
**Objetivo:** cerrar los cuatro hallazgos detectados en Fase 2 antes de iniciar Fase 3, fusionando sobre el trabajo local vigente y conservando Auditoría.

## Resultado

### OK 1 - Carga del Panel

**Archivos modificados:**

- `modules/panel-control/panel-control.js`
- `core/module-loader.js`
- `index.html`
- `tests/panel-control-prueba-carga-fase2.test.js`

Cambios:

- `loadBootstrap()` ya no espera a `/api/panel-control/prueba-carga/capabilities`.
- capacidades se consultan en paralelo mediante `AbortController` con timeout de 5 segundos;
- `403`, error de red y timeout ocultan únicamente el tab `Prueba de Carga`;
- el error de capacidades no alimenta `state.error` global;
- `Recargar datos` vuelve a intentar capacidades;
- Auditoría puede abrir aunque capacidades esté lenta, denegada, caída o en timeout;
- el tab aparece únicamente cuando backend confirma `permissions.access=true`.

### OK 2 - Solicitudes de solo lectura

**Archivos modificados:**

- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.telemetry.js`
- `tests/panel-control-prueba-carga-fase2.test.js`

Cambios:

- una solicitud marcada con `X-Mantto-Load-Test` conserva la validación obligatoria del token efímero;
- después de validar token, solamente `GET` y `HEAD` pueden continuar;
- `POST`, `PUT`, `PATCH` y `DELETE` retornan `405 / LOAD_TEST_READ_ONLY` antes de cualquier ruta de negocio;
- solicitudes normales sin la cabecera conservan su comportamiento previo.

### OK 3 - Identidad y permisos

**Archivos modificados:**

- `backend/src/middleware/auth.middleware.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.controller.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js`
- `tests/panel-control-prueba-carga-fase2.test.js`

Cambios:

- las rutas de Prueba de Carga mantienen identidad de actor para `req.user`, incluso con Visor activo;
- controller usa `req.user`, no `req.contextUser`;
- acceso/ejecución/detención siguen dependiendo de permisos efectivos existentes;
- no existe fallback por nombre `Programador United` o `Programador Corellian`;
- `stopSession()` ahora valida también propiedad de sesión antes de detener;
- operaciones de crear/iniciar/detener/limpiar fallan cerrado con `VIEWER_READ_ONLY` si existe Visor activo.

**Importante:** este FIX no ejecuta ni modifica permisos en Aiven. Usa como autoridad los permisos ya aplicados en el entorno.

### OK 4 - Sesión vencida en interfaz

**Archivos modificados:**

- `modules/panel-control-prueba-carga/panel-control-prueba-carga.js`
- `tests/panel-control-prueba-carga-fase2.test.js`

Cambios:

- `Actualizar estado` con `404` limpia sesión/token locales, reconsulta capacidades y deja preparar otra sesión sin recargar;
- `Limpiar sesión` con `404` se trata como limpieza completada;
- un error de red distinto de `404` conserva sesión y token locales;
- se elimina también `active_session` del snapshot local al recuperar una expiración para impedir que la UI restaure una sesión ya vencida.

## Auditoría conservada

Se verificó contra la versión local original que permanecen sin cambios:

- `auditWeek`, `auditCompany`, `auditModule`, `auditType`, `auditLayer`;
- pestaña `Auditoría`;
- rama de `renderMain()` para Auditoría antes de `bootLoading` y `state.error`;
- bloque completo desde `const AUDIT_ZONE='America/Mexico_City';` hasta el cierre de `renderChangeAudit(box)`;
- estilos `.pc-change-audit`;
- `core/change-audit.generated.js`;
- `core/build-info.generated.js`;
- `audit/changes/`;
- `tools/generate-change-audit.js`;
- generación de Pages y Netlify;
- `tests/change-audit-generator.test.js`.

`implementacion/CODIGO_AUDITORIA_A_CONSERVAR_V001.md` se incluye en el paquete como referencia obligatoria para integraciones que partan de un commit antiguo. No debe usarse para sustituir a ciegas el archivo local fusionado.

## Capacidad vigente

- meta inicial: **200 VUs**;
- pasos iniciales: **10 VUs**;
- `LOAD_TEST_MAX_VUS` continúa siendo configurable;
- **no existe tope duro de 200**;
- duración sigue limitada por la configuración de Fase 2;
- no se agregan tablas ni persistencia.

## Cache bust actualizado

- `core/module-loader.js` carga `modules/panel-control/panel-control.js` con versión `20260928-auditoria-prueba-carga-fase2-hallazgos-v001`.
- `index.html` carga `core/module-loader.js` con la misma revisión.
- `modules/panel-control/panel-control.js` carga los assets de Prueba de Carga con `20260928-fase2-hallazgos-v001`.
- las referencias de `core/build-info.generated.js` y `core/change-audit.generated.js` conservan el SHA generado vigente y su orden original.

## Validaciones ejecutadas

```text
node --test tests/panel-control-prueba-carga-fase2.test.js
node --test tests/change-audit-generator.test.js
cd backend && npm run check
node --check modules/panel-control/panel-control.js
node --check modules/panel-control-prueba-carga/panel-control-prueba-carga.js
git diff --check
```

Resultados finales de esta entrega:

- Pruebas Fase 2 / hallazgos: **17/17 PASS**.
- Auditoría: **5/5 PASS**.
- `backend/npm run check`: **PASS**.
- `backend/npm test`: **76/76 PASS** (regresión adicional).
- `node --check` en los JavaScript modificados: **PASS**.
- `git diff --check` del delta contra los bytes exactos de `Version Local.zip`: **PASS**.

Consultar `VALIDACION_FIX_FASE_2_PANEL_CONTROL_PRUEBA_CARGA_HALLAZGOS_V001.txt` para resultados y alcance exactos.

## No ejecutado / no modificado

- Aiven: NO modificado.
- Azure: NO desplegado ni modificado.
- GitHub: NO commit/push.
- GitHub Pages: NO desplegado.
- Netlify: NO desplegado.
- prueba real de carga: NO ejecutada.
- k6 / Fase 3: NO iniciado.

## Aplicación

Copiar únicamente los archivos del ZIP respetando su estructura sobre la **versión local vigente**. No restaurar archivos completos desde una entrega de Fase 1/Fase 2 basada en un commit antiguo.

Después de integrar, ejecutar nuevamente las validaciones indicadas arriba. La apertura de Auditoría, Prueba de Carga autorizada y la continuidad de las demás pestañas ante fallo de capacidades se validó localmente mediante el harness VM automatizado; no equivale a una prueba E2E contra el entorno desplegado.

## Reversión

Revertir únicamente los cambios listados en el diff de este FIX. No restaurar `panel-control.js`, `panel-control.css`, `core/module-loader.js` o `index.html` desde `main @ 37780b3`, porque eso eliminaría trabajo local posterior, incluida Auditoría.
