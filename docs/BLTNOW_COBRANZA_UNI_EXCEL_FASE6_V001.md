# BLT NOW — Cobranza UNITED > Administración — Excel Fase 6/6 V001

**Corte de revisión:** 23 de octubre de 2026. **Repositorio de referencia:** `ziSirrush/GestorMantto`, rama `main`, commit **`58f590d98c74d15ef944cc44056d1884c75dda29`** (versión 102326.9). **Estado:** FIX local de cierre, no desplegado, **requiere F1 → F2 → F3 → F4 → F5 V001 previamente aplicadas**.

## Alcance y resultado

Esta fase revisa la integración completa sin reescribir GC. Los tres editores principales comparten la interacción de hoja Excel: **doble clic / Enter** para editar una celda autorizada, **Enter o desenfoque** para intentar guardar, **Escape** para cancelar, recarga después de confirmación y edición múltiple limitada a veinte registros. MP es el único con pestañas **MP / Zona 1**; Zona 1 tiene 128 columnas y una lista blanca de 108 campos de facturación, no edita llaves ni datos heredados. Se conservan los cálculos, permisos, alcances y auditorías específicos de cada tabla.

### Correcciones finales aplicadas en F6

1. **Consistencia de permisos:** el contrato `GET /contrato` ahora calcula `can_write_zone1` con `zone1ExcelWriteEnabled_uni()`, **igual que** `GET /tablas/:tabla/acceso`. Antes usaba la puerta antigua `zone1WriteEnabled_uni()` (permanentemente cerrada para altas/vínculos), contradiciendo la puerta Excel introducida en F5. Ambas respuestas exigen MP.VER + MP.EDITAR, contexto no suplantado, `can_edit` y puerta global activa. Se elimina `can_prepare_zone1` de estas respuestas porque el editor Excel ya no utiliza el flujo de preparación; los endpoints legacy siguen intactos.
2. **Interacción sin carreras:** VA impide guardar lotes y aplicar filtros/navegación mientras hay una edición fantasma activa; el formulario de búsqueda llama `preventDefault()` incluso cuando hay editor activo, y Escape vuelve a habilitar el lote. MP impide navegación/filtros del componente principal mientras edita una celda. Zona 1 mantiene su exclusión de acciones simultáneas.
3. **Limpieza de código demostrablemente redundante:** se retiran `visible()` (VA), `visibleColumns()` (MP), `currentEditor()` (Zona 1), etiquetas antiguas, referencias a `can_prepare_zone1` y textos de `edit_policy` que describían un corte pasado. **No se eliminan** contratos o consultas sin comprobar consumidores.
4. **Caché frontend:** se actualizan las versiones `?v=` de los tres JS modificados (VA, MP, Zona 1) en el cargador de Administración, manteniendo el JS/CSS de GC sin cambios.
5. **Cobertura:** se incorpora prueba F6 de concordancia del contrato, permisos de zona, flujo de edición concurrente, tabs, SQL paginado y caché. Las pruebas históricas editadas solamente actualizan expectativas obsoletas.

## Auditoría de consultas SQL y dependencias

| Superficie | Hallazgo respaldado en código | Decisión F6 |
|---|---|---|
| GC principal | `COUNT` y `SELECT` paginado con alcance; módulo de referencia congelado. | No modificar. |
| VA (`pc`) | Constructor de consultas con `COUNT` y `SELECT` paginado, y cálculo/relaciones temporales de backend para vistas previas. No se debe eliminar una de estas consultas sin sustituir su funcionalidad. | Mantener; no introducir consulta extra. |
| MP principal | Consulta con lista blanca/alcance y motor de edición con concurrencia y auditoría. | Mantener. |
| MP → Zona 1 Excel | `COUNT(*)` + `SELECT ... LIMIT ? OFFSET ?` con `INNER JOIN` por **id_dmp**, filtros whitelist, identidad y territorio verificados. Carga diferida desde la pestaña; no consulta por registro (N+1). | Mantener. |
| Zona 1 edición múltiple | `SELECT ... FOR UPDATE` sobre un lote de 2–20 IDs con el alcance autorizado, `UPDATE` y auditoría en transacción. | Mantener; necesario para integridad. |
| Legacy Zona 1 | `GET` de detalle individual y rutas POST de preflight/alta/vínculo nacidas antes de la tabla Excel. No aparecen como consumidores en el frontend Excel auditado, pero no se han comprobado clientes externos, scripts o integraciones históricas. | **Conservar por compatibilidad**, bajo sus puertas de seguridad. Marcar para evaluación de retirada *solo* con inventario de consumidores, métricas de acceso y aprobación. |
| F8 importador Sheets→Aiven | Flujo puntual y separado del editor humano. | Conservar sin intervención, sin activar la importación. |

