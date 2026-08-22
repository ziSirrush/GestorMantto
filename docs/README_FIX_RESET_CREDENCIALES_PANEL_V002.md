# FIX_RESET_CREDENCIALES_PANEL_V002

## Alcance
Corrige el reseteo administrativo de credenciales desde Panel de Control para el usuario seleccionado.

## Archivos modificados
- `backend/scripts/reset-user-id-password.js`
- `backend/src/controllers/usuarios.controller.js`
- `modules/panel-control/panel-control.js`

## Comportamiento
1. El botón `Resetear credenciales` usa el `id_SB` del usuario seleccionado.
2. El backend ejecuta la misma lógica reutilizable de `reset-user-id-password.js`.
3. Genera una contraseña temporal criptográficamente aleatoria y guarda únicamente su hash bcrypt.
4. Antes de confirmar el reset, vuelve a leer el hash guardado y ejecuta `bcrypt.compare` contra la contraseña temporal. Si no coincide, revierte la transacción y no devuelve una contraseña al frontend.
5. Marca `must_change_password = 1`, reinicia primer acceso, intentos fallidos y bloqueo, limpia la respuesta de recuperación y actualiza `password_changed_at`.
6. Revoca las sesiones activas del usuario en `auth_sessions`.
7. Registra auditoría del reset.
8. El endpoint devuelve el `id_SB`, correo, contraseña temporal y `credential_verified=true` solo después de verificar la escritura.
9. El Panel valida que la respuesta corresponda exactamente al usuario seleccionado y que el hash esté verificado.
10. La contraseña temporal aparece debajo del botón con botón `Copiar`.
11. La contraseña queda únicamente en `sessionStorage` de la sesión administrativa; no se guarda en texto plano en Aiven.
12. Mientras el usuario mantenga `must_change_password = 1`, el Panel conserva la contraseña visible. Cada 30 segundos, únicamente mientras ese usuario está abierto y tiene un reset pendiente, consulta su detalle. Cuando el usuario termina correctamente el primer acceso (`must_change_password = 0`), la contraseña se elimina de la sesión administrativa y desaparece de la vista.

## Base de datos
No requiere ALTER, tablas nuevas ni columnas nuevas.

## Validación estática
Ejecutado `node --check` sobre los tres archivos modificados: OK.

## Orden recomendado de despliegue
Desplegar primero los dos archivos de backend y esperar que la API quede activa. Después publicar `modules/panel-control/panel-control.js`.

## Importante
La validación de sintaxis y coherencia del código está confirmada. No puedo confirmar el funcionamiento contra el backend/Aiven de producción hasta realizar una prueba real después del despliegue.
