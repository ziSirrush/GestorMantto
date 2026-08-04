# Backend Usuarios Schema v0.4

## Objetivo
Agregar rutas controladas para el esquema real del módulo Usuarios sin romper las rutas existentes.

## Rutas nuevas

### Usuarios
- `GET /api/usuarios`
- `GET /api/usuarios/directorio`
- `GET /api/usuarios/:id`
- `GET /api/usuarios/:id/detalle`
- `GET /api/usuarios/:id/roles`
- `GET /api/usuarios/:id/zonas`
- `POST /api/usuarios`
- `PUT /api/usuarios/:id`

### Catálogos
- `GET /api/catalogos/roles`
- `GET /api/catalogos/zonas`
- `GET /api/catalogos/preguntas-seguridad`
- `GET /api/catalogos/usuarios-superiores`

### Desarrollo, solo Programador
- `GET /api/dev/tables`
- `GET /api/dev/schema`
- `GET /api/dev/table/:table/columns`
- `GET /api/dev/table/:table/count`
- `GET /api/dev/table/:table/rows`

## Alta y edición de usuarios
`POST /api/usuarios` y `PUT /api/usuarios/:id` trabajan con transacción MySQL y actualizan:
- `usuarios`
- `usuario_roles`
- `usuario_zop`
- `auth_audit`

Si falla alguna validación, se hace rollback.

## Seguridad
- Las rutas requieren sesión.
- Alta requiere permiso `crear_usuario`, `programador` o rol Programador.
- Edición requiere permiso `editar_usuario`, `programador` o rol Programador.
- Rutas `/api/dev/*` solo permiten rol Programador.
- Las rutas de desarrollo ocultan columnas sensibles: `pass`, `respuesta_recuperacion`, `totp_secret`, `recovery_codes`.

## Archivos modificados/agregados
- `server.js`
- `src/controllers/usuarios.controller.js`
- `src/controllers/catalogos.controller.js`
- `src/controllers/dev.controller.js`
- `src/routes/usuarios.routes.js`
- `src/routes/catalogos.routes.js`
- `src/routes/dev.routes.js`
- `src/utils/passwordRules.js`
