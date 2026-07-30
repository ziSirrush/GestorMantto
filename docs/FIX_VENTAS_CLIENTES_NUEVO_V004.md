# FIX Ventas Clientes Nuevo V004

Base acumulativa: Fases 1, 2 y 3 de Ventas Clientes.

Cambios:
- Elimina el enlace interno Regresar; la navegación queda en la barra contextual global.
- Elimina el campo Visualiza del formulario y del payload de alta.
- Normaliza Estatus con cliente a MAYÚSCULAS en el selector y al guardar.
- Gestión comercial solo visible para perfiles de acceso total.
- Para perfiles restringidos, oculta Gestión comercial y asigna automáticamente las iniciales del usuario autenticado.
- Bloquea el alta si el usuario restringido no tiene iniciales configuradas.

No requiere SQL ni cambios de backend.
