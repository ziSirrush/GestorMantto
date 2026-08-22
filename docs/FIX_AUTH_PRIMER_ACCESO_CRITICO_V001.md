# FIX_AUTH_PRIMER_ACCESO_CRITICO_V001

## Objetivo
Cerrar el bypass de primer acceso detectado al recargar la pagina antes de completar el proceso obligatorio.

## Base revisada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base: `81929b71ed4bf5a2e3fb9a064217f1d8b46b5db8`
- Archivo base: `backend/src/middleware/auth.middleware.js`
- Git blob base: `25808103db043d01ebc29eb27143c169671d97aa`

## Causa confirmada
1. El frontend, al recargar, valida la sesion mediante `GET /api/auth/me` y si la respuesta es valida continua con el acceso a la aplicacion.
2. `requireAuth` validaba JWT, usuario activo y version de sesion, pero no comprobaba `usuarios.must_change_password`.
3. Por ello, una sesion valida podia seguir usando rutas protegidas aun cuando Aiven mantuviera pendiente el primer acceso.
4. El endpoint de cambio de contrasena del primer acceso podia llamarse directamente mientras `must_change_password = 1`; el backend no comprobaba en el middleware que la pregunta/respuesta de seguridad ya hubiera sido configurada.

## Cambio aplicado
Solo se modifica:
- `backend/src/middleware/auth.middleware.js`

### 1. Estado de primer acceso cargado desde Aiven
`hydrateAuthUser()` ahora lee:
- `must_change_password`
- `id_pregunta`
- un indicador calculado `first_login_security_question_configured`

El indicador considera que la pregunta NO esta configurada cuando:
- `id_pregunta` es NULL;
- `id_pregunta = 11` (valor que el flujo existente ya trata como pregunta no configurada);
- `respuesta_recuperacion` es NULL o vacia.

### 2. Barrera central en `requireAuth`
Mientras `must_change_password = 1`, un usuario autenticado solo puede usar:
- `POST /api/auth/first-login/security-question`
- `POST /api/auth/first-login/password`, pero unicamente despues de que exista pregunta/respuesta de seguridad valida.

Cualquier otra ruta que use `requireAuth`, incluida `GET /api/auth/me`, responde:
- HTTP `403`
- `code: FIRST_LOGIN_REQUIRED`
- `must_change_password: true`

Si se intenta cambiar la contrasena antes de configurar la pregunta de seguridad:
- HTTP `409`
- `code: FIRST_LOGIN_SECURITY_QUESTION_REQUIRED`

## Flujo resultante
1. Reset administrativo -> `must_change_password = 1`.
2. Login con contrasena temporal -> frontend abre primer acceso.
3. Se guarda pregunta/respuesta de seguridad.
4. Se permite guardar la nueva contrasena.
5. El controlador existente finaliza el primer acceso y cambia `must_change_password` a `0`.
6. Si el usuario recarga antes del paso 5, `/api/auth/me` queda bloqueado y el frontend no puede abrir el Gestor.
7. El usuario vuelve a login y el backend/frontend lo mantienen en el flujo obligatorio hasta completarlo.

## Prueba especifica del error reportado
Escenario protegido:
- usuario con `must_change_password = 1`;
- JWT valido;
- recarga/F5;
- frontend intenta `GET /api/auth/me`;
- resultado esperado y validado a nivel middleware: `403 FIRST_LOGIN_REQUIRED`;
- `next()` no se ejecuta, por lo que el controlador `/me` no entrega el perfil y la aplicacion no obtiene acceso operativo.

## Validaciones realizadas
- `node --check backend/src/middleware/auth.middleware.js`: OK.
- Prueba aislada ejecutando el middleware real con dependencias DB/JWT simuladas:
  - pendiente + `/api/auth/me` -> `403 FIRST_LOGIN_REQUIRED`: PASS.
  - pendiente + `/api/auth/first-login/security-question` -> permitido: PASS.
  - pendiente + password sin pregunta -> `409 FIRST_LOGIN_SECURITY_QUESTION_REQUIRED`: PASS.
  - pendiente + password con pregunta configurada -> permitido: PASS.
  - primer acceso completado + `/api/auth/me` -> permitido: PASS.

## Base de datos
- No crea tablas.
- No agrega columnas.
- No modifica datos.
- No requiere ejecutar SQL.
- Usa campos existentes de `usuarios`: `must_change_password`, `id_pregunta`, `respuesta_recuperacion` y `password_changed_at`.

## Alcance y riesgo
- Cambio minimo y centralizado en autenticacion.
- No modifica frontend.
- No modifica modulos funcionales ni permisos.
- No modifica rutas ni controladores.
- Usuarios con primer acceso ya completado (`must_change_password = 0`) conservan el comportamiento anterior.

## Despliegue requerido
- Backend: SI, reemplazar `backend/src/middleware/auth.middleware.js` y reiniciar/desplegar la API.
- Frontend: NO.
- SQL: NO.

## Validacion posterior al deploy recomendada
Usar una cuenta de prueba reseteada, no una cuenta administrativa principal:
1. Resetear credenciales.
2. Iniciar sesion con la contrasena temporal.
3. Sin completar el formulario de primer acceso, presionar F5.
4. Confirmar que NO abre Home/Gestor y que vuelve al acceso obligatorio/login.
5. Entrar nuevamente.
6. Configurar pregunta/respuesta y nueva contrasena.
7. Confirmar que solo despues de completar ambos pasos permite entrar al Gestor.
8. Verificar `/api/health` y un login normal de un usuario con `must_change_password = 0`.

## Limitacion de validacion
La sintaxis y la logica aislada del middleware quedaron verificadas. No puedo confirmar el comportamiento contra Aiven/backend desplegado hasta ejecutar la prueba real posterior al deploy.

## Fuentes verificadas
- `GestorMantto/main` commit `81929b71ed4bf5a2e3fb9a064217f1d8b46b5db8`.
- `backend/src/middleware/auth.middleware.js` (blob `25808103db043d01ebc29eb27143c169671d97aa`).
- `backend/src/routes/auth.routes.js`: `/me` y los endpoints `first-login` usan `requireAuth`.
- `core/auth.js`: durante `init()` una sesion restaurada valida `/api/auth/me` antes de mostrar la aplicacion.
- `Estruturacompleta081626.sql`: tabla `usuarios` contiene `must_change_password`, `id_pregunta`, `respuesta_recuperacion`, `password_changed_at` y `first_login_completed_at`.
- `PROJECT_CONSTITUTION.md`: permite intervenir por error critico/problema de seguridad y exige entregas incrementales con solo archivos modificados.