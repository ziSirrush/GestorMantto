# FIX_COTIZACIONES_EDICION_CARGA_INSTANTANEA_V005

## Objetivo
Corregir la demora al abrir **Editar cotización**.

## Causa encontrada
V004 esperaba varias consultas antes de precargar el registro:
- listado de clientes (hasta 5000),
- catálogo general de Ventas,
- catálogo de Cotizaciones,
- catálogo Estado,
- GET de la cotización,
- y después contactos del cliente.

Esto hacía que el formulario apareciera vacío hasta terminar todas esas llamadas.

## Cambio aplicado
- El Detalle ya tiene la cotización cargada; ahora la envía al formulario Editar mediante el payload del Router.
- Editar precarga inmediatamente ese objeto, sin volver a consultar la API al abrir desde Detalle.
- Si Editar se abre directamente por URL/ruta y no existe el objeto precargado, realiza **una sola llamada** `GET /api/ventas/cotizaciones/:id`.
- Clientes, contactos y catálogos se cargan de forma diferida únicamente cuando el usuario intenta cambiar esos campos.
- Guardar sigue usando solamente `PUT /api/ventas/cotizaciones/:id`.
- Se conserva el fallback de equipos históricos de V004.

## Archivos modificados
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `modules/ventas-cotizaciones-editar/ventas-cotizaciones-editar.js`
- `index.html`

## Validaciones
- Sintaxis JS validada con `node --check`.
- No hay cambios SQL.
- No hay cambios backend.
- No se toca el problema pendiente de autores de comentarios.
