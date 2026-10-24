# BLT NOW — Cobranza UNITED > Administración — Fase 2/6 V001

**Fecha:** 23/10/2026  
**Base GitHub:** `ziSirrush/GestorMantto` `main` SHA `58f590d98c74d15ef944cc44056d1884c75dda29` (versión 102326.9).  
**Dependencia:** aplicar primero `BLTNOW_COBRANZA_UNI_EXCEL_FASE1_V001.zip` (contrato V001 y selector).  
**Alcance:** **solo Venta Adicional (VA / tabla `pc`)**. GC, MP, Zona 1, backend, Sheets, GAS y esquema Aiven no se modifican.

## Cambio y causa

La versión 102326.9 ya tenía una edición directa parcial `beginCellEdit`/`saveCellEdit`, pero mantenía **dos interfaces para la misma acción**: una ventana modal huérfana de edición y sus estilos, además de grupos de columnas que contradecían el acuerdo de **una tabla Excel**. También había textos de GAS que el código no podía comprobar.

### Qué se entrega

- **Tabla VA única de 31 columnas**, desplazable, sin grupos ni pestañas; columnas protegidas/derivadas conservan su distinción visual y su no editabilidad.
- **Edición fantasma idéntica en interacción a GC:** doble clic o Enter en celda autorizada; editar en sitio; Enter/blur guarda; Escape cancela. Para el texto multilínea `comentarios_cobranza`, Enter agrega una línea y **Ctrl+Enter** confirma. Sigue existiendo edición múltiple con 2–20 filas.
- **Guardado real por backend**: PATCH con `changes`/`expected`; se confirma resultado del servidor antes de recargar. El frontend no ejecuta SQL, ni cambia permisos, ni calcula escrituras por sí mismo. La lista blanca de VA sigue bajo autoridad de backend.
- **Depuración de VA**: se eliminan la configuración y botones de grupos, handlers/marcadores del modal obsoleto, métodos sin consumidor y estilos CSS del antiguo modal de edición. **El modal de alta se conserva**, ya que tiene formulario, preflight POST y acción POST realmente usados; su habilitación depende del servidor.
- **Conservación explícita**: filtros, búsqueda, orden, paginación, 31 encabezados, columna fija, fórmulas/relaciones informativas (preview), protección de identificadores, `can_view/can_edit` y formulario de alta existente.
- **Carga frontend**: cache-bust de VA en `main.js` de Fase 1 para que no reutilice JS/CSS obsoletos; GC y MP mantienen sus rutas y versiones.
- **Pruebas**: se actualizan únicamente expectativas anteriores de VA sobre tabs y sobre un modal de edición ya retirado; se añade suite de regresión real de eventos de UI simulados.

## Archivos modificados

| Tipo | Ruta |
|---|---|
| MOD | `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js` |
| MOD | `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css` |
| MOD | `modules/cobranza-uni/administracion/main/main.js` (solo cache-bust VA sobre el archivo de F1) |
| MOD | `tests/cobranza-uni-administracion-venta-adicional-fase2.test.js` |
| MOD | `tests/cobranza-uni-administracion-venta-adicional-fase3.test.js` (sobre el archivo de F1) |
| NEW | `tests/cobranza-uni-administracion-excel-fase2.test.js` |
| NEW | `docs/BLTNOW_COBRANZA_UNI_EXCEL_FASE2_V001.md` |
| NEW | `README_FASE2_EXCEL.txt` |

**No se eliminaron endpoints, SELECT, rutas ni tablas de backend en F2:** las vistas previas y la consulta principal de VA siguen consumidas; eliminarlas sin un inventario y pruebas contra los consumidores reales sería inseguro. La depuración integral de servicios queda para F6.

## Contrato de pruebas y límites

- **Prueba local aislada de F1+F2:** `24` pruebas reportadas, `21` aprobadas, `3` omitidas por faltar archivos de otros módulos en la copia parcial. De esas 21, **9/9 de F2** aprobadas, incluyendo doble clic, Enter, blur sin duplicación, Escape, permisos/whitelist simulados, 31 columnas y Ctrl+Enter de textarea.
- **Sintaxis** JS de VA y test F2: comprobada mediante `node --check`.
- **No ejecutado aquí:** suite completa con todas las dependencias reales, conexión real a Aiven, validación de permisos efectivos online, Azure CI, E2E, commit, push o despliegue.
- La última ejecución comprobada antes de F2 fue la de GitHub Actions para la versión 102326.9, con 5 fallas antes de F1. **No es correcto afirmar CI limpio hasta que el código completo se aplique y ejecute.**
- El usuario reportó activadores GAS desactivados; **no puedo confirmar su estado remoto**. Esta fase no los toca ni habilita escritura de Zona 1.

## Siguiente fase

**Fase 3:** Mantenimiento Preventivo: una única tabla Excel igual a GC/VA, retirada de modal y grupos obsoletos; **Zona 1 todavía no se implementa como pestaña** (F4/F5).

## Referencias verificadas

- Código fuente y contratos de `main` versión 102326.9: `https://github.com/ziSirrush/GestorMantto/commit/58f590d98c74d15ef944cc44056d1884c75dda29`.
- CI anterior: `https://github.com/ziSirrush/GestorMantto/actions/runs/40038233404`.
- Constitución del Gestor v2.0, ADR de normas estrictas y contrato Excel F1 del proyecto.
