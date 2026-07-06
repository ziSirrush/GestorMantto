# Home - Tareas V0.4

## Objetivo
Corregir carga de catálogos y validación de fecha compromiso en la pantalla de creación/edición de tareas dentro de Home.

## Cambios aplicados

### Frontend
Archivo: `pruebas/modules/home/home.js`

- Se dejó `due_date` como campo opcional en el formulario.
- Se agregó `novalidate` al formulario para evitar validaciones HTML nativas heredadas o inconsistentes.
- Se mantiene validación manual únicamente para:
  - `pendiente` obligatorio.
  - `prioridad` obligatoria solo en tareas personales.
- Se reforzó `loadCatalogs()`:
  - Primero intenta cargar `/api/pendientes/catalogos`.
  - Si no llegan `areas`, `empresas` o `usuarios`, usa `/api/usuarios` como respaldo.
  - Deriva `areas` desde `usuarios.area`.
  - Deriva `empresas` desde `usuarios.empresa`.
  - Filtra usuarios por empresa seleccionada cuando aplica.

### Backend
Archivo: `backend/src/controllers/data.controller.js`

- Se reforzó `currentUserRef()` para considerar roles múltiples e indicador de programador.
- Se reforzó `userCanSelectMultipleEmpresas()` para evaluar `rol` y `roles`.

## Tablas respetadas

- `pendientes`
- `usuarios`
- `portafolio`
- `pendientes_usuarios`
- `pendientes_subtareas`
- `pendientes_comentarios`
- `pendientes_comentarios_adjuntos`

## Nota
No se modificaron módulos congelados.
