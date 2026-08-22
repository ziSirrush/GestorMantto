/* ============================================================================
   Gestor Mantto - FIX emojis faltantes en catalogo de notificaciones
   Fecha: 2026-08-18

   OBJETIVO
   - Completar SOLO icono_default vacio o NULL.
   - NO sobrescribir emojis ya configurados en Aiven.
   - Mantener las convenciones aprobadas:
       Comentarios        -> 💬
       Tarea asignada     -> 🆕
       Equipo critico     -> 💥
       Persona atrapada   -> 🚨
       Vo.Bo.             -> ✅

   No modifica esquema, rutas, politicas ni matriz Evento <-> Rol.
   ============================================================================ */

UPDATE notificacion_eventos
SET icono_default = CASE codigo_evento
    WHEN 'COMENTARIO'                       THEN '💬'
    WHEN 'tareas.comentario.creado'         THEN '💬'
    WHEN 'tickets.comentario.creado'        THEN '💬'
    WHEN 'ventas.redes.comentario'          THEN '💬'
    WHEN 'ventas.cotizacion.comentario'     THEN '💬'
    WHEN 'ventas.prospeccion.comentario'    THEN '💬'

    WHEN 'tareas.asignada'                  THEN '🆕'

    WHEN 'NUEVO_EQUIPO_CRITICO'             THEN '💥'
    WHEN 'FALLA_EQUIPO_CRITICO'             THEN '💥'

    WHEN 'PERSONA_ATRAPADA'                 THEN '🚨'

    WHEN 'tickets.vobo.actualizado'          THEN '✅'

    ELSE icono_default
END
WHERE codigo_evento IN (
    'COMENTARIO',
    'tareas.comentario.creado',
    'tickets.comentario.creado',
    'ventas.redes.comentario',
    'ventas.cotizacion.comentario',
    'ventas.prospeccion.comentario',
    'tareas.asignada',
    'NUEVO_EQUIPO_CRITICO',
    'FALLA_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA',
    'tickets.vobo.actualizado'
)
AND (icono_default IS NULL OR TRIM(icono_default) = '');

/* Verificacion de los 15 eventos actuales. */
SELECT
    codigo_evento,
    nombre_evento,
    icono_default,
    activo
FROM notificacion_eventos
WHERE codigo_evento IN (
    'COMENTARIO',
    'tareas.asignada',
    'tareas.comentario.creado',
    'NUEVO_EQUIPO_CRITICO',
    'tickets.comentario.creado',
    'FALLA_EQUIPO_CRITICO',
    'tickets.vobo.actualizado',
    'PERSONA_ATRAPADA',
    'soporte.solicitud.actualizada',
    'ventas.redes.comentario',
    'ventas.redes.estatus',
    'ventas.cotizacion.comentario',
    'ventas.cotizacion.estatus',
    'ventas.prospeccion.comentario',
    'ventas.prospeccion.estatus'
)
ORDER BY agrupacion, modulo, orden, codigo_evento;

/* Diagnostico: cualquier evento activo que siga sin emoji. */
SELECT
    codigo_evento,
    agrupacion,
    modulo,
    nombre_evento
FROM notificacion_eventos
WHERE activo = 1
  AND (icono_default IS NULL OR TRIM(icono_default) = '')
ORDER BY agrupacion, modulo, orden, codigo_evento;
