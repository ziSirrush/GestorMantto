# Home · Tareas personales y colaborativas V0.1

## Estado
Desarrollo / Pruebas.

## Alcance aplicado
Se programó la lógica real del stub de Home para tareas personales y colaborativas, respetando los módulos congelados.

## Archivos modificados
- `pruebas/modules/home/home.js`
- `pruebas/styles/home.css`
- `pruebas/core/router.js`
- `backend/src/routes/data.routes.js`
- `backend/src/controllers/data.controller.js`

## Funcionalidad frontend
- Home mantiene pestañas de tareas personales y colaborativas.
- Botón `+ Nueva tarea` abre formulario real según pestaña activa.
- Formulario con campos acordados:
  - pendiente obligatorio
  - prioridad obligatoria
  - fecha compromiso obligatoria
  - área
  - proyecto desde Portafolio
  - equipo dependiente del proyecto
  - descripción
  - URLs de evidencia/adjunto
  - seguimiento o responsables según tipo
  - subtareas opcionales
- Detalle de tarea dentro de Home:
  - información general
  - prioridad, estado, vencimiento
  - creador
  - responsables/seguimiento
  - subtareas con checkbox
  - comentarios
  - cambio de estado
  - edición solo para creador
- Filtros visuales en Home:
  - búsqueda
  - prioridad
  - estado

## Funcionalidad backend
Nuevos endpoints:
- `GET /api/pendientes/catalogos`
- `GET /api/pendientes`
- `GET /api/pendientes/:id`
- `POST /api/pendientes`
- `PUT /api/pendientes/:id`
- `PATCH /api/pendientes/:id/estatus`
- `POST /api/pendientes/:id/comentarios`
- `PATCH /api/pendientes/:id/subtareas/:idSubtarea`

## Tablas usadas
- `pendientes`
- `pendientes_subtareas`
- `pendientes_usuarios`
- `pendientes_comentarios`
- `pendientes_comentarios_adjuntos`
- `usuarios`
- `portafolio`

## Reglas respetadas
- Aiven MySQL como fuente oficial.
- Home consume backend Node/Express.
- No se modificaron módulos congelados de Resumen del Día, Equipos Críticos, Portafolio ni Proyectos.
- Crear tarea solo captura la base.
- Detalle concentra comentarios, subtareas y cambio de estado.
- Editar usa el mismo formulario de crear.
- Solo el creador puede editar configuración general.
