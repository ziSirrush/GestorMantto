# FIX Ventas Clientes - Editar cliente V007

## Cambios
- El modal Editar cliente usa listas para Estado, Tipo de cliente, Estatus con cliente y Asesor / iniciales.
- Estado proviene de Catalogo General: General / Estado.
- Tipo de cliente proviene de Catalogo General: Ventas / Tipo de Cliente, con respaldo del catalogo historico.
- Estatus proviene de Catalogo General: Ventas / Estatus con Cliente, con respaldo historico, y se muestra/guarda en mayusculas.
- Asesor / iniciales usa el mismo endpoint y alcance que Nuevo cliente:
  - ADMIN_REL: solo relaciones de usuarios_rel_admin.
  - SELF: solo el usuario autenticado.
  - ALL: perfiles comerciales permitidos por backend.
- Se eliminan Proyecto vendido y Visualiza del formulario y del resumen del cliente.
- La edicion ya no envia proyecto_vendido ni visualiza.
- Se elimina el boton Regresar interno del detalle; la navegacion queda en la barra contextual.

## Instalacion
Reemplazar la carpeta:
modules/ventas-clientes-detalle/

No requiere SQL ni cambios adicionales de backend si ya esta publicado el FIX V006.
