# FIX_RESET_CREDENCIALES_PANEL_V003

## Alcance
Corrige el reseteo de credenciales desde Panel de Control para que sea un proceso independiente de "Guardar usuario" y muestre la contraseña temporal en un campo de texto debajo del botón "Resetear credenciales".

## Archivos modificados
- `backend/scripts/reset-user-id-password.js`
- `backend/src/controllers/usuarios.controller.js`
- `modules/panel-control/panel-control.js`

## Comportamiento
1. El botón usa el `id_SB` del usuario actualmente seleccionado.
2. Genera una contraseña temporal segura y guarda únicamente su hash bcrypt en Aiven.
3. Antes de confirmar el reset, vuelve a leer el hash y valida `bcrypt.compare(temporal, hash_guardado)`.
4. Si la validación falla, hace rollback y no entrega la contraseña al frontend.
5. Revoca las sesiones activas del usuario.
6. El frontend valida que la respuesta corresponde al mismo usuario seleccionado y que `credential_verified === true`.
7. La contraseña se muestra en un `input readonly` debajo del botón, con botón "Copiar".
8. No se usa `alert()` para mostrar la contraseña.
9. Resetear credenciales NO ejecuta ni depende de "Guardar usuario".
10. La contraseña se conserva únicamente en `sessionStorage` del Panel de Control mientras `must_change_password = 1`.
11. Cada 30 segundos, mientras el usuario afectado esté abierto, se consulta su detalle. Cuando `must_change_password` pasa a `0`, la contraseña temporal se elimina del Panel.

## Despliegue
1. Reemplazar los dos archivos de backend y desplegar/reiniciar la API.
2. Reemplazar `modules/panel-control/panel-control.js` y publicar el frontend.
3. Probar con un usuario secundario.

## Validación esperada
- Al resetear no debe aparecer una ventana emergente con la contraseña.
- Debe aparecer el campo de texto debajo del botón de reset.
- La contraseña del campo debe permitir iniciar sesión.
- El usuario debe entrar al flujo de primer acceso.
- Al completar correctamente el primer acceso, el campo debe desaparecer.
