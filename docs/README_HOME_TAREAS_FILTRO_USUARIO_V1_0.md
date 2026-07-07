# Home/Tareas - Filtro por usuario V1.0

Fecha: 2026-07-07

## Cambio aplicado

Se reforzo el filtro de visibilidad de tareas en Home/Tareas.

### Tareas personales
Solo se devuelven/muestran tareas donde el usuario autenticado sea el creador:

- `pendientes.tipo_pendiente = 'PERSONAL'`
- `pendientes.creado_por_email = correo del usuario autenticado`

### Tareas colaborativas
Solo se devuelven/muestran tareas donde el usuario autenticado sea:

- creador de la tarea, o
- responsable directo en `pendientes_usuarios` con `tipo_relacion = 'RESPONSABLE'`.

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `pruebas/modules/home/home.js`

## Nota tecnica

El filtro principal se aplica en backend dentro de `/api/home/bootstrap` para evitar exponer tareas de otros usuarios.
Tambien se agrego un filtro defensivo en el modulo Home para evitar visualizaciones incorrectas si el navegador/API conserva una respuesta anterior o si se consume una version no actualizada del endpoint.

## Validacion

- `node --check backend/src/controllers/data.controller.js`
- `node --check pruebas/modules/home/home.js`
