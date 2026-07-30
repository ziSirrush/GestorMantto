# FIX_COMENTARIOS_INTEGRALES_V001

## Alcance

1. Tickets de mantenimiento y Vo.Bo.
   - Restaura helpers faltantes para localizar tickets, validar responsables y roles, y generar notificaciones.
2. Comentarios de tareas Home
   - Valida acceso antes de consultar o comentar.
   - Permite comentar solo al creador o a usuarios relacionados según el tipo de tarea.
   - Genera notificaciones para creador y participantes, excluyendo al autor del comentario.
3. Comentarios de junta de Instalaciones
   - Sustituye memoria temporal por persistencia en Aiven.
   - Liga cada comentario al usuario autenticado y a la referencia estable del equipo.
   - Añade endpoints GET/POST autenticados.
4. Soporte y Cotizaciones
   - No se modifican porque la revisión estática confirmó que sus flujos ya estaban completos.

## SQL obligatorio

Ejecutar antes de desplegar backend:

`backend/sql/20260729_VENTAS_COMENTARIOS_INTEGRALES_V001.sql`

## Archivos modificados

- backend/src/controllers/data.controller.legacy.js
- backend/src/routes/index.js
- modules/instalaciones-proyectos/instalaciones-proyectos.js

## Archivos nuevos

- backend/src/modules/instalaciones-comentarios-junta/*
- backend/sql/20260729_VENTAS_COMENTARIOS_INTEGRALES_V001.sql

## Validación ejecutada

- node --check sobre todos los archivos JS modificados y nuevos
- npm run check en backend
