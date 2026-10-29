# Bitácora colaborativa — BLT NOW

Registro local de microentregas de seguridad. Este archivo documenta únicamente el trabajo comprobado en el árbol local; no implica commit, push, ejecución de CI ni despliegue.

## Entrega local — 2026-10-29 12:16:20 -06:00

- **Rama:** `main`
- **Base auditada:** `cce8b8afc1443d9fe2d8c8b9e83624409c0b4f08`
- **Implementación:** Lumbre
- **Revisión humana:** pendiente
- **Estado:** implementación y QA local completados; pendiente de autorización para cualquier commit, push o despliegue

| Microentrega | Alcance ejecutado | Evidencia local | Estado |
|---|---|---|---|
| L-01 | Neutralización de XSS en detalles de tickets y equipos. | `tests/lumbre-seg-001-ticket-details-xss.test.js` | QA local aprobado |
| L-02 | Eliminación de la exposición pública heredada de `/uploads` y actualización de diagnósticos/validadores. | `tests/lumbre-seg-002-legacy-uploads-public.test.js` | QA local aprobado |
| L-03 | Actualización y fijación del baseline de dependencias vulnerables del backend. | `tests/lumbre-seg-003-dependency-baseline.test.js`; `npm audit` sin vulnerabilidades | QA local aprobado |
| L-04 | Endurecimiento de workflows: acciones fijadas por SHA, permisos mínimos, auditoría, pruebas y artefacto de despliegue separado. | `tests/lumbre-seg-004-ci-supply-chain.test.js` | Validación estática aprobada; ejecución remota pendiente |
| L-06 | Retiro de JWT y contexto de sesión de `localStorage`; aislamiento por pestaña y transferencia segura al visor. | `tests/lumbre-seg-006-jwt-storage.test.js` y pruebas de política de sesión | QA local aprobado |
| L-07 | CSP y cabeceras defensivas locales, eliminación de handlers inline y SRI para dependencias CDN. | `tests/lumbre-seg-007-csp-sri.test.js` y pruebas PWA | QA local aprobado; despliegue pendiente |
| L-08 | Caducidad, purga e aislamiento por identidad de snapshots, borradores y permisos offline. | `tests/offline-f2-storage.test.js` | QA local aprobado |

L-05 y L-09 no fueron ejecutadas por Lumbre porque fueron reasignadas por la dirección del proyecto.

### Validaciones ejecutadas

- `npm.cmd test --prefix backend`: aprobado; suites unitarias, validaciones, contratos y validadores de almacenamiento completadas.
- `npm.cmd run check --prefix backend`: aprobado.
- `npm.cmd audit --prefix backend --audit-level=moderate --json`: 0 vulnerabilidades informativas, bajas, moderadas, altas o críticas; 238 dependencias auditadas.
- `git diff --check`: aprobado, sin errores de espacios en blanco.

### Riesgos residuales y compatibilidad

- La CSP conserva `style-src 'unsafe-inline'` por compatibilidad con estilos inline existentes; los scripts no permiten `unsafe-inline`.
- Los workflows se validaron localmente de forma estática, pero todavía no se han ejecutado en GitHub Actions.
- Las cabeceras de `netlify.toml` no se han comprobado en un despliegue real.
- La retirada de `/uploads` presupone que los datos externos heredados ya no dependen de esa ruta pública; cualquier referencia residual deberá migrarse al almacenamiento privado.
- Los snapshots offline caducan a los siete días y los borradores a una hora, por lo que el cliente puede requerir una nueva descarga después de esos límites.

[Lumbre | 2026-10-29 | LUMBRE-MG | REGISTRO_BITACORA_SEGURIDAD_LOCAL_V001]

## Fix local — 2026-10-29 16:15:13 -06:00

- **ID:** LUMBRE-FIX-VISOR-001
- **Título:** El Visor de usuarios no abre al seleccionar una identidad
- **Módulo:** autenticación / Visor de usuarios / PWA
- **Tipo:** corrección de regresión local
- **Base:** `ecedf8b315ebc7c3603d82d8506a017467c72b3b`
- **Implementación:** Lumbre
- **Revisión humana:** pendiente
- **Estado:** `LOCAL` + `EN QA` aprobados; `PENDIENTE AUTORIZACION` para commit

### Defecto y causa raíz

La protección L-06 intentaba escribir el contexto temporal directamente en el `sessionStorage` de la pestaña recién abierta. Ese acceso entre ventanas puede ser rechazado por el aislamiento del navegador; el manejador cerraba entonces la pestaña y el usuario no llegaba al modo Visor. La prueba original usaba un objeto de almacenamiento simulado y no reproducía el arranque de la segunda pestaña.

### Solución local

