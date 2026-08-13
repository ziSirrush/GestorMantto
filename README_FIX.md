# FIX URGENTE Ventas - Editar Cotizacion V005

## Alcance
Correccion puntual del flujo Editar Cotizacion.

## Causa localizada
La ruta de edicion estaba desviando el formulario a `ventas-cotizaciones-editar.js`, que implementaba una segunda logica distinta a Nueva Cotizacion. En esa logica los contactos se cargaban de forma diferida al enfocar el select; por eso el primer intento de abrir el listado podia mostrar solo el contacto precargado o no desplegar la lista completa. El guardado tambien dependia de ese estado paralelo.

## Correccion
- Editar Cotizacion vuelve a utilizar directamente la misma logica funcional de `ventas-cotizaciones-nueva.js`.
- En modo `edit`, se carga la misma plantilla, los mismos clientes, catalogos y referencias que Nueva Cotizacion.
- Despues se ejecuta `loadEditRecord(id)`.
- `loadEditRecord()` usa `selectClient(id_cliente, id_contacto)`, que carga inmediatamente `/api/ventas/clientes/:id/contactos`, selecciona el contacto vigente y habilita el listado completo.
- Guardar usa la misma funcion `saveQuotation()` que Nueva Cotizacion y cambia automaticamente a `PUT /api/ventas/cotizaciones/:id` cuando existe `state.editId`.
- Se conserva el fallback historico de equipos ya aprobado.

## Archivo modificado
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`

## No modificado
- Backend.
- SQL.
- Nueva Cotizacion en modo alta.
- Detalle de Cotizacion.
- Otros modulos de Ventas.

## Validacion tecnica
`node --check modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js` OK.
