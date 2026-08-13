# FIX_COTIZACIONES_EDICION_SYNC_FILTROS_FALLBACK_EQUIPOS_V004

## Base
Fix acumulativo sobre V003. Conserva:
- corrección de filtros de Cotizaciones;
- sincronización reactiva/silenciosa sin polling constante;
- botón Editar en Detalle de Cotización;
- fallback de equipos desde `ventas_cotizaciones_cor.tipo_equipos` / `numero_equipos` cuando no existen filas en `ventas_cotizaciones_equipos_cor`.

## Cambio V004: formulario independiente Editar Cotización
El botón **Editar** sigue entrando desde Detalle, pero el modo `edit` ya no intenta reutilizar internamente la lógica del alta.

Se agregó un módulo independiente:
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.html`
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.css`
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.js`

La ruta existente `ventas-cotizaciones-nueva` con payload `{ mode: 'edit', id }` delega a este módulo independiente. Esto evita modificar la arquitectura del router y separa por completo la lógica de alta y edición.

## Precarga
Al abrir Editar Cotización se consulta:
`GET /api/ventas/cotizaciones/:id`

y se precargan los datos existentes del formulario:
- nombre de proyecto;
- tipo de proyecto;
- estatus;
- información enviada;
- cliente;
- contacto;
- puesto;
- teléfono;
- correo;
- ciudad;
- estado;
- comentario;
- equipos separados cuando existen.

Si no hay filas separadas de equipos, se conserva el fallback histórico. No se inventa una distribución cuando el texto histórico contiene varios tipos sin cantidades individuales.

## Guardado
Editar usa exclusivamente:
`PUT /api/ventas/cotizaciones/:id`

Después de éxito:
- emite `mantto:data-mutated` para que Cotizaciones quede actualizada de forma reactiva;
- emite `mantto:ventas-cotizacion-actualizada`;
- vuelve al Detalle de la cotización guardada.

## Archivos modificados/nuevos
- `index.html`
- `core/data-sync.js` (conservado de V003)
- `modules/ventas-cotizaciones/ventas-cotizaciones.js` (conservado de V003)
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js` (conservado de V003)
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.html` (conservado de V003)
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.html` (nuevo)
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.css` (nuevo)
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.js` (nuevo)

## Validación realizada
`node --check` exitoso para los 5 JavaScript incluidos/modificados.

No se modificó backend ni SQL.
La validación funcional final debe realizarse después del deploy con una cotización real.
