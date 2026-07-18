# Backend - Preferencias de criticidad por usuario

## Cambios

- Se integraron las columnas `criticos_fallas` y `criticos_periodo` del usuario autenticado.
- El login devuelve ambas preferencias dentro de `user`.
- El middleware de autenticacion hidrata las preferencias desde Aiven en cada solicitud autenticada.
- Se agregaron endpoints personales:
  - `GET /api/usuarios/me/criticos-preferencias`
  - `PATCH /api/usuarios/me/criticos-preferencias`
- Los endpoints de criticidad usan los valores del usuario cuando no reciben parametros explicitos.
- Los valores de respaldo permanecen en 3 fallas RESP BLT y 35 dias.
- `GET /api/criticidad-corporativa` conserva compatibilidad con el consumidor anterior, pero ahora su alias `anio_en_curso` contiene el periodo activo del usuario.
- No se modifico frontend, SQL, MTBC ni posicion de emojis.

## Archivos modificados

- `backend/src/controllers/auth.controller.js`
- `backend/src/middleware/auth.middleware.js`
- `backend/src/controllers/usuarios.controller.js`
- `backend/src/controllers/criticos.controller.js`
- `backend/src/routes/usuarios.routes.js`
- `backend/src/routes/data.routes.js`

## Validaciones

- Sintaxis validada con `node --check`.
- Controladores y rutas cargados con `require()` sin errores.
- Consistencia revisada entre nombres de funciones exportadas y rutas.
- Los endpoints protegidos usan `requireAuth`; los endpoints de consulta de criticidad usan `optionalAuth` y fallback 3/35.
