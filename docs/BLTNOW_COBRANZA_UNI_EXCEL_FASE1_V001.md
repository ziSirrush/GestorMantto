# BLT NOW — Cobranza UNITED · Administración — Fase 1/6

**Versión:** V001 · **Fecha de referencia:** 23/10/2026 · **Estado:** base técnica y depuración segura del selector, sin migrar todavía las tablas.  
**Código inspeccionado:** `ziSirrush/GestorMantto`, rama `main`, commit `58f590d98c74d15ef944cc44056d1884c75dda29` (versión `102326.9`).  
**GitHub:** https://github.com/ziSirrush/GestorMantto/commit/58f590d98c74d15ef944cc44056d1884c75dda29

## 1. Decisión funcional cerrada

- **GC es la referencia.** No modificar `gestion-credito.js` ni su editor funcional.
- **GC, VA y MP:** una única tabla tipo Excel para la vista principal, sin diálogo de edición individual. Doble clic en celda editable o Enter sobre celda con foco → editar *dentro* de la celda → Enter/blur guarda por backend; Escape cancela. No simular guardado local.
- **VA:** eliminar grupos/tabs de navegación interna; una tabla con columnas existentes, filtros, orden, búsqueda, paginación, selección y edición por celda.
- **MP:** el **único módulo con pestañas internas**: `Mantenimiento Preventivo` y `Zona 1`; no confundirlas con los grupos actuales de columnas de MP.
- **Zona 1:** segunda pestaña con tabla paginada/filtrada, edición fantasma y los 12 bloques de facturación (128 columnas totales, 12×9 de factura). Las operaciones se anclan mediante `id_dmp` y la PK `id_mp_zona_1`; no vincular por el texto del nombre del proyecto.
- **Selección múltiple:** máximo 20 registros, con control de concurrencia por valor anterior (`expected`), transacción y auditoría; para Zona 1 hay que desarrollarla/validarla porque su servicio actual prepara la edición por celda, no el lote equivalente a GC.
- **Permisos:** `MAIN` + `VER` + `EDITAR` propios de la tabla, sesión efectiva, puerta UNITED y alcance por registro. Nunca permitir editar derivados, PK, FK o datos fuera de alcance. Modo visor de solo lectura.
- **Después de guardar:** refrescar selectivamente la tabla y mostrar resultado real; no actualizar solo la UI si Aiven rechaza la mutación.

Archivo de contrato estructurado: `docs/BLTNOW_COBRANZA_UNI_EXCEL_CONTRATO_V001.json`.

## 2. Evidencia del código actual (main 102326.9)

| Elemento | Estado verificado | Acción prevista |
|---|---|---|
| `modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js` | Doble clic/Enter/Escape/blur, input en `td`, `PATCH` con `changes/expected`, lote. | Mantenerlo como referencia. |
| `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js` | La versión .9 **ya añadió** edición en celda, pero coexisten lógica y DOM de ventana modal y botones de grupos. | F2: converger totalmente a GC y eliminar elementos sin consumidores. |
| `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js` | La versión .9 **ya añadió** edición en celda, pero conserva markup modal, grupos de columnas y panel de Zona 1 en vez de pestaña. | F3–F4: converger a GC y crear las dos pestañas; conservar fórmulas/relación. |
| CSS de VA/MP | La versión .9 cambió JS sin añadir reglas específicas comprobables para `.cua-pc-edit-input` / `.cua-mp-edit-input`; conserva estilos del modal antiguo. | F2/F3: estilos Excel responsivos y retirar CSS huérfano tras verificar referencias. |
| `backend/...mp-zona1-write-service.js` | `zone1WriteEnabled_uni()` sigue cerrada por `MP_RULES_UNI.zone1WritesEnabled===false` y `gasSyncRemainsActive===true` en contrato. | F5: evaluar y habilitar con autorización efectiva; **desactivar activadores GAS no equivale a habilitar estas escrituras**. |
| `backend/...mp-zona1-service.js` | GET existente por `id_dmp` individual con identidad/alcance verificados; **no** existe todavía tabla global paginada de Zona 1 a través de MP. | F4: preparar lectura autorizada por tabla sin exposición de filas huérfanas o ajenas. |
| `modules/cobranza-uni/administracion/main/main.js` | Incluía metadatos `phase` no consumidos, etiquetas «GAS activo» que contradicen la situación declarada por el usuario y placeholder inalcanzable. | **F1:** limpiar solo esas etiquetas, metadata y ruta muerta; reutilizar mismo guard y carga de módulos. |

**GAS:** el usuario informó activadores desactivados. No se ha inspeccionado el estado real de Apps Script desde aquí; **no puedo confirmar** su desactivación efectiva ni la conciliación de GC/VA/MP. La Fase 1 no altera las banderas de escritura ni las conexiones con Sheets.

## 3. Inventario de depuración (no borrar sin rastrear consumidores)

