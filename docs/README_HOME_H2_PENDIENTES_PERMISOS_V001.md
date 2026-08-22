# HOME H2 · Pendientes modular + permiso botón Hoy

Fecha: 2026-08-18

## Alcance

Este FIX completa H2 sobre la base de H1.

### 1. Pendientes/Tareas deja de depender del controlador Legacy

Antes:

`pendientes.routes -> pendientes.controller -> pendientes.service -> pendientes.repository -> data.controller -> data.controller.legacy -> Aiven`

Después:

`pendientes.routes -> pendientes.controller -> pendientes.service -> pendientes.repository -> Aiven`

Se conservaron las rutas y reglas operativas existentes de:

- catálogos de Tareas;
- listado y detalle;
- creación y edición;
- eliminación;
- cambio de estatus;
- cambio de prioridad;
- subtareas;
- comentarios y adjuntos;
- asignaciones y notificaciones existentes de Tareas;
- permisos contextuales de creador/responsable;
- filtrado personal/colaborativo por usuario autenticado.

`data.controller.legacy.js` NO se elimina ni se modifica, porque Tickets/Portafolio y otros dominios todavía conservan dependencias legacy. La fachada `data.controller.js` deja de exportar los handlers de Pendientes, por lo que el módulo de Tareas ya no depende de ella en tiempo de ejecución.

### 2. Botón Home > Hoy

Se fuerza el permiso existente:

`GENERAL_INICIO_BARRA_BIENVENIDA_BOTON_HOY.ABRIR_RESUMEN_DEL_DIA`

Comportamiento:

- sin permiso efectivo, el botón Hoy queda oculto;
- además existe un guard de clic en captura para impedir la navegación aunque otro código intente dispararla;
- si el motor de permisos todavía no ha cargado, el acceso queda cerrado temporalmente (fail-closed);
- al actualizar permisos se recalcula automáticamente la visibilidad.

No se creó ningún permiso ni registro SQL nuevo.

## Compatibilidad con H1

`core/app.js` parte de la versión H1 y conserva la carga/inicialización de `core/interactions.js`. Por eso H2 debe aplicarse después de H1 o sobre una rama que ya contenga H1.

Las operaciones exitosas de Tareas continúan entrando al registro general de `usuario_interacciones` a través del middleware H1; H2 no duplica esa lógica dentro de Pendientes.

## Archivos modificados

- `backend/src/modules/pendientes/pendientes.repository.js`
- `backend/src/modules/pendientes/pendientes.service.js`
- `backend/src/modules/pendientes/pendientes.controller.js`
- `backend/src/controllers/data.controller.js`
- `core/app.js`

## No modificado

- Push Notifications.
- Motor de Notificaciones.
- `data.controller.legacy.js`.
- esquema de Aiven.
- `usuario_interacciones`.
- rutas HTTP existentes de Pendientes.
- módulos en Nevera no relacionados.
