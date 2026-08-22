# FIX_RESET_CREDENCIALES_PANEL_V001

## Objetivo
Corregir el boton **Resetear credenciales** del Panel de Control para que ejecute la misma logica reutilizable del script `backend/scripts/reset-user-id-password.js` sobre el usuario seleccionado y conserve visible la contrasena temporal hasta que el usuario complete correctamente su flujo de primer acceso.

## Archivos modificados
- `backend/scripts/reset-user-id-password.js`
- `backend/src/controllers/usuarios.controller.js`
- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## Flujo resultante
1. El Programador/usuario autorizado selecciona un usuario en Panel de Control > Usuarios.
2. Presiona `Resetear credenciales`.
3. El endpoint `/api/usuarios/:id/reset-credentials` ejecuta `resetUserPasswordById(id)` exportado por el script real.
4. Se genera una contrasena temporal criptograficamente aleatoria y se guarda con bcrypt.
5. Se marca `must_change_password = 1`, se limpia bloqueo/intentos/respuesta de recuperacion y se reinicia el estado de primer acceso.
6. `password_changed_at` se actualiza para invalidar access tokens anteriores y se revocan las sesiones activas en `auth_sessions` dentro de la misma transaccion.
7. El backend devuelve la contrasena temporal al Panel de Control.
8. El Panel muestra la contrasena como texto debajo del boton. Se conserva solo en `sessionStorage`, aislada por administrador + usuario; no se guarda en Aiven ni en `localStorage`.
9. Mientras ese usuario siga con `must_change_password = 1`, el Panel comprueba el estado cada 10 segundos solo cuando dicho usuario permanece seleccionado.
10. Cuando el usuario completa pregunta de seguridad + nueva contrasena y `must_change_password` cambia a 0, el Panel elimina la contrasena temporal y deja de consultar.

## Script manual
El mismo script continua siendo ejecutable desde PowerShell. Ahora admite el ID como argumento:

```powershell
cd backend
node .\scripts\reset-user-id-password.js 81
```

Si no se especifica ID mantiene `81` como valor por defecto para compatibilidad con el uso previo.

## Base de datos
- No crea tablas.
- No agrega columnas.
- No modifica roles, permisos, zonas ni informacion operativa del usuario.

## Validaciones realizadas
- `node --check backend/scripts/reset-user-id-password.js`: OK
- `node --check backend/src/controllers/usuarios.controller.js`: OK
- `node --check modules/panel-control/panel-control.js`: OK
- Se verifico que los archivos base `usuarios.controller.js`, `panel-control.js` y `panel-control.css` coinciden por Git blob SHA con la version actual de `GestorMantto/main` revisada antes del FIX.
- El script base normalizado a LF coincide con el Git blob SHA actual antes de aplicar cambios.

## Deploy requerido
- Backend: si, por cambios en script/controlador.
- Frontend: si, por cambios en Panel de Control JS/CSS.
- SQL: no.