| Candidato | Ubicación | Evidencia/criterio | Fase |
|---|---|---|---|
| `phase` sin uso y texto fijo «GAS activo» | `administracion/main/main.js` | El selector consume `label/icon/description`, no `meta.phase`; el backend ya expone `can_edit`. | **Eliminado F1**. |
| Placeholder genérico de tabla sin adaptador | `administracion/main/main.js` | El catálogo actual admite solo GC, VA y MP, los tres retornan desde su adaptador. | **Eliminado F1**; error cerrado si crece catálogo. |
| Función `showDialog()` para editar VA | `venta-adicional/venta-adicional.js` | Análisis de ocurrencias en .9: declaración sin llamada detectada. | F2 (confirmar uso externo y quitar junto a modal). |
| Marcadores `data-pc-dialog`, select/input de edición de modal, CSS del overlay | VA JS/CSS | Quedaron tras introducir `beginCellEdit()` / `saveCellEdit()` en .9. | F2; conservar **modal de alta** si tiene consumidores reales. |
| Botones de grupos `data-pc-group` | VA JS/CSS | Incompatibles con una sola tabla sin pestañas. | F2 después de conservar filtros/columnas en una sola vista. |
| Marcadores `data-mp-dialog`, formulario/modal de edición | MP JS/CSS | Quedaron después de `openEdit(td)` con input en celda. | F3. |
| Botones de grupos `data-mp-group` | MP JS/CSS | Sustituir por dos pestañas MP/Zona 1, no secciones de columnas. | F3–F4. |
| Panel de Zona 1 y preflight de edición sin guardar | MP JS/CSS y backend | **En uso** hoy; no eliminar hasta existir pestaña, GET y PATCH definitivos. | F4–F5. |
| Consultas/previews/cálculos de VA, MP y conciliación | Servicios backend | **No hay prueba** de que estén huérfanos; algunos alimentan fórmulas y auditoría. No eliminar por intuición. | F2–F6: mapa de consumidores, pruebas, y solo después retiro de SELECTs duplicados. |

**No se borró ninguna consulta SQL en F1:** faltaría identificar exhaustivamente cada consumidor de backend/GAS y comparar resultados reales. Este límite evita destruir la integración por una limpieza superficial.

## 4. Registro del CI previo y criterio de cierre

La ejecución de GitHub Actions para la versión `.9` (`https://github.com/ziSirrush/GestorMantto/actions/runs/40038233404`) reportó **1,176 pruebas aprobadas / 5 fallidas**, `deploy` Azure omitido. Fallan expectativas históricas de F3/F4 MP («PATCH siempre apagado»), F3 VA («PATCH apagado») y un test MP que esperaba botones/modal en lugar de edición en celda. **La Fase 1 corrige esas cinco expectativas obsoletas en tres archivos de prueba**, sin eliminar casos ni su cobertura: ahora se comprueba el bloqueo con `*_ADMIN_EDIT_ENABLED=false`, el estado habilitado de `.9` y la edición directa de MP con valor previo. El **CI completo sigue pendiente** hasta que se aplique el ZIP en el repositorio real y se ejecute GitHub Actions.

La Fase 1 incluye un contrato verificable, pruebas nuevas sobre el selector y el modelo Excel, y ajustes de tres suites heredadas al estado de `.9`. Las pruebas no sustituyen una ejecución completa del CI o E2E. Quedan para las fases siguientes los E2E con permisos reales, el flujo Zona1/MP y la comparación contra Aiven.

## 5. Plan de implementación restante (sin mezclar fases)

1. **F1 (esta entrega):** contrato único, inventario verificable, limpieza segura del `main` y pruebas del selector.
2. **F2:** VA = tabla Excel de GC; retirar modal de edición, grupos y CSS muerto, conservar alta y fórmulas activas; actualizar tests VA.
3. **F3:** MP = tabla Excel de GC; retirar modal, grupos y CSS muerto, conservar cálculos/filtrado; actualizar tests MP.
4. **F4:** MP incorpora solo pestañas `MP` / `Zona 1`; tabla Zona 1 autorizada, paginada, sin relación por nombre.
5. **F5:** edición fantasma auditada de Zona 1, concurrencia/lote y puerta backend según permisos; eliminar editor/preflight anteriores solo si sin consumidores.
6. **F6:** depuración final con inventario de endpoints/SQL, pruebas 100% de módulo + CI de GitHub, integración BD autorizada y verificación de ausencia de regresiones.

## 6. Cambios y límites de Fase 1

- **Modificado** `modules/cobranza-uni/administracion/main/main.js`: elimina metadatos `phase` sin consumo, etiquetas de GAS/corte históricas, y placeholder inalcanzable; usa `response.can_edit` del backend sin inventar estado de GAS. Sin cambiar cargadores, guards, endpoints ni datos.
- **Actualizados** `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase3.test.js`, `...-fase4.test.js` y `tests/cobranza-uni-administracion-venta-adicional-fase3.test.js`: corrigen cinco pruebas con expectativas de la fase anterior; preservan permisos, bloqueo de emergencia y auditoría.
- **Agregado** contrato JSON, test de regresión local y este documento.
- **No tocados:** JS/CSS de editores GC/VA/MP; servicios/rutas backend; esquema/datos Aiven; scripts/activadores GAS; archivos de fases anteriores.
- **No ejecutado:** commit, push, deploy Azure/Netlify/GitHub Pages, pruebas contra Aiven ni E2E.

### Fuentes del diagnóstico

- GitHub `main` commit `58f590d98c74d15ef944cc44056d1884c75dda29` y los archivos referidos arriba (leídos en su versión efectiva).
- CI de GitHub Actions `40038233404` (resultados publicados).
- `PROJECT_CONSTITUTION.md` v2.0 (27/08/2026), suministrada en el proyecto.
