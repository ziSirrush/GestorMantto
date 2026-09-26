# FIX Instalaciones · PVO-Produccion · Preview documentos responsive V001

Base verificada de GitHub `main`:

`2ecd07159013b061cbce50e8c6133b0b9efc6f47` — `Version 092526.6`

## Cambio
En **Instalaciones > Proyectos > Detalle Proyecto > PVO y Produccion**, los documentos CPVO/GM ahora muestran la primera hoja directamente en su tarjeta, igual que el comportamiento vigente de PVO-Produccion.

Al seleccionar la vista previa, se abre el visor reutilizable existente. Dentro del visor el PDF permite desplazamiento y zoom.

## Responsive
- Escritorio: rejilla automatica de documentos.
- Tablet: hasta 2 columnas.
- Movil/PWA: 1 columna sin overflow horizontal.
- El visor ampliado conserva ajuste al viewport y scroll interno del PDF.

## Archivos modificados completos
- `core/details.js`
- `index.html`

`index.html` solo actualiza el cache-bust de `core/details.js`.

## Sin cambios
- Backend.
- Base de datos / SQL.
- Permisos.
- Carga, reemplazo o eliminacion de documentos desde Detalle Proyecto.

## Validacion realizada
- `node --check core/details.js` — OK.
- `node --test tests/instalaciones_pvo_documentos_preview_responsive_v001.test.js` — pruebas estaticas OK.
- Se verifico que los archivos base correspondan a los blobs vigentes de `main` antes de modificarlos.

No se realizo despliegue ni prueba E2E en navegador/produccion.
