# FIX Nueva Cotización - Contactos visibles V003

## Regla de acceso
La visibilidad se valida una sola vez sobre el cliente. Si el usuario puede consultar el cliente, puede consultar todos los contactos activos asociados a ese `id_cliente`.

## Compatibilidad con clientes importados
Cuando un cliente todavía no tiene registros en `ventas_clientes_contactos`, el endpoint migra automáticamente el contacto heredado de `ventas_clientes` como contacto principal.

## Archivos modificados
- `backend/src/modules/ventas-clientes-contactos/ventas-clientes-contactos.service.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`

## No requiere SQL
No es necesario truncar ni volver a cargar clientes. Tampoco modifica permisos ni la estructura de tablas.