**No puedo confirmar esto:** que no existan consumidores externos de los endpoints legacy, que todas las consultas históricas estén ausentes de producción o que se haya conciliado Aiven con las hojas GAS. Por ello **no se borran tablas, endpoints, funciones SQL ni índices a ciegas**. La limpieza F6 elimina únicamente código frontend efectivamente sin uso y referencias inconsistentes.

## Seguridad y habilitación

- **Sin cambios de BD, estructura, GAS ni activadores.** El usuario informó que los activadores están apagados, pero F6 **no verificó el estado operativo** de GAS ni conciliación de datos.
- La puerta independiente de Zona 1 Excel **sigue deshabilitada por defecto**; para habilitarla, en una operación futura y **solamente tras autorización, respaldo, conciliación y verificación de corte GAS**, el backend requiere simultáneamente:

```text
MP_ADMIN_ZONA1_EXCEL_EDIT_ENABLED=true
MP_ADMIN_GAS_CUTOVER_CONFIRMED=true
MP_ADMIN_GC_VA_MP_RECONCILED=true
```

- Adicionalmente, `MP_ADMIN_EDIT_ENABLED` no debe estar expresamente apagada y el backend valida MAIN + MP.VER + MP.EDITAR, identidad y alcance UNITED, contexto humano efectivo, `expected`, transacción y auditoría. Los `POST` legacy continúan protegidos por su propia puerta distinta.
- VA y MP principal en la versión 102326.9 emplean puertas de apagado de emergencia (`PC_ADMIN_EDIT_ENABLED=false` / `MP_ADMIN_EDIT_ENABLED=false`), **no** prueban la conciliación GAS por sí solos. No se cambiaron esos valores.

## Archivos completos en ZIP F6 (delta, sin repetir F1–F5)

- MOD `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js`
- MOD `modules/cobranza-uni/administracion/main/main.js`
- MOD `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo-zona1.js`
- MOD `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js`
- MOD `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js`
- MOD `tests/cobranza-uni-administracion-excel-fase2.test.js`
- MOD `tests/cobranza-uni-administracion-excel-fase3.test.js`
- MOD `tests/cobranza-uni-administracion-excel-fase4.test.js`
- MOD `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase6.test.js`
- MOD `tests/cobranza-uni-administracion-venta-adicional-fase2.test.js`
- NUEVO `tests/cobranza-uni-administracion-excel-fase6.test.js`
- NUEVO `docs/BLTNOW_COBRANZA_UNI_EXCEL_FASE6_V001.md`
- NUEVO `README_FASE6_EXCEL.txt`

## Validaciones, evidencia y pendientes

- `node --check` de los JS editados: **sin errores**.
- Pruebas **locales del laboratorio parcial F1–F6 + MP F1–F8** ejecutadas con Node y mocks: **203 casos, 202 aprobados, 0 fallidos, 1 omitido** (fuente GC no incluida en la copia parcial). **F6 nueva: 7/7 aprobadas.** Comprobaciones reproducibles desde ZIP reextraído.
- Dos suites VA históricas no pueden ejecutarse con este laboratorio parcial porque faltan dependencias de backend VA/GC que **sí están en GitHub**. En el repositorio completo deben ejecutarse `npm test` (raíz si aplica), `npm run check` y `npm test` (backend). **CI completo NO ejecutado ni aprobado con este ZIP**.
- La rama `main` versión 102326.9 tiene un antecedente **fallido** de GitHub Actions para Azure (5 pruebas fallidas, 1,176 aprobadas) antes de los deltas F1–F6: https://github.com/ziSirrush/GestorMantto/actions/runs/40038233404 . El frontend Pages de ese commit publicó, pero esto **no prueba** que el backend actual haya desplegado ni que el FIX F6 esté en producción.
- **Pendientes de cierre productivo:** pipeline GitHub Actions completo en repositorio con F1–F6 aplicadas, revisión de diferencias contra `main` vigente antes de commit, E2E de navegador, permisos reales por rol/empresa, reconciliación con Aiven/GAS, habilitación autorizada y validación posterior al despliegue. No se declara un pase productivo.
- Ningún archivo `.patch`, instalador, migración o script SQL entregado. **No se modificaron GitHub, Aiven, Azure, Netlify ni GAS.**

**Secuencia:** aplicar F1→F5 locales y luego F6; ejecutar validaciones en repo completo; resolver cualquier CI antes de solicitar autorización de publicación.
