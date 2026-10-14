# MANTTO GESTOR — FASE 1 / 3 — Identidad segura de Cobranza United V001

**Fecha:** 13/10/2026

**Repositorio revisado:** `ziSirrush/GestorMantto`, rama `main`

**Commit base verificado:** `f1b1f4e4519835cea049e8d1aa8797df7168cab5`

**Tipo de entrega:** ZIP incremental de **archivos completos**, con rutas originales. **No** es `.patch`.

## 1. Causa y objetivo

Las pantallas de GC, MP y Venta Adicional ejecutan filtros del tipo `id_proyecto_cobranza = ? OR proyecto = ?`. Si una operación contiene un ID desplazado, ese `OR` puede agregar registros e importes de otro proyecto. El validador de FK **V001** ya instalado corrige las inconsistencias resolubles, pero no sustituye un filtro seguro de lectura cuando quedan casos pendientes o ambiguos.

**Esta fase incorpora solamente una capa de identidad de lectura, reutilizable por Fases 2 y 3.** No cambia todavía las consultas activas, endpoints, pantallas, permisos, esquemas ni datos. Los motores de catálogos y el validador V001 quedan intactos.

## 2. Archivos incluidos en el ZIP

| Tipo | Ruta exacta dentro del repositorio |
|---|---|
| NUEVO | `backend/src/services/cobranza-uni/identidad-proyecto.service.js` |
| NUEVO | `tests/cobranza-uni-identidad-proyecto-fase1.test.js` |
| NUEVO | `docs/README_FASE_1_VALIDACION_IDENTIDAD_COBRANZA_UNI_V001.md` |

**No hay archivos modificados preexistentes** ni archivos completos del proyecto fuera de esta fase.

## 3. Contrato funcional

El servicio recibe `{ proyecto, idProyectoCobranza }` y consulta **sin escrituras**:

1. `proyectos_mantto` para obtener la llave oficial `cobranza`;
2. `cobranza_proyectos` para comprobar existencia y que el **nombre sea idéntico binariamente** al catalogado;
3. unicidad del nombre ignorando **únicamente** mayúsculas y espacios externos (`utf8mb4_0900_as_ci`), sin suponer alias o diferencias de acentos;
4. unicidad del ID en `proyectos_mantto`;
5. `portafolio.id_proyecto_cobranza` para **bloquear casos de un mismo nombre asociado a dos IDs**, como los proyectos repartidos por secciones, y las contradicciones frente a `proyectos_mantto.cobranza`.

Estados de éxito:

- `VALIDO`: nombre, catalogos y el ID recibido corresponden al mismo proyecto.
- `VALIDO_SIN_ID`: la identidad del nombre es única y corroborada, pero el registro seleccionado todavía no tiene ID.

Estados de bloqueo: `SIN_NOMBRE`, `NOMBRE_INVALIDO`, `SIN_MAPEO`, `NOMBRE_AMBIGUO`, `SIN_ID_COBRANZA`, `ID_COMPARTIDO`, `CATALOGO_INCOMPLETO`, `CATALOGOS_CONTRADICTORIOS`, `PORTAFOLIO_MULTIPLE_IDS`, `PORTAFOLIO_ID_CONFLICTO`, `ID_ORIGEN_INVALIDO` e `ID_ORIGEN_CONFLICTO`. Los errores SQL fallan cerrado: no se produce identidad autorizada.

**Importante:** si un mismo proyecto tiene verdaderamente varios IDs correctos, el sistema **no elige uno** ni crea equivalencias nuevas. Exige revisión explícita de la relación estructurada. Fase 1 no modifica ninguna relación existente.

## 4. Construccion de filtros (uso en Fases 2 y 3)

```js
const identidadUni = require('../services/cobranza-uni/identidad-proyecto.service');

const identidad = await identidadUni.resolverIdentidadProyecto_uni({
  proyecto: row.proyecto,
  idProyectoCobranza: row.id_proyecto_cobranza
});

const filtro = identidadUni.construirFiltroIdentidadProyecto_uni('mp', identidad);
// filtro.sql es '1 = 0' si hay conflicto.
// En caso valido, filtro.params = [nombreOficial, idCorrecto].
// Integrar: WHERE ${filtro.sql} AND ${scopeDePermisos}
```

La forma protegida del WHERE es conceptualmente:

