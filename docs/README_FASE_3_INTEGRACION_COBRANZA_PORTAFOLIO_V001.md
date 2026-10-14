# MANTTO GESTOR | FASE 3/3 | INTEGRACION COBRANZA - PORTAFOLIO | V001

**Fecha:** 13/10/2026
**Base de codigo verificada:** `ziSirrush/GestorMantto`, rama `main`, commit `f1b1f4e4519835cea049e8d1aa8797df7168cab5`
**Entrega:** ZIP incremental con archivos **completos y rutas originales**. No incluye `.patch`, `.diff`, respaldos, ZIP anidados ni codigo ajeno al cambio.

## 1. Objetivo y origen del problema

En el backend previo, el Detalle de Proyecto de Portafolio suma GC, MP y Venta Adicional (tabla `pc`) mediante `id_proyecto_cobranza = ? OR proyecto = ?`. Si el FK heredado de una factura o contrato pertenece a otro proyecto, dicha consulta puede acumular importes ajenos. Ademas, el alcance territorial de Cobranza obtenia el nombre del proyecto desde `cobranza_proyectos` **solo con el FK**, lo que permitia asociar la zona de otro proyecto cuando el ID estaba desplazado.

Fase 3 añade una barrera de lectura entre las rutas de proyecto y el calculo legado, y fortalece el alcance existente. Se reutilizan el validador FK V001, la identidad de Fase 1 y las rutas/controladores de Fase 2. **No** se crean tablas, columnas, indices, usuarios, permisos ni nuevas fuentes de verdad.

## 2. Precondiciones estrictas

- Validador FK V001 ya aplicado y comprobado.
- Fase 1 instalada: `backend/src/services/cobranza-uni/identidad-proyecto.service.js`.
- Fase 2 instalada: `backend/src/controllers/cobranza-uni-relaciones-protegidas.controller.js`, rutas correspondientes y pruebas.
- En Aiven debe existir `proyectos_mantto.cobranza BIGINT UNSIGNED` vinculado de forma validada con `cobranza_proyectos`, y las tablas `gestion_credito`, `detalle_mp_2026`, `pc` y `portafolio` con el esquema ya usado por V001/Fases 1-2.
- Confirmar que los **tres archivos existentes** indicados abajo no recibieron cambios locales incompatibles desde `main` revisado. NO sobrescribir modificaciones ajenas sin compararlas.
- El detalle de proyectos no verificables puede devolver HTTP **409** hasta que se corrija su identidad. No desplegar sin validar este comportamiento con el area operativa.

## 3. Archivos incluidos

| Accion | Ruta desde raiz del repositorio |
|---|---|
| NUEVO | `backend/src/services/cobranza-uni/adeudos-proyecto-portafolio.service.js` |
| MODIFICADO / COMPLETO | `backend/src/modules/portafolio/portafolio.repository.js` |
| MODIFICADO / COMPLETO | `backend/src/modules/proyectos/proyectos.controller.js` |
| MODIFICADO / COMPLETO | `backend/src/services/cobranza-uni-scope.service.js` |
| NUEVO | `tests/cobranza-uni-integracion-portafolio-fase3.test.js` |
| NUEVO | `docs/README_FASE_3_INTEGRACION_COBRANZA_PORTAFOLIO_V001.md` |

**6 archivos; 3 existentes modificados, 3 nuevos.** No se incluyen archivos sin cambios.

## 4. Comportamiento de las consultas

### Detalle Proyecto de Portafolio

Se intercepta la respuesta final de estas rutas existentes (con sus Guards y alcance intactos):

- `GET /api/portafolio/proyectos/detalle/:proyecto`;
- `GET /api/proyectos/detalle/:proyecto`, `/api/proyectos/:proyecto`, `/api/proyectos/detalle?proyecto=...`;
- `GET /api/proyectos?detalle=1&proyecto=...`.

El handler previo sigue cargando equipos/tickets del proyecto respetando el alcance de Portafolio. Antes de responder, el nuevo servicio lee el nombre ORIGINAL desde los equipos ya autorizados y valida el FK de cabecera contra la Fase 1. No confia en el nombre publico ni en `MAX(id_proyecto_cobranza)` sin confirmacion del catalogo.

