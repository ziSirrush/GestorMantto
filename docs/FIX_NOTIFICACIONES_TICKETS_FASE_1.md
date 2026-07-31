# FIX Notificaciones de Tickets - Fase 1

## Causa encontrada

El flujo de Tickets solo seleccionaba destinatarios mediante coincidencia textual con responsables del ticket. Si no encontraba responsables, terminaba sin crear notificaciones. Tampoco incorporaba los cargos obligatorios ni los administrativos relacionados.

## Cambio aplicado

Se actualizó `backend/src/controllers/data.controller.legacy.js` para:

- Consultar usuarios activos y sus roles principales/asociados mediante `usuarios`, `roles` y `usuario_roles`.
- Incluir obligatoriamente a usuarios activos con los roles:
  - Director General
  - Director Mantenimiento
  - Auxiliar Direccion
  - Jefa de Atencion a Cliente
- Mantener como destinatarios a los responsables relacionados con el ticket encontrados en Tickets y Portafolio.
- Agregar administradores activos relacionados mediante `usuarios_rel_admin`.
- Unificar destinatarios por ID para evitar duplicados.
- Excluir siempre al usuario que ejecutó la acción.
- Continuar generando notificaciones obligatorias aunque el ticket no tenga responsables textuales identificables.
- Devolver en las respuestas de comentario y validación:
  - `notificaciones_creadas`
  - `destinatarios_notificacion`

## Archivo modificado

- `backend/src/controllers/data.controller.legacy.js`

## Validaciones realizadas

- `node --check backend/src/controllers/data.controller.legacy.js`: correcto.
- `npm run check`: estructura backend correcta.
- Verificación de consistencia de tablas y columnas contra los SQL entregados:
  - `usuarios.id_SB`, `usuarios.rol_id`, `usuarios.estado`
  - `roles.id_rol`, `roles.rol`, `roles.estado`
  - `usuario_roles.id_usuario`, `usuario_roles.id_rol`, `usuario_roles.activo`
  - `usuarios_rel_admin.id_asesor`, `usuarios_rel_admin.id_admin`
  - `sup_notificaciones`
- No se modificaron rutas, frontend, base de datos ni módulos ajenos.

## Alcance pendiente

La incompatibilidad de algunos estados de validación enviados desde Resumen del Día corresponde a la Fase 2 y no fue modificada aquí.