```sql
WHERE
  TRIM(registro.proyecto) COLLATE utf8mb4_0900_as_ci
    = TRIM(?) COLLATE utf8mb4_0900_as_ci
  AND (
    registro.id_proyecto_cobranza = ?
    OR registro.id_proyecto_cobranza IS NULL
  )
  AND <ALCANCE_HUMANO_AUTORIZADO>
```

- El **nombre oficial y el ID** son producidos por la resolución validada, nunca enviados directamente al filtro desde el frontend.
- No basta con falsificar un objeto JS: el filtro solo acepta un objeto que haya salido de una resolución exitosa del servicio en el proceso actual.
- El nombre solo puede dar respaldo a filas con FK **NULL**; filas con FK no nulo **contradictorio** quedan excluidas.
- El servicio **no sustituye** `humanInformationGuard_gnral`, `buildCobranzaProjectScopeSql_uni` ni el alcance `alcance_uni`; ambos deben mantenerse con `AND`.
- Las rutas actuales todavía NO consumen esta capa: esa conexión corresponde a la **Fase 2** y la protección de Portafolio a la **Fase 3**.

## 5. Instalacion local (Windows PowerShell)

En un repositorio cuya versión tenga el validador V001 ya aplicado:

```powershell
$REPO = "C:\Users\T14s\Downloads\mantto_gestor_frontend"
$ZIP = "$env:USERPROFILE\Downloads\FASE_1_VALIDACION_IDENTIDAD_COBRANZA_UNI_V001.zip"

Set-Location $REPO
git status --short

# Antes de sobrescribir, confirmar que los 3 archivos nuevos no existan.
Test-Path '.\backend\src\services\cobranza-uni\identidad-proyecto.service.js'
Test-Path '.\tests\cobranza-uni-identidad-proyecto-fase1.test.js'
Test-Path '.\docs\README_FASE_1_VALIDACION_IDENTIDAD_COBRANZA_UNI_V001.md'

# Los tres Test-Path deben devolver False para esta primera instalacion.
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force

node --check backend/src/services/cobranza-uni/identidad-proyecto.service.js
node --check tests/cobranza-uni-identidad-proyecto-fase1.test.js
node --test tests/cobranza-uni-identidad-proyecto-fase1.test.js
node --test tests/cobranza-uni-fk-validator.test.js
git diff --check
git status --short
```

**No** se ejecuta `git apply`. `Expand-Archive` conserva las rutas y no elimina archivos ajenos. No sustituir una copia local modificada sin revisarla.

## 6. Validaciones ejecutadas en la entrega

- Sintaxis Node.js: correcta para el servicio y el test.
- Pruebas del helper con base de datos simulada: **22/22 aprobadas**.
- Pruebas conjuntas con copia local del validador V001: **33/33 aprobadas**, tambien con MySQL simulado.
- `git diff --cached --check` en una copia de verificacion aislada: **sin errores**.
- Se examino la estructura de `proyectos_mantto` y la regla de mapeo del SQL V003.
- **No se ejecuto** la consulta contra Aiven real o laboratorio MySQL.
- El archivo requiere **MySQL 8 con las colaciones `utf8mb4_0900_*`**, como la V003 existente.
- El validador V001 permanece instalado de forma independiente; se recomienda ejecutar su prueba existente localmente.

## 7. Pendientes y limites

- **Fase 2:** conectar las consultas GC/MP/VA al servicio nuevo y aplicar `AND` con los Guards oficiales; pruebas de adeudos y no contaminación entre proyectos.
- **Fase 3:** proteger los sumarios de adeudo del Detalle Proyecto de Portafolio y revisar la resolución del alcance territorial para que un ID erróneo nunca influya en un `scope`.
- Revalidar con Aiven y permisos reales antes del despliegue a Azure.
- Esta fase **no crea tablas, índices, columnas ni endpoints**; no necesita migración.
- Si `proyectos_mantto` no está disponible o la consulta falla, no existe resolución confiable. No se puede confirmar el estado real de Aiven desde este paquete.

## 8. Estado externo y reversión

| Sistema | Estado de esta entrega |
|---|---|
| Archivos generados en ZIP | SI |
| GitHub | SIN MODIFICACIONES |
| Aiven | SIN MODIFICACIONES |
| Azure | SIN MODIFICACIONES |
| Netlify | SIN MODIFICACIONES |

Como la Fase 1 solo **añade tres archivos**, se revierte quitando esos tres archivos en la copia local, únicamente si no existen cambios propios posteriores sobre ellos. No requiere `ROLLBACK` de datos: no se ejecuta SQL de escritura.
