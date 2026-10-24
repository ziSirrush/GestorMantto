# BLT NOW — Cobranza UNITED > Administración — Fase 4/6 V001

**Fecha:** 23/10/2026.  
**Repositorio fuente:** `ziSirrush/GestorMantto` rama `main`, SHA base **`58f590d98c74d15ef944cc44056d1884c75dda29`** (versión 102326.9).  
**Precondición:** Fases Excel **F1, F2 y F3** aplicadas en este orden a un repositorio local y sin otras modificaciones en los archivos que sobrescribe esta entrega.  
**Alcance:** solo **Mantenimiento Preventivo (MP) / pestaña Zona 1**. No se modifica la funcionalidad de GC/VA ni la estructura de MySQL.

## Qué cambia

1. **Una sola navegación de dos pestañas en MP:** `MP` y `Zona 1`, con roles `tablist`, `tab` y `tabpanel` y estado accesible. Las tablas GC y VA continúan sin pestañas.
2. **MP principal:** conserva la tabla Excel de 20 columnas de F3, edición fantasma, formulario de filtros, ordenamiento, edición múltiple, fórmulas informativas y conciliación.
3. **Zona 1:** sustituye el antiguo modal por **tabla horizontal Excel, 128 columnas**, filtros por columna, búsqueda, ordenamiento, paginación de 15/25/50 filas y columnas protegidas identificadas. Contiene **16 campos generales, 12×9 campos de facturación y 4 campos técnicos**; muestra únicamente filas vinculadas y verificadas. El componente se carga únicamente al abrir la pestaña por primera vez.
4. **GET nuevo** `GET /api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1/registros`: respuesta `readonly:true`, columnas y datos tipados del contrato, `total/pages/page/page_size` y `identity_verified:true` (por filas filtradas en el servidor). **No tiene métodos de escritura.**
5. **Limpieza efectiva en el frontend de MP:** eliminados el botón por registro para abrir Zona 1, modal lateral, handlers de preflight/alta/vínculo/cambio, código de evaluación sin consumidores, y CSS antiguo del modal. **No se eliminaron consultas ni rutas backend de las que no se conoce exhaustivamente el consumo**; se auditarán en F6.

## Seguridad y diseño de datos

- La ruta exige la guarda existente **sesión + MAIN + puerta UNITED/COBRANZA_UNI** y comprueba explícitamente **MP.VER** por identidad efectiva. `EDITAR` por sí solo no habilita la lectura.
- El servicio comprueba contexto `informationAccess` UNITED y usa **`buildCobranzaProjectScopeSql_uni(req,'mp')`** y **`canonicalProjectSql_uni('mp')`**. Ante fallo de cualquiera, responde 403 antes de abrir conexión.
- El **JOIN es exclusivamente** `mp.id_dmp = z.id_dmp`. El nombre del proyecto nunca se usa como llave. Además, la consulta requiere proyecto no vacío y coincidente, **IDNS no vacío y coincidente**, y rechaza cliente discordante cuando ambas filas lo contienen; esto puede ocultar relaciones incompletas, que deben revisarse, **sin mostrarlas por adivinación**.
- SQL de solo lectura: **un `COUNT(*)` y, si aplica, un `SELECT` paginado** por página. Parámetros validados, columnas de filtro y orden según whitelist oficial de 128 columnas, valores de `LIKE` escapados y enlazados como parámetros; no hay consulta por cada fila, UPDATE/INSERT/DELETE ni lectura global no acotada por identidad y territorio.
- Las claves `id_mp_zona_1`/`id_dmp` se convierten a texto para evitar pérdida de precisión de BIGINT en JavaScript. El frontend comprueba la forma y las 128 columnas antes de presentar la página y escapa HTML.
- Se mantiene el endpoint anterior por id_dmp y las rutas de preflight/alta/vínculo/escritura **únicamente como compatibilidad temporal**; el frontend de F4 **no las llama**. Una retirada definitiva requiere auditoría de consumidores y pruebas completas (F6).
- Zona 1 es **solo consulta en F4**: la **edición fantasma, concurrencia, auditoría y edición múltiple de Zona 1** serán parte de **F5**. **No abrir escritura saltando el contrato `MP_RULES_UNI`.**

## Archivos del delta de F4

| Tipo | Ruta |
|---|---|
| MOD | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` |
| NUEVO | `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-grid.js` |
| MOD | `modules/cobranza-uni/administracion/main/main.js` (cache-bust MP, carga del subcomponente) |
| MOD | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js` |
| MOD | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css` |
| NUEVO | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo-zona1.js` |
| MOD | `tests/cobranza-uni-administracion-excel-fase1.test.js` |
| MOD | `tests/cobranza-uni-administracion-excel-fase3.test.js` |
| MOD | `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase5.test.js` |
| MOD | `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase6.test.js` |
| NUEVO | `tests/cobranza-uni-administracion-excel-fase4.test.js` |
| NUEVO | `docs/BLTNOW_COBRANZA_UNI_EXCEL_FASE4_V001.md` |
| NUEVO | `README_FASE4_EXCEL.txt` |

En las pruebas históricas F5/F6 únicamente se reemplazaron **expectativas del modal de Zona 1 y preflight visual ya retirado**. Las comprobaciones originales de autorización backend, protecciones de escritura, transacciones y auditoría permanecen.

## Validación y límites

- **Pruebas locales de la copia F1–F4 (Node con mocks): 177 casos, 176 aprobados, 0 fallidos, 1 omitido** porque el JS de GC no está en el subconjunto de archivos; los **14/14 casos nuevos de F4** están aprobados. Incluye SQL seguro, rechazo de alcance/identidad, 128 campos, un máximo de dos consultas por página, protección de rutas, XSS, filtros, orden, paginación, race/destroy, navegación de pestañas y limpieza visual.
- `node --check` validado para JS nuevo y modificado; contenido del ZIP reextraído y probado sobre la base F1–F3.
- **No confirmado:** pruebas E2E en navegador real, conexión real a Aiven, permisos en usuarios reales, comparación SQL contra la base actual, CI completo de GitHub o despliegue de Azure.
- El usuario reportó activadores GAS desactivados; **no puedo verificar ese estado remoto**. No se modifican GAS ni sus activadores, ni se habilitan endpoints de escritura de Zona 1.
- No se ejecutaron commits, cambios de rama, push, migraciones, cambios Aiven ni despliegues en GitHub Pages/Azure/Netlify.

**Fuentes de referencia:** GitHub `ziSirrush/GestorMantto` commit `58f590d98c74d15ef944cc44056d1884c75dda29`; Constitución de Mantto Gestor v2.0 del proyecto, documentación de F1–F3 y especificación física MP Zona 1 existente.

**Siguiente fase:** F5 — edición fantasma auditada de Zona 1, con puertas de seguridad, concurrencia y confirmación del servidor. Después, F6 — auditoría final de consumidores, SQL y pruebas integrales.
