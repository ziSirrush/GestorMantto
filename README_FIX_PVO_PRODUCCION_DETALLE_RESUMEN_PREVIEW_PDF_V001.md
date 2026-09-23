# FIX PVO-Producción · Detalle Resumen + Preview PDF V001

Fecha: 2026-09-23
Módulo: Logística → PVO-Producción → Detalle

## Objetivo

1. Cambiar `Detalle > Resumen` de tarjetas/fields independientes a una tabla compacta de campos y valores.
2. Agregar en `Zona de carga` una vista previa de cada PDF ya cargado, mostrando únicamente la primera hoja de forma no interactiva.
3. Conservar las acciones existentes de abrir el documento completo, eliminar y cargar/reemplazar.
4. Conservar el FIX anterior de orden, filtros y leyenda de emojis en PVO-Producción.

## Base verificada

Se revisó `main` de `ziSirrush/GestorMantto` antes de preparar el cambio.

Blob SHA observados en la revisión:

- `modules/logistica-produccion/logistica-produccion.js`: `a733413c70d4e5f45822088fa013f1920184de3a`
- `modules/logistica-produccion/logistica-produccion.css`: `f178f8bd49e69c3cc15dc91bc1526b33adfca619`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`: `debd589c8e31757db2539b38185663f2e10c4394`
- `core/module-loader.js`: `b68954cb81f5cbb2fc5f67513a3e5dcdfb7ba269`

El `main` verificado todavía no contiene el FIX anterior `FIX_PVO_PRODUCCION_ORDEN_FILTROS_EMOJIS_V001`. Por eso este paquete es **acumulativo**: incluye también los archivos de ese FIX para no perder orden, filtros, indicadores ni el ordenamiento por semana/PVO.

## Cambios de esta versión

### 1. Resumen como tabla de fields

El bloque anterior:

- Modo
- Proyecto
- Supervisor
- Asesor
- Semana Registro
- Estatus Producción
- PPNS
- Fecha PVO
- Fecha de Visita
- Fecha entrega cubos
- Estatus Logística
- Comentario

ahora se presenta en una tabla compacta de cuatro columnas lógicas:

`Campo | Valor | Campo | Valor`

No cambia la fuente ni el valor de ningún dato; únicamente cambia la presentación.

### 2. Vista previa documental

Cada archivo cargado en CPVO o GM muestra una tarjeta documental.

Para PDF:

- se usa el SAS de lectura que ya entrega el backend (`url_acceso`);
- la vista inicia explícitamente en `page=1`;
- se usa `view=Fit`;
- toolbar/navpanes/scrollbar se solicitan ocultos;
- el iframe es no interactivo (`pointer-events:none`, `tabindex=-1`);
- el contenedor recorta overflow;
- por separado se conserva `Abrir PDF completo`.

Esto evita que la vista previa se use para navegar por páginas posteriores. La apertura completa sigue disponible en una pestaña nueva.

Para archivos no PDF, no se inventa una conversión: se muestra el aviso `Vista previa disponible únicamente para archivos PDF` y se mantienen las acciones normales.

### 3. Carga de archivos

No se restringió el selector de archivos a PDF. La política existente de carga se mantiene; el preview especial solo aplica a PDFs.

### 4. Cache bust

Las cinco rutas que comparten este módulo usan:

`20260923-pvo-detalle-resumen-preview-v001`

- `logistica-produccion`
- `logistica-produccion-nuevo`
- `logistica-produccion-detalle`
- `logistica-pvo`
- `logistica-documentos`

## Archivos incluidos

- `modules/logistica-produccion/logistica-produccion.js`
- `modules/logistica-produccion/logistica-produccion.css`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js` *(arrastrado del FIX anterior; no se modifica por el preview)*
- `core/module-loader.js`
- `tests/logistica_produccion_orden_filtros_emojis_v001.test.js`
- `tests/logistica_produccion_detalle_resumen_preview_v001.test.js`

## Validaciones realizadas

- `node --check modules/logistica-produccion/logistica-produccion.js` → OK
- `node --check core/module-loader.js` → OK
- `node --check backend/src/modules/logistica-produccion/logistica-produccion.repository.js` → OK
- Test nuevo Detalle/Preview → 5/5 OK
- Test regresión Orden/Filtros/Emojis → 5/5 OK
- `backend npm run check` sobre estructura completa con el repository acumulado → OK

## No realizado

- No se modificó GitHub remoto.
- No se modificó Aiven.
- No se modificó Azure.
- No se hizo deploy Netlify/GitHub Pages.
- No se ejecutó una prueba visual contra un SAS real de producción; la compatibilidad final del preview depende de que el navegador pueda embeber el PDF servido por Azure Blob, igual que cualquier visor PDF embebido.

## Resultado esperado

`Detalle > Resumen` queda más compacto y tabular. En `Zona de carga`, los documentos PDF cargados muestran su primera hoja como vista previa y mantienen la acción para abrir el PDF completo.
