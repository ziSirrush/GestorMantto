# FIX V011 - Contactos reutilizables y detalle de cotización unificado

## Cambios
- Se agregó un formulario reutilizable de contactos en formato acordeón/tarjeta desplegable.
- Detalle del cliente: Nuevo contacto y Editar contacto usan el mismo componente, sin modal ni vista separada.
- Nueva cotización: Crear contacto usa el mismo componente y selecciona automáticamente el contacto guardado.
- El selector de contacto se recarga y completa teléfono/correo tras el alta.
- Cotizaciones: el clic en la fila o en el botón Ver navega a `ventas-cotizaciones-detalle` usando `id_cotizacion`.
- Clientes y Cotizaciones reutilizan la misma vista completa de detalle de cotización.
- La barra contextual conserva el origen para regresar a Clientes o Cotizaciones.

## Requisitos
- Mantener publicados los endpoints existentes de contactos y cotizaciones.
- No requiere SQL ni cambios de backend.
