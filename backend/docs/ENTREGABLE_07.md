# Entregable 07 - Home

## Objetivo

Migrar el modulo Home desde `src/controllers/data.controller.js` hacia la arquitectura modular:

`route -> controller -> service -> repository -> MySQL`

sin modificar las rutas publicas ni el contrato JSON consumido por el frontend.

## Archivos incluidos

- `src/modules/home/home.routes.js`
- `src/modules/home/home.controller.js`
- `src/modules/home/home.service.js`
- `src/modules/home/home.repository.js`
- `src/routes/data/home.routes.js`

## Endpoints conservados

- `GET /api/home/bootstrap`
- `GET /api/actividad-reciente`

## Comportamiento conservado

- `requireAuth` para `/home/bootstrap`.
- `optionalAuth` para `/actividad-reciente`.
- Filtro de pendientes personales y colaborativos por usuario autenticado.
- Notificaciones nuevas y abiertas limitadas al alcance de tareas del usuario.
- Actividad reciente de tareas y comentarios.
- Catalogos de areas, empresas, usuarios y proyectos.
- Formato de respuesta y mensajes de error existentes.

## Instalacion

Copiar la carpeta `backend/` de este entregable sobre la copia de trabajo y reemplazar solamente los archivos coincidentes.

## Validacion recomendada

1. Ejecutar validacion de sintaxis con `node --check`.
2. Iniciar el backend.
3. Validar `/api/health`.
4. Iniciar sesion en el frontend.
5. Confirmar carga de Home, pendientes, actividad reciente y notificaciones.
6. Confirmar que los catalogos de empresa, usuarios y proyectos carguen correctamente.

## Seguridad de migracion

No eliminar todavia `getHomeBootstrap` ni `getActividadReciente` de `src/controllers/data.controller.js`. El codigo legacy permanece como respaldo hasta completar y validar toda la migracion.
