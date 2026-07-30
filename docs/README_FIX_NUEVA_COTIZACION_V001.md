# FIX Nueva Cotización V001

Base: `VEr Local 1026hrs.zip`.

## Incluye
- Nueva cotización como vista independiente.
- Cliente buscable y limitado por visibilidad de Ventas.
- Clientes para acceso total, gerente y asesor mediante `ventas_clientes.iniciales` contra `usuarios.iniciales`.
- Contactos por `id_cliente`, alta de contacto y autollenado de teléfono/correo.
- Relación y validación de `id_cliente` e `id_contacto` al crear cotización.
- Copia histórica de cliente, contacto, teléfono y correo en `ventas_cotizaciones_cor`.
- Catálogo general por `area`, `elemento` y `articulo`.
- Tipo de proyecto, tipo de equipo y estado desde catálogo general.
- Fecha de solicitud automática en ISO al guardar.
- Número de equipos limitado a entero no negativo.

## Orden de aplicación
1. Ejecutar `backend/sql/20260729_NUEVA_COTIZACION_CONTACTOS_CATALOGO.sql`.
2. Cargar en `catalogo_general` los artículos requeridos.
3. Sustituir los archivos del FIX respetando rutas.
4. Publicar backend.
5. Refrescar frontend.

## Artículos esperados
- `Ventas | Tipo de Proyecto | <artículo>`
- `Ventas | Tipo de Equipo | <artículo>`
- `<área elegida> | Estado | <artículo>`

## Pendiente explícito
El botón “Añadir cliente” navega a `ventas-clientes`. El ZIP base no contiene un frontend independiente para Clientes; la ruta queda preparada para integrarlo cuando se desarrolle esa vista.
