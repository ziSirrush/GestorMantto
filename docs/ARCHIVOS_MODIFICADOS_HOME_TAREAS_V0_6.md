# ARCHIVOS MODIFICADOS - HOME TAREAS V0.6

## Objetivo
Corregir la generacion de notificaciones al crear o actualizar tareas colaborativas.

## Archivos modificados

- `backend/src/controllers/data.controller.js`

## Cambios realizados

1. `createTaskAssignmentNotifications` ahora toma como fuente principal los responsables ya guardados en `pendientes_usuarios`.
2. Se mantiene fallback al payload `usuarios` para compatibilidad.
3. Al crear una tarea colaborativa, el backend inserta una notificacion en `sup_notificaciones` por cada responsable.
4. Para esta version de prueba, si el creador se agrego como responsable, tambien se genera notificacion para el creador, con el fin de probar campanita e historial.
5. La respuesta de crear/editar tarea incluye:
   - `notificaciones_creadas`
   - `notificaciones_destinatarios`

## Flujo esperado

- Crear tarea personal: no genera notificacion de asignacion.
- Crear tarea colaborativa con responsables: genera registros en `sup_notificaciones` con `leido = 0`.
- Campanita: debe mostrar esas notificaciones nuevas.
- Al abrirlas: se marcan como `leido = 1` y pasan al historial de Home.

## Pendiente para version definitiva

- Bloquear que el creador se seleccione a si mismo en seguimiento/responsables.
- Agregar boton `Marcar como nuevo` / `Marcar como no leida` en el historial de notificaciones.
- Retirar la excepcion de prueba que permite notificar al creador si se autoasigna.
