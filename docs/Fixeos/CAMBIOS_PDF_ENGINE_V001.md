# Fix PDF Engine V001

## Qué se encontró

La generación de PDF de Equipos Críticos estaba implementada directamente dentro de `modules/equipos-criticos/equipos-criticos.js`, incluyendo la construcción de tablas, descarga y fallback CSV.

## Archivos modificados

- `index.html`
- `modules/equipos-criticos/equipos-criticos.js`

## Archivo nuevo

- `core/pdf/pdf-engine.js`

## Cambios realizados

- Se creó el motor general `window.ManttoPdf_gnral` en `core/pdf/pdf-engine.js`.
- Se movió al motor general la creación del documento, metadatos, tabla, nombre de archivo y fallback CSV.
- Equipos Críticos ahora solo define los datos, columnas y criterio que entrega al motor.
- Se conservan los tres flujos existentes: PDF Equipos, PDF Proyectos y PDF detalle.
- No se modificó backend, base de datos, rutas ni otros módulos.

## Validaciones realizadas

- Sintaxis JavaScript validada con `node --check`.
- Referencias de `index.html` verificadas.
- Confirmado que Equipos Críticos ya no contiene llamadas directas a `jsPDF`, `autoTable`, `Blob` ni lógica CSV.
- Confirmado que el motor se carga antes de `equipos-criticos.js`.
