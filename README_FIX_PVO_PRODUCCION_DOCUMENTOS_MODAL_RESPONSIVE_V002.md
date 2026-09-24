# FIX PVO-Producción · Documentos modal + responsive · V002

Fecha: 2026-09-24  
Módulo: `Logística > PVO-Producción > Detalle`

## Corrección de entrega

Esta versión **NO utiliza ni incluye archivos `.patch`**.

Se entrega con los archivos completos, conservando la estructura real del repositorio para que puedan copiarse/sobrescribirse de forma controlada.

## Revisión contra `main`

Se verificó el `main` actual de `ziSirrush/GestorMantto` antes de regenerar el FIX.

Commit verificado: `c279fb827a81c5b063d906e06bf403848e3f67fa` (`Version 092326.10`).

Blobs base relevantes:

- `modules/logistica-produccion/logistica-produccion.js`: `652d96b7f5a7e3b78736d2e68c4760122fcfe4da`
- `modules/logistica-produccion/logistica-produccion.css`: `bcf1ea41340156513481f6acbf422975f5251ada`
- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`: `92d973b5544412c018a4797714b7188722496b51`
- `core/module-loader.js`: `c5be77d64bd27be1713a2e619d71e347fdef576c`

El FIX adicional presente en `main` modifica `core/module-loader.js` en **Cobranza COR / Fondo de Garantía**. Sí podía verse afectado si se reemplazaba el loader con una versión anterior. Esta V002 se adaptó sobre el blob actual y conserva esa integración.

## Cambios funcionales

- Click sobre nombre, miniatura o `Ampliar vista previa` abre modal flotante.
- PDF mostrado ampliado desde la hoja 1.
- Botón `Descargar` con SAS de Azure configurado como attachment.
- Botón `Abrir documento` para abrir el archivo completo.
- Cierre del modal con `X`, fondo o `Esc`.
- Responsive reforzado para celular en Resumen, Zona de carga, tarjetas documentales, botones y modal.
- CPVO y GM se apilan correctamente en móvil.
- En pantallas muy estrechas, Descargar/Abrir se apilan en una sola columna.

## Archivos completos incluidos

- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`
- `modules/logistica-produccion/logistica-produccion.js`
- `modules/logistica-produccion/logistica-produccion.css`
- `core/module-loader.js`
- `tests/logistica_produccion_documentos_modal_responsive_v002.test.js`

No se modifica SQL, tablas, columnas ni datos de Aiven.

## Cache-bust

Las cinco rutas PVO-Producción utilizan:

`20260924-pvo-doc-modal-responsive-v002`

## Aplicación

Desde la raíz del repositorio, copia el contenido del FIX respetando la misma estructura de carpetas y sustituye únicamente estos archivos.

Antes de aplicar, se recomienda confirmar que el `main` local siga en el commit/blob base indicado arriba. Si `main` cambia después de esta entrega, vuelve a comparar antes de sobreescribir `core/module-loader.js`.

## Validaciones realizadas

- Sintaxis frontend JS: OK.
- Sintaxis backend service: OK.
- Sintaxis `core/module-loader.js`: OK.
- Test específico del modal/responsive: OK.
- Se verificó que el loader conserve la integración actual de Cobranza COR / Fondo de Garantía.
- Se verificó que el cache-bust PVO aparezca 10 veces: CSS + JS para 5 rutas.
- El paquete no contiene ningún archivo `.patch`.

No se ejecutó E2E contra Azure/Aiven productivo y no se realizó despliegue remoto.
