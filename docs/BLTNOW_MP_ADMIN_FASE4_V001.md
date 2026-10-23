# BLT NOW — UNITED > Cobranza > Administración > MP — Fase 4 V001

**Base técnica revisada:** `ziSirrush/GestorMantto`, `main`, commit `15c879e6ffa29701006fee74267332d1a29c1b48` (versión 102326.5, 23/oct/2026). Esta entrega se instala **encima de MP F1+F2+F3 LOCALES**; dichas fases no figuran en ese commit remoto. No se ha realizado commit, push, deploy ni escritura MySQL desde esta entrega.

## Objetivo

Implementar cálculo real en **backend** y previsualización segura de `detalle_mp_2026.monto_anual = iguala × factor_monto_anual`, sin sobrescribir los valores ya almacenados por Sheets/GAS. La fórmula compartida originalmente en Sheets fue `=K5*6`; el usuario aprobó factor configurable para evitar asumir que todos los contratos son ×6 o ×12. `factor_monto_anual` es `SMALLINT UNSIGNED NULL`, añadido por el usuario mediante ALTER previo.

## Comportamiento de la fase

1. `cobranza-uni-administracion.mp-formulas.js` opera en enteros BigInt de centavos, sin usar `Number` para importes. Evita pérdidas de precisión monetaria y rechaza resultados superiores a `DECIMAL(18,2)`.
2. Si el factor es NULL: `monto_anual` permanece **intacto**, no se inventa ×6 ni ×12 y el preview indica «Sin factor». Si falta `iguala`, muestra «Sin iguala» y conserva el valor actual. Factor `0`, fraccionario o superior a `65535` no se admite como valor de entrada.
3. `GET /api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros` añade `formula_preview` con `mode: preview_only`; `rows`, `columns` y `readonly:true` existentes permanecen compatibles. La vista previa usa **exclusivamente las filas que ya pasaron el scope UNITED oficial y el permiso VER**, sin nuevos JOIN, consultas por proyecto ni BUSCARV textual.
4. La interfaz Excel muestra **valor persistido y valor previsto por separado**, etiqueta «no guardado» y observación cuando difieren. En el campo `pendiente` solo se añade una **comparación informativa** con `pendiente_corriente + pendiente_vencido`: **no es una fórmula confirmada en Sheets**, ya que `P` usaba BUSCARV; no se recalcula ni actualiza `pendiente`.
5. Se prepara `factor_monto_anual` como quinto campo editable futuro. **La escritura real sigue cerrada** porque `MP_RULES_UNI.writesEnabled === false`, además de las tres puertas `MP_ADMIN_EDIT_ENABLED`, `MP_ADMIN_GAS_CUTOVER_CONFIRMED` y `MP_ADMIN_GC_VA_MP_RECONCILED`. No activar flags ni modificar contrato para apertura en esta fase.
6. En las **simulaciones unitarias únicamente** (inyección interna `featureEnabled:true`), modificar el factor efectúa `SELECT ... FOR UPDATE` con alcance y proyecto verificado; factor y monto calculado se actualizan en un **solo UPDATE**, seguido de auditoría `AUDITAR_CAMBIO` de los valores originales, finales y derivados, dentro de la misma transacción. Cualquier fallo revierte íntegramente. Factor NULL o iguala NULL preserva monto.
7. Otros campos derivables mediante BUSCARV siguen bloqueados hasta validación de relación `id_dmp` con `detalle_mp_2026_zona_1` en F5. El GET no consulta Zona 1, no introduce otra fuente de verdad y no resuelve coincidencias solo por nombre.

## Alcance y seguridad

- Se mantienen los guards: sesión, MAIN, `COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.VER` para GET, `.EDITAR` adicional para PATCH, `UNITED`, `COBRANZA_UNI`, alcance de zonas y validación canónica por registro.
- El frontend no calcula fórmulas, no decide alcances ni permite guardar por tener botones locales.
- Ninguna escritura nueva en Aiven. No se modifica `detalle_mp_2026_zona_1`, GAS, GC, VA, `usuario_interacciones`, permisos globales, configuración Azure, GitHub o Netlify.
- Los cambios de la UI son exclusivos de `modules/cobranza-uni/administracion/mantenimiento-preventivo`.

## Archivos de Fase 4, respecto a F3

**Nuevo:**
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas.js`
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase4.test.js`

**Modificados:**
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-service.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-service.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-audit.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js`
- `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js`
- `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css`
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase2.test.js` (adapta mock GET al nuevo campo `formula_preview`)
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase3.test.js` (adapta mock y deja whitelist F3 histórica distinguible de F4)
- Este documento y README Fase 4.

## Validación

- `node --test` ejecutado sobre pruebas F1 administración, VA F1, MP F1, MP F2, MP F3, MP F4: **61/61 aprobadas** en copia local aislada.
- `node --check` en los archivos JS afectados: sin errores.
- F4 específicamente: **16/16 pruebas** con motor BigInt, factores, ausencia de factor, salida fuera de rango, verificación de cartera orientativa, IDs ambiguos, scope de GET, simulación de UPDATE/auditoría/rollback y UI.
- No son pruebas de integración real, E2E, consultas directas a Aiven ni CI sobre repositorio completo; probar al integrar con checkout local siguiendo el README.

## Posterior

**Fase 5:** integrar lectura de `detalle_mp_2026_zona_1` y sus 12 bloques de facturación, únicamente tras enlazar por `id_dmp` verificado. No conciliar por texto `PROYECTO`; la carga inicial y los criterios de importación se deben coordinar antes de conectar los BUSCARV.
