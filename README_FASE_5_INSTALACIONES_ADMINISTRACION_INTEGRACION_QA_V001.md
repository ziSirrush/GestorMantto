# FASE 5 - INSTALACIONES / ADMINISTRACION - INTEGRACION Y QA V001

Fecha: 2026-10-08
Repositorio: `ziSirrush/GestorMantto` | rama `main`
Base GitHub confirmada: `9a744173990386cc0c64f6e1225ab9b07cf273cb` (`Version 100826.3`).
**Predecesora OBLIGATORIA:** aplicar primero
`FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001.zip`
y su `ACTUALIZAR_CACHE_BUST_FASE_4.ps1`.

## Alcance implementado (FIX incremental)

- El backend conserva Guard CORELLIAN + agrupacion INSTALACIONES, permisos VER/EDITAR
  por cada uno de 11 grupos y validacion de registro por alcance (F1-F4).
- Se refuerza la auditoria: el servicio central de Interacciones convierte
  silenciosamente a NULL los JSON mayores de 65535 bytes. Ahora este modulo
  comprueba el tamano real en **bytes UTF-8 antes del INSERT** y rechaza con 413
  si no cabe el `before/after`; el repositorio hace ROLLBACK del UPDATE.
- El INSERT de auditoria debe regresar `id_interaccion` positivo; ante resultado
  indeterminado se rechaza para evitar considerar confirmado un cambio sin evidencia.
- La busqueda no usa `referencia_sitio` como columna de orden cuando el usuario
  no tiene permiso para leerla (evita filtracion indirecta).
- Frontend: evita mostrar un exito de recarga cuando el backend fallo, evita
  usar una cabecera anterior al PATCH y descarta GET de detalles obsoletos.
- Agrega controles de pruebas locales: concurrencia de dos editores (simulada),
  permisos de proyeccion, escritura/rollback de auditoria (simulada), smoke GET
  opcional contra backend y matriz manual E2E por severidad.
- `getContract_cor` anuncia `phase:5` sin alterar la forma de `groups` ni PATCH.
- Sin tablas, columnas, SQL DDL o permisos adicionales. No se toca GAS.

## Archivos incluidos (completos)

Modificados respecto de Fase 4:

- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.audit-service.js`
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js`
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js`
- `modules/instalaciones-administracion/instalaciones-administracion_cor.js`

Nuevos:

- `tests/instalaciones-administracion-fase5-integracion-qa.test.js`
- `validation/instalaciones-administracion-fase5-readonly-smoke.js`
- `database/QA_FASE_5_INSTALACIONES_ADMINISTRACION_SOLO_LECTURA_V001.sql`
- `ACTUALIZAR_CACHE_BUST_FASE_5.ps1`
- `EJECUTAR_QA_FASE_5.ps1`
- `MATRIZ_QA_FASE_5_INSTALACIONES_ADMINISTRACION_V001.md`
- `MANIFEST_FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001.txt`
- `SHA256SUMS_FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001.txt`
- Este README.

## Instalacion (LOCAL, sin escritura remota)

1. Revisar `git status` / `git rev-parse HEAD`; compararlo con la base indicada.
   Si `main` avanzo, reconciliar primero: **NO sobrescribir versiones
   desconocidas**. GitHub es autoridad del codigo.
2. Confirmar que Fase 4 **ya esta aplicada**, incluidos sus cambios de cache
   (`core/module-loader.js` e `index.html`).
3. Extraer este ZIP sobre la raiz del repositorio, conservando carpetas.
4. En PowerShell desde la raiz:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\ACTUALIZAR_CACHE_BUST_FASE_5.ps1`

   Script idempotente y fail-closed, que modifica localmente **un token** en
   `core/module-loader.js` y **un token** en `index.html` (JS del modulo:
   `20261008-instalaciones-administracion-fase4-v001` -> `...fase5-v001`).
   No cambia el CSS de Fase 4 ni modulos ajenos.
5. Verificar `git diff --check` y `git diff --stat`, especialmente los dos
   tokens de cache. Ejecutar desde la raiz:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\EJECUTAR_QA_FASE_5.ps1`

   Prueba `node --check` y ejecuta con Node los tests F1, F2, F3, F4 y F5.
   No hace consultas de red, mutaciones SQL ni despliegues. No se ha ejecutado
   este script PS en Windows durante la generacion del ZIP.

## Smoke remoto opcional y SOLO LECTURA

**NO ejecutes pruebas contra un backend remoto sin autorizacion de acceso.**

Requisitos: Node 18+ y variables `MANTTO_QA_TOKEN` (JWT autorizado), y si
aplica `MANTTO_QA_DEVICE_TOKEN`; configurarlas de modo seguro, sin subirlas
al repo ni copiarlas a historiales o capturas.

`node validation/instalaciones-administracion-fase5-readonly-smoke.js --readonly --base-url https://TU-BACKEND-AUTORIZADO.azurewebsites.net --record-id 123`

- El ID 123 es ilustrativo: usa un `id_ins_fl` real **de prueba** y dentro del
  alcance del usuario. Se puede omitir `--record-id`.
- El script solo usa `GET`, comprueba ausencia de sesion, contrato (11 grupos),
  rechazos 400 y ausencia de columnas no autorizadas; no imprime datos ni tokens.
- Para revisar conteos reales de Aiven, ejecutar solamente los `SELECT` del
  archivo SQL read-only en la base autorizada y con cuenta de solo lectura.
- Una prueba GET exitosa NO equivale a prueba de guardado/rollback E2E.

## Liberacion y limites conocidos

- **No puedo confirmar** que F2 SQL/roles esten asignados en Aiven, que el
  backend Azure ya use F1-F4, ni que GAS/Sheets respete los cambios humanos.
- Debe verificarse si GAS sobrescribe los mismos campos de `ins_fl`: en ese
  caso resolver politica de autoridad/conflictos ANTES de liberar. No se
  introduce suposicion ni un segundo sincronizador.
- Probar los 11 grupos con perfil de solo VER, perfil EDITAR, otro dominio,
  visor, usuario sin scope; 403, 404, 409, auditoria y fechas/montos.
- Ejecutar casos P0 de `MATRIZ_QA_...md` en laboratorio/Aiven QA, con evidencia.
- **Produccion NO AUTORIZADA automaticamente.** Mantener flujo Local ->
  GitHub Pages (validacion online) -> Netlify (produccion con deploy manual).

## Validaciones realmente ejecutadas al crear el ZIP

- `node --check` de JS entregados: se incluye verificacion de sintaxis local.
- `node --test` F4 + F5 en arbol parcial F4/F5: **22/22 tests simulados PASS**.
- F1-F3 en checkout GitHub completo: **NO EJECUTADOS** por ausencia de checkout
  local completo; el runner PowerShell incluido permite esa comprobacion.
- Pruebas E2E Azure/Aiven/Netlify, asignacion SQL real, deploy y GAS: **NO EJECUTADOS**.
- SHA-256 por archivo verificado en manifiesto independiente.

## Estado de sistemas

Este ZIP es preparacion local. **NO** se ejecutaron `git push`, SQL de
modificacion, deploy Azure, GitHub Pages o Netlify, ni ajustes GAS/Sheets.
**No esta liberada la Fase 5 en produccion**: la QA operacional P0 esta pendiente.
