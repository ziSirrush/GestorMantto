# FIX URGENTE COTIZACIONES - CARGA UNICA + ANIO TODOS V007

## Base
Este FIX se aplica encima de `FIX_URGENTE_SEPARACION_NUEVA_EDITAR_COTIZACION_V006`.
No revierte la separacion Nueva / Editar.

## 1. Editar Cotizacion - una sola llamada API inicial
Se agrega:

`GET /api/ventas/cotizaciones/:id/editar-bootstrap`

La respuesta agrupa en una sola llamada HTTP inicial:
- cotizacion y equipos;
- clientes visibles;
- contactos del cliente actual;
- catalogos de cotizaciones;
- catalogo general de Ventas;
- Estados.

El frontend `ventas-cotizaciones-editar.js` hidrata el formulario completo desde esa respuesta.
Ya no ejecuta llamadas API por foco para cargar clientes/catalogos/contactos durante la apertura inicial.

Si el usuario CAMBIA de cliente, si se consulta la lista de contactos del nuevo cliente. Esa llamada es consecuencia directa de un cambio del usuario y no ocurre en reposo.

Guardar en Editar continua usando exclusivamente:
`PUT /api/ventas/cotizaciones/:id`

## 2. Filtro Anio en Cotizaciones
El filtro Anio ahora inicia en:
`Todos`

y el boton Limpiar tambien lo restablece a `Todos`.

Se conserva el valor `todos` en la consulta para que la backend existente lo interprete como todos los anios.

## Archivos modificados/nuevos
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-editar-bootstrap.service.js` (nuevo)

## Validaciones realizadas
- `node --check` sobre todos los JS del FIX.
- La apertura inicial de Editar contiene una sola llamada API de bootstrap.
- Nueva Cotizacion no fue modificada.
- El guardado de Editar conserva PUT por ID.
- El filtro Anio inicia y limpia en Todos.

## Deploy
Este FIX SI requiere deploy de backend por la nueva ruta de bootstrap.