Si la identidad es unica y valida, consulta en GC, MP y `pc` **por nombre completo validado Y (FK correcto O FK NULL)**. Las filas del mismo nombre que tengan un FK contradictorio se cuentan como pendientes, pero no se suman. No se incorporan importes de filas de otro nombre solo por llevar el mismo FK.

El resumen completo queda validado solo si no hay operaciones con FK contradictorio dentro del nombre. No es una certificacion de inexistencia de alias no documentados. Una relacion legitima `1:N` (p.ej. un proyecto de Portafolio repartido entre dos IDs de Cobranza) permanece **ambigua** bajo el modelo escalar de Fase 1 y NO se reduce silenciosamente a `MAX(id)`.

**Atencion a la presentacion visual:** `core/details.js` (frontend vigente) transforma `null` en `$0` para las tarjetas financieras. Por eso, si la identidad falta, es ambigua o hay FK financieros contradictorios, **la ruta devuelve HTTP 409 y un mensaje legible**, en vez de renderizar cifras falsas. El detalle completo deja de estar disponible temporalmente en esos casos. Para un usuario autorizado con relaciones validas, la respuesta conserva el contrato anterior, equipos/tickets/metricas operativas y solo sustituye los valores de deuda.

Se devuelve un HTTP 503 controlado si falla la lectura de validacion; nunca se entrega el agregado anterior no validado como respaldo. Los mensajes publicos no contienen SQL ni cifras de otros proyectos. Los eventos se registran en log del backend.

### Alcance territorial de Cobranza UNITED

`backend/src/services/cobranza-uni-scope.service.js` **sigue usando los Guards y resolutores oficiales** de informacion. El calculo del nombre canonico del proyecto exige equivalencia entre nombre original, `proyectos_mantto`, `cobranza_proyectos` y FK (`NULL` solo en la rama de respaldo validado), nombres e IDs unicos, y sin FK contrario para el mismo nombre de Portafolio. Un FK antiguo equivocado no puede decidir el nombre o zona territorial de otro proyecto.

Las zonas continuan derivandose exclusivamente de equipos activos de Portafolio; se conserva la regla de excluir proyectos con equipos activos fuera de los cuartos autorizados y con zona nula. Los alcances amplios se conceden **unicamente** por el resolvedor oficial `hasUnrestrictedUnitedScope_gnral` (sin inferir privilegios por rol).

La normalizacion de filas de las listas GC/MP/VA descarta un nombre/zona "oficial" provenientes de un FK contradicho por el nombre original, conservando el campo legacy para trazabilidad.

### Fase 2 y advertencias de listado MP

El archivo `cobranza-uni-relaciones-protegidas.controller.js` de Fase 2 y sus banderas `adeudo_va_es_parcial` **no se reescriben en esta entrega**. En el listado MP, el frontend vigente aun no representa esas banderas visualmente. **Por tanto, el total VA del listado MP puede continuar visualizandose como subtotal sin advertencia** cuando haya pendientes. La entrega Fase 3 protege los detalles de proyecto, pero **NO cierra** la necesidad de un cambio visual especifico de MP en el frontend de Cobranza; dicho cambio no debe afirmarse como implementado. No se modifica `modules/cobranza-uni/cobranza-uni.js` (modulo visual existente) sin un fix dedicado probado.

## 5. Instalacion: PowerShell, sin git apply

Ejecutar desde un clon local actualizado y revisado. Antes de descomprimir, comparar cualquier cambio local en las tres rutas existentes:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\FASE_3_INTEGRACION_COBRANZA_PORTAFOLIO_V001.zip"
Set-Location $REPO

git status --short
if (-not (Test-Path 'backend\src\services\cobranza-uni\identidad-proyecto.service.js')) { throw 'Falta Fase 1' }
if (-not (Test-Path 'backend\src\controllers\cobranza-uni-relaciones-protegidas.controller.js')) { throw 'Falta Fase 2' }

