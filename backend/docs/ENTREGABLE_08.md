# Entregable 08 - Modulo Pendientes

## Objetivo

Registrar el dominio Pendientes dentro de la arquitectura modular sin cambiar
URLs, middlewares, contratos JSON ni reglas de negocio ya validadas.

## Archivos incluidos

- `src/modules/pendientes/pendientes.routes.js`
- `src/modules/pendientes/pendientes.controller.js`
- `src/modules/pendientes/pendientes.service.js`
- `src/modules/pendientes/pendientes.repository.js`
- `src/routes/data/pendientes.routes.js`

## Rutas conservadas

- `GET /api/pendientes/catalogos`
- `GET /api/pendientes`
- `GET /api/pendientes/:id`
- `POST /api/pendientes`
- `PUT /api/pendientes/:id`
- `DELETE /api/pendientes/:id`
- `PATCH /api/pendientes/:id/estatus`
- `PATCH /api/pendientes/:id/prioridad`
- `POST /api/pendientes/:id/comentarios`
- `PATCH /api/pendientes/:id/subtareas/:idSubtarea`

## Estrategia transicional

Este entregable crea la cadena `routes -> controller -> service -> repository`.
Para preservar exactamente el comportamiento actual, el repository resuelve los
handlers validados que aun viven en `controllers/data.controller.js`.

Esta dependencia es intencional y temporal. No se deben eliminar todavia las
funciones legacy de Pendientes. La extraccion definitiva de SQL y reglas internas
se realizara durante la limpieza final, despues de validar todos los modulos.

## Validacion sugerida

1. Iniciar backend.
2. Validar `/api/health`.
3. Abrir Home y comprobar tareas personales y colaborativas.
4. Crear, editar y eliminar una tarea de prueba.
5. Probar prioridad, estatus, comentarios, adjuntos y subtareas.
6. Confirmar filtros de usuario y restricciones de creador/responsable.
