# BLT NOW — Cobranza UNITED > Administración — Fase 3/6 V001

**Fecha:** 23/10/2026. **Base de GitHub verificada:** `ziSirrush/GestorMantto`, `main` SHA `58f590d98c74d15ef944cc44056d1884c75dda29` (versión `102326.9`). **Requiere:** Fase 1/6 V001 y Fase 2/6 V001 aplicadas primero, en ese orden.

## Resultado de esta fase

Se normalizó **Mantenimiento Preventivo (`detalle_mp_2026`, 20 columnas)** a la experiencia de edición fantasma de **Gestión de Crédito (GC)**:

- **Una sola tabla desplazable de las 20 columnas**, sin los grupos obsoletos `Resumen`, `Contrato`, `Cartera` o `20 columnas`.
- Doble clic sobre celda editable, o Enter con la celda enfocada, para editar **dentro de la celda**; Enter o pérdida de foco para guardar; Escape para cancelar.
- **Sin ventanas de edición individual:** se retiraron el DOM del formulario/modal de edición individual y sus reglas de CSS, sin tocar las ventanas de detalle/preflight **Zona 1** porque siguen consumidas hasta F4/F5.
- Guardado real exclusivamente mediante PATCH de backend existente, con `changes` y `expected`. Se mantiene lista blanca de campos, bloqueo de identificadores, derivados y otros campos protegidos; no se añade ninguna ruta ni SQL al cliente.
- La edición múltiple conserva selección de 2–20 registros y su contrato. Se evita iniciar el lote mientras hay una celda en edición; ante rechazo del lote se vuelve a consultar el estado de Aiven por backend.
- Se conservan búsqueda, filtros, orden, paginación, validación de permisos, diagnóstico, fórmulas de monto anual y pendiente, vínculos autorizados y contenido de Zona 1.
- Se retiraron mensajes históricos de la interfaz que aseguraban «GAS activo» sin comprobar la situación de los activadores. No se modificó el contrato diagnóstico de backend ni el estado de los activadores.
- El selector `main.js` solo cambió **las dos versiones de cache-bust de MP** y conserva el cambio previo de VA F2.

## Archivos del ZIP (delta, completos)

| Operación | Ruta |
|---|---|
| MOD | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js` |
| MOD | `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css` |
| MOD | `modules/cobranza-uni/administracion/main/main.js` (sobre la versión de F2) |
| MOD | `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase2.test.js` (expectativa de grupos eliminados) |
| MOD | `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase7.test.js` (texto de diagnóstico actualizado) |
| NEW | `tests/cobranza-uni-administracion-excel-fase3.test.js` |
| NEW | `docs/BLTNOW_COBRANZA_UNI_EXCEL_FASE3_V001.md` |
| NEW | `README_FASE3_EXCEL.txt` |

## Validaciones reales y límites

- **Sintaxis:** `node --check` sobre MP JS, selector `main.js` y nueva suite: aprobado.
- **Pruebas MP heredadas (F1–F8):** **130/130 aprobadas** en el laboratorio parcial.
- **Pruebas nuevas de Fase 3:** **9/9 aprobadas**. Cubren 20 columnas, edición dentro de celda, doble clic, Enter, Escape, blur sin doble PATCH, permisos/visor, whitelist, edición en lote con `expected`, error de guardado, preservación del detalle Zona 1 y limpieza de modal/grupos.
- **Pruebas combinadas Excel F1 + F2 + F3 + MP F1–F8:** **162 aprobadas, 1 omitida, 0 fallidas** (163 casos). **Omisión:** la copia parcial del laboratorio no tiene el archivo GC original; la prueba GC se ejecuta al validar en el repositorio completo.
- **Pendientes y NO ejecutados:** suite completa de todo el repositorio, CI GitHub Actions, pruebas contra Aiven real, permiso efectivo en línea, E2E y despliegues.

## Límites expresos y fases pendientes

- **GC no cambia, VA F2 no cambia**, ni sus servicios backend, ni bases de datos, Sheets, Azure o activadores GAS.
- **Zona 1 no se convierte en pestaña en F3**. Se conserva temporalmente el detalle por registro y sus preflights antiguos para evitar pérdida de funcionalidad. **F4** creará exclusivamente las pestañas `MP` y `Zona 1` con consulta paginada/segura de Zona 1; **F5** habilitará su edición fantasma y validará escrituras, siempre con protección de alcance, identidad y auditoría de backend.
- La limpieza de consultas SQL/servicios backend solo se hará cuando se verifiquen sus consumidores: **F6**. No se borró ninguna consulta operativa por intuición.
- El usuario informó que los activadores GAS están apagados; **no puedo confirmar su estado remoto** desde estas pruebas locales. El flag `gas_must_remain_active` del diagnóstico heredado no prueba el estado real de los activadores.

## Fuentes verificadas

- GitHub `main` base `.9`: `https://github.com/ziSirrush/GestorMantto/commit/58f590d98c74d15ef944cc44056d1884c75dda29`.
- Constitución v2 y ADR de normas estrictas proporcionados en este proyecto.
- Contrato F1, documentación F2 y pruebas incluidas con las entregas locales previas.

**No se realizó commit, push, DDL, escritura a Aiven ni despliegue** con esta entrega.
