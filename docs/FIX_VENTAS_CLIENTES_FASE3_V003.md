# FIX Ventas Clientes Fase 3 V003

Implementa la vista independiente Detalle del cliente, edición de información comercial, administración completa de contactos activos y cotizaciones relacionadas por `id_cliente`.

## Backend incluido
- PUT/PATCH `/api/ventas/clientes/:id/contactos/:idContacto`
- PATCH `/api/ventas/clientes/:id/contactos/:idContacto/principal`
- DELETE `/api/ventas/clientes/:id/contactos/:idContacto`
- Filtro `id_cliente` en GET `/api/ventas/cotizaciones`
- Se elimina el bloqueo de duplicados del CRUD normal de clientes, conservando la regla de registros separados por asignación comercial.

No requiere cambios SQL.
