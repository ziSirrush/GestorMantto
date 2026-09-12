# FASE 4 - Cobranza COR - Estados de Cuenta - Frontend V001

Fecha: 2026-09-11
Base verificada: `ziSirrush/GestorMantto` branch `main`, commit `72e968a94565683b03c284d81e27c8efe23612a3` (`Version 091126.9 - Cobranza COR`).

## Alcance

Adapta la antigua Tab **Detalle** del prototipo de Cobranza al módulo existente de Gestor Main:

`Cobranza > Estados de Cuenta`

No crea un módulo lateral nuevo. Main ya contiene la ruta `cobranza-estados-cuenta` y su permiso visual en el panel lateral.

## Archivos incluidos

Solo archivos nuevos o modificados:

- `core/app.js` - MODIFICADO, archivo completo.
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js` - NUEVO.
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.css` - NUEVO.

## Integración

`core/app.js` carga de forma diferida los recursos de Estados de Cuenta únicamente cuando la ruta activa es:

`cobranza-estados-cuenta`

No se modifica `index.html`, `core/router.js` ni `core/module-loader.js`. La ruta y el botón de navegación ya existen en Main; el bootstrap se engancha al evento global `mantto:navigation` y reemplaza la vista provisional `view-placeholder` por la vista funcional.

El módulo utiliza exclusivamente el cliente HTTP central `window.ManttoHttp`, por lo que conserva Auth / Viewer / Device definidos por Gestor Main.

## Backend requerido

Este frontend consume los endpoints preparados en FASE 3:

- `GET /api/cobranza-cor/estados-cuenta`
- `GET /api/cobranza-cor/estados-cuenta/:idIndiceCor`

Filtros enviados al listado:

- `q`
- `anio`
- `estatus`
- `solo_con_fuente=1`

La apertura del detalle siempre utiliza `id_indice_cor`. No usa coincidencia difusa por nombre de proyecto.

## Comportamiento visual

La pantalla incluye:

1. Filtros de Año, Estatus, búsqueda Proyecto/PP y Solo con movimientos.
2. Listado de proyectos autorizado por backend.
3. Selección de proyecto por `id_indice_cor`.
4. Encabezado del proyecto y responsables ADM/SUP/VEND/MRC.
5. Estado de Fianzas y REPSE/SIROC.
6. Resumen dinámico por moneda.
7. Comparativo de porcentaje Índice vs Fuente entregado por backend.
8. Alertas de consistencia entregadas por backend.
9. Tabla completa de movimientos de `cobranza_fuente_cor`.
10. Diseño responsive/PWA con scroll horizontal controlado para tablas amplias.

## Regla financiera

El frontend **NO recalcula** cobrado, pendiente ni comparativos financieros.

Presenta los campos ya resueltos por backend, incluyendo:

- `pago_contabilizado`
- `pendiente_calculado`
- `porcentaje_cobrado_calculado`
- `comparacion_porcentaje_indice_fuente`

Solo realiza formato de presentación: moneda, porcentaje y fecha `DD/MM/YYYY`.

No suma monedas diferentes.

## Estado si el backend todavía no se despliega

Como el backend FASE 3 aún debe desplegarse, la pantalla mostrará un mensaje controlado indicando que el endpoint de Estados de Cuenta no está disponible. No usa datos simulados como sustituto.

## Validación ejecutada

- `node --check core/app.js` -> OK.
- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta.js` -> OK.
- Export del módulo `ManttoCobranzaCorEstadosCuenta.init/refresh` -> OK.
- Se verificó que el `core/app.js` usado como base coincide byte a byte con el blob de Main `9961117f461310739c558a505be45283a32df6a7` antes de aplicar el cambio.
- No se ejecutó E2E contra Azure/Aiven porque el backend funcional todavía no ha sido desplegado por el usuario.

## Aplicación

Copiar los archivos respetando exactamente las rutas del ZIP sobre el repositorio local. No se requiere SQL ni cambio de tablas para esta entrega.
