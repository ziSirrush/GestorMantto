# Mantto Gestor / Instalaciones > Administracion / FASE 6 V001

Fecha: 2026-10-08 | Repositorio: `ziSirrush/GestorMantto` | Rama: `main`.
**Base remota verificada:** `9a744173990386cc0c64f6e1225ab9b07cf273cb` (`Version 100826.3`).
**Orden obligatorio de instalacion:** Fase 4 -> Fase 5 -> Fase 6. Las fases 4 y 5 todavia NO figuran aplicadas en el `main` consultado al crear esta entrega.

## Por que existe una Fase 6 funcional

Se identifico un defecto concreto de continuidad de sesion: el frontend de Fase 5 conserva en memoria y en el DOM el contrato de permisos, resultados de busqueda, registro seleccionado y formularios cuando termina una sesion, inicia otra cuenta o se cambia el usuario efectivo del Visor. El router reutiliza vistas inicializadas y, al volver sin un `id` de registro, podia conservar datos del contexto previo. Ademas, respuestas HTTP iniciadas antes del cambio podian repoblar la vista despues de limpiar los datos.

## Cambio funcional (solo el modulo)

- Se invalidan y limpian datos, formularios, encabezados, catalogo de usuarios y contrato ante `mantto:auth-ready`, `mantto:view-user-changed`, `mantto:session-expired` y `mantto:permissions-updated`.
- Cada peticion asincrona valida su contexto de sesion antes de pintar resultados o estados. Las respuestas obsoletas de busqueda, detalle, catalogo y guardado ya no reintroducen datos visibles de otro contexto.
- Si una vista reutilizada no tiene contrato actual, solicita nuevamente el contrato y registros autorizados antes de mostrar informacion.
- La validacion de permisos y alcances permanece EXCLUSIVAMENTE en los Guards/servicios backend ya existentes. Este control del navegador es defensa de presentacion, NO reemplaza autorizacion.
- No introduce tablas, columnas, endpoints, cambios SQL, modificaciones de GAS, motor de scope ni banderas ocultas de notificaciones.
- Se conserva `VERSION_COR='20261008-fase5-v001'` internamente porque identifica la plantilla HTML de F5, que NO cambia. El JS publico se renueva en el `module-loader` a `fase6-v001`.

## Archivos incrementales del ZIP

1. `modules/instalaciones-administracion/instalaciones-administracion_cor.js` (modificado, completo).
2. `tests/instalaciones-administracion-fase6-aislamiento-sesion.test.js` (nuevo, pruebas funcionales con VM y API/DOM simulados).
3. `ACTUALIZAR_CACHE_BUST_FASE_6.ps1` (nuevo, edita **solo dos tokens locales** en `core/module-loader.js` e `index.html`, con prevalidacion y revert en fallo).
4. `EJECUTAR_QA_FASE_6.ps1` (nuevo, suite de fases 1-6 en repositorio completo).
5. Este README, MANIFEST y SHA256SUMS.

## Como aplicarlo (local, sin acciones remotas)

1. Abrir la raiz local del repo y verificar `git status` y `git rev-parse HEAD` contra el `main` actual. Si hay cambios posteriores a la base, reconciliar antes; no sobrescribir un archivo que pudo evolucionar.
2. Aplicar y ejecutar correctamente `FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001.zip`, luego `FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001.zip`, incluidos sus scripts `ACTUALIZAR_CACHE_BUST_FASE_*.ps1`.
3. **ANTES de extraer F6:** comprobar que el JS frontend corresponde exactamente a F5. Su SHA-256 oficial en la entrega F5 es:
   `64503a4714f9713b49c2af19fff005383e54aa9ff88a3122bac100cb61b4a0f2`
   Comando local: `Get-FileHash .\modules\instalaciones-administracion\instalaciones-administracion_cor.js -Algorithm SHA256`.
   Si no coincide: **detener**, revisar diferencias y no sobrescribir.
4. Extraer F6 en la raiz del repositorio conservando estructura de carpetas. Solo sustituye el JS indicado; los demas son archivos nuevos.
5. En PowerShell, desde la raiz:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\ACTUALIZAR_CACHE_BUST_FASE_6.ps1`
6. Ejecutar `git diff --check`, `git diff --stat` y luego:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\EJECUTAR_QA_FASE_6.ps1`
   El segundo script requiere todos los tests F1-F5 existentes en la copia local.

## Evidencias y restricciones

- Comprobaciones realizadas sobre este ZIP: `node --check` de los JS y 6/6 pruebas locales funcionales con simulaciones de DOM/API: **PASS**.
- Los scripts PowerShell no se ejecutaron en Windows durante la preparacion. La suite combinada F1-F6 sobre checkout completo no se ejecuto; hacerlo localmente.
- Sin ejecucion E2E en Azure/Aiven/Netlify; sin comprobacion de asignaciones de permisos reales, concurrencia Aiven ni convivencia con sincronizadores GAS. Esos puntos son bloqueantes de Fase 5 para liberar.
- **No puedo confirmar** que la version de Fase 5 ya este desplegada o que exista autorizacion para produccion.
- No se modificaron GitHub, Aiven, Azure, Netlify ni Google Apps Script.

## Estado despues del fix

Las fases de desarrollo 1-6 quedan **preparadas**, pero F4/F5/F6 aun requieren instalacion/validacion sobre el repositorio local y pruebas operativas E2E. No hay una Fase 7 definida ni autorizacion automatica de despliegue. El flujo de promocion vigente sigue Local -> GitHub Pages -> Netlify (manual).
