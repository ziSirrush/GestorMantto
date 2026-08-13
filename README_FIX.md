# FIX URGENTE - Separacion Nueva / Editar Cotizacion V006

## Problemas corregidos
1. Nueva Cotizacion podia terminar usando estado/modo de edicion.
2. Editar Cotizacion compartia la ruta interna de Nueva Cotizacion.
3. El listado de contactos en Editar no seguia el mismo flujo probado de Nueva Cotizacion.
4. El flujo podia terminar ejecutando POST cuando la intencion era editar.

## Correccion aplicada
- Se registra la ruta independiente `ventas-cotizaciones-editar` en `core/router.js`.
- `ventas-cotizaciones-nueva` queda endurecido como ALTA exclusivamente:
  - Nueva Cotizacion => `POST /api/ventas/cotizaciones`.
  - Nunca ejecuta PUT.
- Cuando una referencia antigua entra a Nueva con `mode: edit`, se redirige inmediatamente a `ventas-cotizaciones-editar` y se reemplaza la ruta para no contaminar el historial.
- `ventas-cotizaciones-editar` queda como EDICION exclusivamente:
  - exige `id_cotizacion`.
  - carga clientes y catalogos con las mismas referencias funcionales que Nueva Cotizacion.
  - al cargar el cliente ejecuta inmediatamente la consulta de sus contactos y deja seleccionado el contacto vigente.
  - `Guardar cambios` ejecuta exclusivamente `PUT /api/ventas/cotizaciones/:id`.
- Se conserva el fallback historico de equipos.
- No se modifica backend, SQL, comentarios ni otros modulos de Ventas.

## Archivos modificados
- `core/router.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.js`

## Pruebas obligatorias despues del deploy
1. Cotizaciones > Nueva Cotizacion:
   - debe mostrar formulario vacio con titulo Nueva cotizacion.
   - guardar debe crear un registro nuevo por POST.
2. Detalle Cotizacion > Editar:
   - debe terminar en ruta `ventas-cotizaciones-editar`.
   - debe precargar el registro existente.
   - Contacto debe desplegar todos los contactos del cliente y mantener seleccionado el vigente.
   - Guardar cambios debe hacer PUT al mismo ID, sin crear una nueva cotizacion.
3. Regresar a Nueva Cotizacion despues de editar:
   - debe volver a abrir formulario de alta limpio, nunca la cotizacion anterior.

## Validacion tecnica
- `node --check` aplicado a los tres JavaScript modificados.
- Se verifico que Nueva contiene POST fijo y Editar contiene PUT fijo.
