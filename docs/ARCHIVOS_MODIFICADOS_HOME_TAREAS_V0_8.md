# ARCHIVOS MODIFICADOS - HOME TAREAS V0.8

## Objetivo
Aplicar reglas definitivas de seguridad para tareas y completar la eliminación controlada.

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`
- `pruebas/modules/home/home.js`
- `pruebas/styles/home.css`

## Cambios

1. Se bloquea la autoasignación del creador:
   - El frontend ya no muestra al creador en Seguimiento/Responsables.
   - El backend filtra al creador aunque llegue manipulado en el payload.
   - Si se bloquea autoasignación, no se crea relación ni notificación para el creador.

2. Estatus de tarea:
   - Solo el creador puede cambiar el estatus general de la tarea.
   - Los responsables no pueden cambiar el estatus general.

3. Eliminación de tarea:
   - Solo el creador puede eliminar una tarea.
   - Se agregó botón `Eliminar tarea` en el detalle, visible solo para el creador.
   - Se agregó doble confirmación mediante ventana flotante.
   - Al confirmar, se eliminan relaciones asociadas:
     - `pendientes_comentarios_adjuntos`
     - `pendientes_comentarios`
     - `pendientes_subtareas`
     - `pendientes_usuarios`
     - `sup_notificaciones` relacionadas a la tarea
     - `pendientes`

4. Corrección técnica adicional:
   - Se corrigió una consulta duplicada en prioridad (`WHERE` repetido) para evitar error SQL.

## Notas

- No se modificaron módulos congelados.
- La eliminación está protegida en frontend y backend.
- La autoasignación queda bloqueada de forma visual y por backend.
