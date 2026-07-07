# ARCHIVOS MODIFICADOS - HOME TAREAS V0.3

Base: `pruebas_home_tareas_v0_2.zip`.

## Archivos modificados

- `pruebas/modules/home/home.js`
- `pruebas/styles/home.css`
- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`

## Cambios aplicados

- `prioridad` puede ser `NULL` en tareas colaborativas.
- En tareas personales, el creador sigue capturando prioridad.
- En tareas colaborativas, el creador no captura prioridad; el responsable la define desde el detalle.
- Se agregó endpoint `PATCH /api/pendientes/:id/prioridad`.
- El selector de Seguimiento/Responsables cambió de lista de checkboxes a multiselect con chips de iniciales.
- Catálogos de empresa se limitan por empresa del usuario, salvo usuarios multiempresa/director/programador cuando el token lo permita.
- Equipo mantiene como valor guardado `numero_equipo`; visualmente muestra `identificacion_sitio · numero_equipo`.
- Se mantiene máximo 1 evidencia directa en la tarea: imagen o archivo.

## Nota

No se modificaron módulos congelados.
