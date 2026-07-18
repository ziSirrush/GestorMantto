# Entregable 09 - Modulo Notificaciones

## Objetivo

Migrar las operaciones del dominio Notificaciones desde `src/controllers/data.controller.js` al patron modular:

`routes -> controller -> service -> repository`

sin cambiar rutas, middlewares, contratos JSON ni comportamiento del frontend.

## Archivos incluidos

- `src/modules/notificaciones/notificaciones.routes.js`
- `src/modules/notificaciones/notificaciones.controller.js`
- `src/modules/notificaciones/notificaciones.service.js`
- `src/modules/notificaciones/notificaciones.repository.js`
- `src/routes/data/notificaciones.routes.js`

## Endpoints migrados

- `GET /api/notificaciones`
- `PATCH /api/notificaciones/:id/abrir`
- `PATCH /api/notificaciones/:id/nuevo`

## Compatibilidad temporal

Las rutas siguientes ya estaban alojadas en el adaptador de Notificaciones, pero funcionalmente pertenecen al dominio Usuarios:

- `GET /api/usuarios`
- `GET /api/users`

Por seguridad se conservan apuntando temporalmente a `data.controller.js`. No deben eliminarse ni moverse hasta migrar el dominio Usuarios o confirmar que existen rutas equivalentes registradas sin conflicto.

## Comportamiento preservado

- Filtro por usuario autenticado cuando existe `req.user`.
- Alcance de tareas personales y colaborativas.
- Filtros compatibles: `estado`, `status` y `tipo_vista`.
- Estados compatibles: nuevas/no leidas y abiertas/leidas.
- Limite por defecto: 30 nuevas y 80 abiertas.
- Limite permitido: 1 a 200.
- Orden cronologico existente.
- Validacion de propiedad de la notificacion al abrirla o marcarla como nueva.
- Mismos codigos HTTP, mensajes y estructura JSON.

## No eliminar todavia

Conservar en `src/controllers/data.controller.js`:

- `getNotificaciones`
- `abrirNotificacion`
- `marcarNotificacionNueva`
- `getUsuarios`

La limpieza se realizara solamente despues de validar todos los modulos y referencias legacy.

## Validacion recomendada

1. Ejecutar `npm run check`.
2. Iniciar backend con `npm start`.
3. Confirmar `/api/health`.
4. Probar campana con notificaciones nuevas.
5. Abrir una notificacion y confirmar que pase al historial.
6. Marcar una notificacion abierta como nueva.
7. Confirmar que un usuario no pueda modificar notificaciones ajenas.
8. Confirmar que `/api/usuarios` y `/api/users` sigan respondiendo.
