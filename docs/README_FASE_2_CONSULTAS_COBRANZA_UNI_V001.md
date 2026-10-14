# MANTTO GESTOR | FASE 2 / 3 | Consultas protegidas de Cobranza UNITED V001

**Fecha de entrega:** 13/10/2026
**Base revisada:** `ziSirrush/GestorMantto`, rama `main`, commit `f1b1f4e4519835cea049e8d1aa8797df7168cab5`
**Formato:** ZIP incremental, archivos **completos** y rutas originales; **no patch**.

## 1. Alcance y precondicion

**PRERREQUISITO OBLIGATORIO:** Fase 1 ya instalada en el mismo repositorio:
`backend/src/services/cobranza-uni/identidad-proyecto.service.js`.

La Fase 1 resuelve un nombre unico y su ID en `proyectos_mantto.cobranza`, valida la existencia/nombre en `cobranza_proyectos` y comprueba que Portafolio no tenga otra relacion para ese nombre. La Fase 2 **consume esta capa existente**. El motor validador FK V001 de sincronizaciones permanece intacto.

**Problema corregido:** en detalles GC, MP y VA, los filtros `id_proyecto_cobranza = ? OR proyecto = ?` podian incluir registros e importes de proyectos ajenos. En el listado MP, el adeudo VA se agregaba priorizando el FK aun cuando fuera erroneo.

**Esta fase NO cambia**: estructura de BD, importes almacenados, sincronizaciones POST, tablas, permisos/guards, `scope` UNITED, Frontend, Portafolio ni codigo CORELLIAN. No usa ninguna tabla nueva ni escribe en Aiven. Las protecciones de las consultas del Detalle Proyecto de Portafolio y el alcance territorial quedan expresamente para Fase 3.

## 2. Archivos completos incluidos

| Accion | Ruta relativa desde la raiz del repositorio |
|---|---|
| NUEVO | `backend/src/controllers/cobranza-uni-relaciones-protegidas.controller.js` |
| MODIFICADO (COMPLETO) | `backend/src/routes/cobranza-uni.routes.js` |
| MODIFICADO (COMPLETO) | `backend/src/routes/detalle-mp-2026.routes.js` |
| NUEVO | `tests/cobranza-uni-consultas-protegidas-fase2.test.js` |
| NUEVO | `docs/README_FASE_2_CONSULTAS_COBRANZA_UNI_V001.md` |

El controlador anterior `*-cuartos-v2.controller.js` se mantiene **sin cambios** para las rutas de listado ya existentes. La consulta principal MP reutiliza internamente su handler actual y solo sustituye el calculo agregado VA antes de enviar la respuesta al navegador. Esto reduce el riesgo de alterar KPI, filtros, columnas, territorios o renderizado legado.

## 3. Comportamiento protegido

### Detalles humanos (GET)

| Endpoint relativo bajo `/api` | Efecto |
|---|---|
| `/cobranza-uni/gestion-credito/:id/detalle` | Selecciona GC por `id_gc`, verifica identidad y carga MP y VA con filtro protegido |
| `/cobranza-uni/venta-adicional/:id/detalle` | Selecciona `pc` por `id_pc`, verifica identidad y carga GC y MP con filtro protegido |
| `/cobranza-uni/detalle-mp-2026/:id` | Selecciona MP por `id_dmp`, verifica identidad y carga GC, MP y VA con filtro protegido |
| `/cobranza-uni/detalle-mp-2026` | Devuelve misma estructura del listado MP y recalcula solo el adeudo VA con relaciones unicas verificadas |

En detalles, el servicio de Fase 1 recibe **el nombre crudo `row.proyecto`**, nunca `proyecto_oficial`, porque este puede provenir del ID incorrecto. Solo permite coincidencias candidatas que cumplan **nombre validado** Y (`FK esperado` **O** `FK NULL`). Si el registro principal tiene un FK conflictivo o no hay mapeo inequívoco, las listas cruzadas quedan vacias y no se ejecutan consultas de relacion; la ficha del registro original sigue accesible segun el Guard/Scope original.

Los filtros de autorización de UNITED permanecen activos en la consulta principal y se concatenan siempre con `AND` a las consultas relacionadas. **El nuevo servicio de identidad no concede permisos**.

### Adeudos VA del listado MP

Una unica consulta `WITH` verifica para cada proyecto:

1. Unicidad de nombre e ID en `proyectos_mantto`;
2. Nombre binariamente identico en `cobranza_proyectos`;
3. Ausencia de `portafolio.id_proyecto_cobranza` contradictorio para ese nombre;
4. Coincidencia de nombre del registro MP y PC, con FK correcto o `NULL`;
5. Alcance de informacion original de MP **y** PC.

No suma PC con nombre distinto solo por compartir un FK incorrecto. Mantiene el calculo de la deuda MP y KPI legacy; sustituye el subtotal VA validado, lo cuenta una sola vez por proyecto confirmado y recalcula el total MP + VA.

**Importante sobre parcialidad:** si un MP carece de relacion validada o hay PC del mismo nombre con FK contradictorio, el valor numerico `adeudo_va` contiene **solo el subtotal verificado**, y puede ser inferior al adeudo real. Para no ocultar la situacion, el backend incluye:

- `rows[].adeudo_va_verificado`: `false` si la relacion esta pendiente o incompleta;
- `kpis.adeudo_va_es_parcial`: `true` si el subtotal global no esta completamente verificado;
- `kpis.adeudo_va_filas_sin_identidad` y `kpis.adeudo_va_operaciones_fk_conflictivo`: contadores de pendientes.

**El frontend actual todavia no visualiza estas banderas.** Hasta completar Fase 3, no se debe interpretar un `0` de una fila **no verificada** como certificacion de deuda nula. Esta limitacion evita alterar el modulo visual en esta fase, pero requiere control operacional al consultar cifras.

### Restricciones preservadas

- Sin reescritura de importes, proyecto, IDs o montos almacenados.
- No se altera `POST /api/cobranza-uni/sync`, `POST /api/cobranza-uni/detalle-mp-2026/sync` ni `POST /api/cobranza-uni/pc/sync`.
- Los `humanInformationGuard_gnral` y `buildCobranzaProjectScopeSql_uni` siguen siendo obligatorios.
- Falla cerrado si falta la Fase 1 o esta no valida una identidad. Errores de BD devuelven error, no datos financieros supuestos.
- Sin escrituras externas realizadas durante la generacion.

## 4. Instalacion Windows PowerShell (archivos completos)

Antes de aplicar: confirmar cambios locales en los dos archivos de rutas; si existen modificaciones posteriores al commit base, revisar manualmente el solapamiento. No sobrescribir un archivo modificado por otra persona sin comparar.

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\FASE_2_CONSULTAS_COBRANZA_UNI_V001.zip"
Set-Location $REPO

git status --short
Test-Path '.\backend\src\services\cobranza-uni\identidad-proyecto.service.js'
# Debe mostrar True: Fase 1 obligatoria.

# Copia externa de los dos archivos existentes (nunca dentro del repositorio).
$BACKUP = Join-Path $env:TEMP ('ManttoGestor_Fase2_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $BACKUP -Force | Out-Null
Copy-Item '.\backend\src\routes\cobranza-uni.routes.js' (Join-Path $BACKUP 'cobranza-uni.routes.js')
Copy-Item '.\backend\src\routes\detalle-mp-2026.routes.js' (Join-Path $BACKUP 'detalle-mp-2026.routes.js')

Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force

node --check backend/src/controllers/cobranza-uni-relaciones-protegidas.controller.js
node --check backend/src/routes/cobranza-uni.routes.js
node --check backend/src/routes/detalle-mp-2026.routes.js
node --test tests/cobranza-uni-consultas-protegidas-fase2.test.js
node --test tests/cobranza-uni-identidad-proyecto-fase1.test.js
node --test tests/cobranza-uni-fk-validator.test.js
git diff --check
git status --short
```

**Nota de limpieza:** el respaldo queda en `$BACKUP` fuera del repositorio y sirve para revertir los dos archivos de rutas si se requiere. El ZIP no contiene respaldos ni archivos temporales.

## 5. Validaciones efectuadas en la entrega

- Repositorio `main` y el contrato completo Fase 1 inspeccionados.
- Sintaxis Node.js: tres fuentes Fase 2 comprobadas.
- Pruebas Fase 2 simuladas: **16/16 aprobadas**.
- Pruebas conjuntas de contrato Fase 1 y validador V001, en el mismo montaje de QA: **49/49 aprobadas**, utilizando mocks.
- Integridad ZIP, lista de archivos y ausencia de archivos `.patch`: verificadas.
- Comprobacion estatica de diferencias con `git diff --cached --check` en carpeta temporal aislada, si se indica en el resumen de QA.
- **Sin conexion a Aiven**, sin prueba MySQL 8 real y sin prueba E2E contra Azure: esos resultados no pueden afirmarse hasta disponer del ambiente autorizado.

## 6. Reversion y pasos siguientes

Para revertir solo la Fase 2: restaurar los **dos archivos de rutas** desde su copia original o desde la version base de Git (no perder modificaciones locales independientes), borrar el controlador nuevo **solo si no existen cambios propios posteriores**, y eliminar el test y README de Fase 2 cuando no se requieran. Fase 1 y FK Validador V001 deben mantenerse intactos.

**Fase 3 pendiente:** proteger consultas/adeudos de Detalle Proyecto Portafolio, eliminar el uso de nombres canonicos originados de un FK erroneo en el alcance territorial, atender equivalencias de proyectos multiseccion y mostrar explicitamente las banderas de subtotal incompleto en UI. Validar con perfiles de permiso reales, Aiven y medicion de rendimiento antes de despliegue.

## 7. Estado de sistemas externos

| Sistema | Estado de esta entrega |
|---|---|
| Archivos ZIP generados | SI |
| Codigo GitHub remoto | SIN MODIFICACIONES |
| Datos en Aiven | SIN MODIFICACIONES |
| Azure | SIN MODIFICACIONES |
| Netlify | SIN MODIFICACIONES |

Este ZIP no ejecuta scripts SQL ni tareas de despliegue.