- Sustituido el acceso directo al almacenamiento de la ventana por un `BroadcastChannel` efímero, identificado mediante un nonce temporal.
- El JWT del visor se transmite únicamente entre contextos del mismo origen; no se escribe en `localStorage` ni se incorpora a la URL.
- La pestaña receptora valida vigencia, identidad y token, confirma la recepción y cierra el canal.
- Actualizadas las referencias de caché de `auth.js`, `user-viewer.js` y la versión del Service Worker para impedir que la PWA conserve el flujo defectuoso.
- Añadida una prueba integral simulada de dos pestañas que confirma que la receptora inicia con la identidad seleccionada.

### Archivos afectados

- `core/auth.js`
- `core/user-viewer.js`
- `index.html`
- `service-worker.js`
- `tests/lumbre-seg-006-jwt-storage.test.js`
- `tests/fix_offline_http_session_v001.test.js`
- `docs/BITACORA_COLABORATIVA_BLT_NOW.md`

### Validación

- Prueba específica del visor: 4/4 aprobadas.
- Suite completa `npm.cmd test --prefix backend`: 1,373 unitarias, 216 validaciones, 251 backend y 14 contratos aprobados; validadores de almacenamiento aprobados.
- Reproducción visual en la aplicación instalada: no ejecutada porque el control de navegador no pudo verificar de forma segura su URL; sustituida por prueba integral local de transferencia y arranque entre pestañas.

### Riesgo residual

El navegador debe soportar `BroadcastChannel`. Si no lo soporta, el visor falla de forma explícita y cerrada sin exponer el token. Chrome/Chromium moderno implementa esta API.

No se realizó commit, push, CI remoto ni despliegue. El archivo local no relacionado `docs/PROJECT_CONSTITUTION.md` no fue modificado.

[Lumbre | 2026-10-29 | LUMBRE-MG | FIX_VISOR_CANAL_EFIMERO_LOCAL_V001]

## Preparación local Version 102926.8 — 29/10/2026 - 17:22

- **Base:** `118974a8b436cc6728ebbb009e1b01f80ee64938` (`Version 102926.7`)
- **Rama:** `main`
- **Implementación:** Lumbre
- **Revisión humana:** pendiente
- **Estado:** `LOCAL` + `EN QA` aprobados; `PENDIENTE AUTORIZACION` para commit; push no realizado

### LUMBRE-FIX-SIDEBAR-PERMISOS-002 — Navegación fail-closed

Se reaplicó sobre la base `.7` la corrección local que no alcanzó el remoto debido al rechazo non-fast-forward del push anterior. `applyActionPermissions()` podía volver a mostrar módulos que `applySidebar()` ya había ocultado cuando el permiso exacto no existía, no estaba configurado o todavía estaba cargando.

- Los nodos `.side-item[data-permission]` usan valor predeterminado denegado.
- El estado de permisos y el menú se bloquean antes de iniciar, recargar o cambiar la identidad del Visor.
- Un error de la API conserva oculta la navegación protegida.
- Se actualizaron las referencias de caché de `user-viewer.js` y del Service Worker.
- Se agregaron regresiones para carga pendiente, ausencia de permiso, concesión efectiva, cambio de identidad y fallo de API.

### LUMBRE-FIX-CI-TLS-001 — Contrato Fase 6 compatible con TLS obligatorio

El contrato `backend/scripts/test-fase-6-alcances.js` establecía `DB_SSL` en `false`, mientras `backend/src/config/aiven-tls.js` exige TLS habilitado. La prueba usa ejecutores simulados y no abre una conexión real.

- Se sustituyó exclusivamente `process.env.DB_SSL ||= 'false';` por `process.env.DB_SSL = 'true';`.
- No se modificó `aiven-tls.js` ni se debilitaron sus validaciones.
- No se modificaron variables de Azure.
- No se reintrodujeron Redis ni ClamAV.

### Archivos afectados

- `backend/scripts/test-fase-6-alcances.js`
- `core/user-viewer.js`
- `index.html`
- `service-worker.js`
- `tests/fix_offline_http_session_v001.test.js`
- `tests/lumbre-fix-sidebar-permissions.test.js`
- `docs/BITACORA_COLABORATIVA_BLT_NOW.md`

### Validaciones ejecutadas

- `node backend/scripts/test-fase-6-alcances.js`: aprobado; `FASE_6_ALCANCES_GLOBALES_V001 + UNI_PUERTAS_CUARTOS: OK`.
- Regresiones dirigidas de permisos, sesión y Visor: 29/29 aprobadas.
- Análisis sintáctico de los tres archivos JavaScript directamente intervenidos: aprobado.
- `npm.cmd run check --prefix backend`: aprobado; estructura y árbol Git validados.
- `npm.cmd test --prefix backend`: aprobado en sus cinco etapas. Validación 216/216, backend 278/278, contratos 14/14 y los tres validadores de almacenamiento concluyeron correctamente; la etapa unitaria también terminó sin fallos.

### Publicación

No se realizó commit, push, CI remoto ni despliegue. La versión `102926.8` permanece reservada para publicación por Joseph.

[Lumbre | 2026-10-29 | LUMBRE-MG | PREPARACION_LOCAL_VERSION_102926_8_V001]