$BACKUP = Join-Path $env:TEMP ('ManttoGestor_Fase3_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
foreach ($rel in @(
  'backend\src\modules\portafolio\portafolio.repository.js',
  'backend\src\modules\proyectos\proyectos.controller.js',
  'backend\src\services\cobranza-uni-scope.service.js'
)) {
  $to = Join-Path $BACKUP $rel
  New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $REPO $rel) -Destination $to -Force
}

Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force

node --check backend/src/services/cobranza-uni/adeudos-proyecto-portafolio.service.js
node --check backend/src/services/cobranza-uni-scope.service.js
node --check backend/src/modules/portafolio/portafolio.repository.js
node --check backend/src/modules/proyectos/proyectos.controller.js
node --test tests/cobranza-uni-fk-validator.test.js tests/cobranza-uni-identidad-proyecto-fase1.test.js tests/cobranza-uni-consultas-protegidas-fase2.test.js tests/cobranza-uni-integracion-portafolio-fase3.test.js

git diff --check
git status --short
```

Instalar el ZIP **no ejecuta** una migracion de BD, ni `git push`, ni `npm start`, ni despliega Azure o Netlify.

## 6. Plan de validacion preproduccion

1. En copia/local, comprobar que los cuatro conjuntos de tests pasan.
2. Con Aiven autorizado o restauracion equivalente, probar lectura de 1 proyecto con GC/MP/VA correctamente vinculados y montos conocidos (HTTP 200).
3. Probar un proyecto con FK desplazado como el caso historico de `CBRE Querétaro` (80 frente a 625): no debe sumar operaciones ajenas ni conceder zonas incorrectas.
4. Probar una relacion `1:N` (historicamente `Parque Jardin Comercial Torre A y B`, IDs 406 y 407): el endpoint de proyecto debe marcar pendiente, **nunca colapsar a MAX(407)**.
5. Probar proyecto con `cobranza NULL` y sin enlace: verificar el comportamiento bloqueado de HTTP 409 y evaluar el impacto operativo.
6. Verificar permisos autorizados y denegados para dos zonas operativas, casos con equipos fuera del alcance, y cuenta con llave maestra UNITED real.
7. Medir latencia/p95 y consultas SQL sobre base equivalente a produccion. **No se realizaron pruebas de rendimiento real** en esta entrega; el uso de `EXISTS`/`COUNT` correlacionados puede afectar la carga.
8. Comprobar el mensaje de error que el frontend vigente muestra para HTTP 409; no se ha validado E2E ni en navegador.
9. Solo tras superar estas verificaciones, promover el backend a Azure de forma autorizada.

## 7. Pruebas realmente realizadas en esta entrega

- 18 pruebas especificas Fase 3 con MySQL simulado (incluyen 409/503, ambiguedad 1:N, rutas alternativas, alcance territorial, valores financieros, suma segura, errores).
- Pruebas conjuntas Fase 1, Fase 2 y FK V001 simuladas: ver resultados reales de QA junto al paquete; **sin Aiven real**.
- `node --check` sobre JS modificados.
- `git diff --check` / verificacion de espacios en copia aislada.
- ZIP verificado por listado de entradas, CRC/`unzip -t` y ausencia de parches.

**No verificable aun:** funcionamiento en Azure, compatibilidad SQL ejecutada en servidor MySQL 8 real, E2E de interfaces, rendimiento productivo y efecto de comandos SQL aplicados hoy en Aiven.

## 8. Reversion y sistemas externos

El respaldo externo en `%TEMP%` permite restaurar **solo** los tres archivos existentes. Antes de borrar un archivo nuevo, confirmar que no tenga modificaciones posteriores propias. No revertir Fases 1/2 ni el FK validador V001 durante la reversion de esta fase. No se ejecuta SQL destructivo.

| Sistema | Estado |
|---|---|
| ZIP local generado | Si |
| GitHub remoto | No modificado |
| Aiven | No modificado |
| Azure | No modificado |
| Netlify | No modificado |

**Restriccion adicional:** este FIX solo debe promocionarse si el bloqueo temporal de detalles no verificados (HTTP 409) y la carga SQL quedan aceptados tras las pruebas con datos actuales.
