# FIX Ventas Clientes - Asignacion comercial V006

## Regla corregida

La prioridad del selector de asesor queda:

1. Usuario presente como `id_admin` en `usuarios_rel_admin`:
   - Solo recibe los asesores relacionados con ese administrador.
   - Esta regla tiene prioridad incluso si el usuario posee alcance general `ALL`.
2. Acceso total que no es administrador relacionado:
   - Puede asignar a usuarios activos con rol comercial autorizado:
     - Asesor Comercial
     - Gerente de Cuentas Corporativas
     - Roles cuyo nombre inicia con Gerente Comercial
     - Director Ventas
3. Resto de usuarios:
   - Solo sus propias iniciales.

## Seguridad

La misma regla se valida al crear o actualizar el cliente. No basta modificar el valor del selector en el navegador.

## Archivos

- `backend/src/modules/ventas-clientes/ventas-clientes.service.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.repository.js`

No requiere SQL ni cambios frontend.
