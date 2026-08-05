# FIX SOPORTE CREACION ERROR 500 - COMPATIBILIDAD V001

## Causa atendida
La creación usaba un INSERT rígido que exigía `fecha_incidente`, `empresa`, `historial` y columnas de fecha aunque alguna no existiera todavía en la estructura desplegada de `sup_tickets`. MySQL respondía 500 y el controlador ocultaba la causa técnica.

## Cambios
- El INSERT consulta la estructura real de `sup_tickets`.
- Solo incluye columnas opcionales cuando existen.
- Conserva como obligatorias las columnas fundamentales de una solicitud.
- Registra en Azure Log Stream el error SQL real y un `request_id`.
- La respuesta mantiene un mensaje seguro para el usuario.

## Archivos
- `backend/src/modules/support/support-files.repository.js`
- `backend/src/controllers/support.controller.js`

## Alcance excluido
- No modifica permisos.
- No modifica el Visor de Usuarios.
- No modifica `device-permissions/sync`.
- No requiere SQL adicional para que la creación sea compatible; la migración de fechas sigue siendo recomendable para conservar `fecha_incidente` como dato independiente.
