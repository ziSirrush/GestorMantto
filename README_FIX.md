# FIX_COTIZACIONES_EDICION_SYNC_FILTROS_FALLBACK_EQUIPOS_V003

## Qué se encontró
El FIX V002 sí contiene la lógica para abrir `ventas-cotizaciones-nueva` en modo edición, consultar `GET /api/ventas/cotizaciones/:id` y precargar el formulario. Sin embargo, `index.html` seguía cargando los JavaScript con los identificadores de versión anteriores. Eso permite que navegador/PWA conserve una versión previa de `ventas-cotizaciones-nueva.js`, que no conoce el modo edición, mientras el detalle nuevo sí muestra el botón Editar.

No se puede confirmar desde el repositorio que el caché del navegador haya sido exactamente lo que ocurrió en la sesión reportada, pero el desacople de versiones en `index.html` sí estaba presente y debía corregirse.

## Cambios V003
- Conserva íntegramente V002:
  - edición reutilizando la plantilla de alta;
  - sincronización reactiva sin polling periódico;
  - corrección de `estatus_proyecto`;
  - fallback de equipos históricos.
- Agrega `index.html` al FIX para actualizar los cache-busters de:
  - `core/data-sync.js`;
  - `modules/ventas-cotizaciones/ventas-cotizaciones.js`;
  - `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`;
  - `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`.

## Flujo esperado de Editar
1. Detalle -> Editar.
2. Router abre `ventas-cotizaciones-nueva` con `{ mode: 'edit', id }`.
3. La plantilla consulta `GET /api/ventas/cotizaciones/:id`.
4. Se precargan proyecto, cliente, contacto, tipo de proyecto, estatus, información enviada, comentario, ciudad, estado, teléfono, correo y equipos/fallback histórico.
5. Guardar usa `PUT /api/ventas/cotizaciones/:id`.

## Archivos modificados
- `index.html`
- `core/data-sync.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.html`

## Validación realizada
- `node --check` sobre los JavaScript modificados.
- Verificación de que `index.html` apunta a versiones nuevas para los cuatro scripts afectados.
- Sin SQL.
- Sin cambios de backend.
