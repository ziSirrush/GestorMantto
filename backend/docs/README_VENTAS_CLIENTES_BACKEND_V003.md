# FIX Backend Ventas Clientes V003

## Cambio

Se elimina la validación sintáctica estricta del campo `email` en Clientes.

El backend ahora aplica estas reglas:

- valor vacío: `NULL`;
- cualquier texto no vacío: se conserva como `VARCHAR(200)`;
- no se rechazan registros por formato de correo.

No requiere cambios de tabla ni cambios en Apps Script.
