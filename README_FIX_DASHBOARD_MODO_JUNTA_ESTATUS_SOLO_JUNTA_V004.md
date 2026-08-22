# FIX Dashboard Instalaciones - Estatus solo en Modo Junta V004

## Objetivo
Mantener la edición rápida por celdas fantasma y agregar la columna **Estatus** únicamente cuando el Dashboard está en **Modo Junta**.

## Cambios
- Se mantiene eliminada la columna/botón **Editar**.
- Las celdas autorizadas siguen funcionando como botones fantasma/reactivos.
- En **Modo normal**, las tablas conservan exactamente sus columnas originales.
- En **Modo Junta**, todas las secciones `01-SUS` a `08-T` agregan una columna **Estatus**.
- La columna **Estatus** muestra el código actual del registro (`01-SUS`, `02-OC`, ..., `08-T`).
- La celda **Estatus** es editable mediante el mismo editor flotante de celda.
- No se modifica ningún módulo de PDF ni la definición del Reporte de Instalaciones.
- Este fix continúa siendo visual/interactivo: el botón Guardar permanece deshabilitado y no ejecuta UPDATE en Aiven.

## Archivos modificados
- `index.html`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.js`

## Validaciones
- Sintaxis JavaScript validada con `node --check`.
- Se verificó que `reportColumns_cor()` devuelve las columnas base en Modo normal.
- Se verificó que en Modo Junta antepone `Estatus` cuando la sección no lo trae de origen.
- `QUICK_EDIT_FIELDS_COR` mantiene `estatus` habilitado para las 8 secciones.
- No se modificaron archivos PDF, backend, SQL ni CSS.
