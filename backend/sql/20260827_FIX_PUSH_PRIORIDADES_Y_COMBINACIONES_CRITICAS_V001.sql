-- Mantto Gestor · Push por prioridad y combinaciones criticas
-- Fecha: 2026-08-27
-- Idempotente. Conserva el motor central, alcance UNITED y preferencias.

START TRANSACTION;

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria,
  campana_default, push_default, correo_default,
  titulo_default, mensaje_default, icono_default,
  accion_destino, ruta_default, orden, activo
) VALUES
(
  'PERSONA_ATRAPADA_EQUIPO_CRITICO', 'Operacion', 'Tickets',
  'PERSONA_ATRAPADA_EQUIPO_CRITICO', 'Persona atrapada en equipo crítico',
  'Un solo evento cuando el Ticket reporta una persona atrapada en un equipo que ya era crítico.',
  'CRITICA', 1, 0, 1, 1, 0,
  'Persona atrapada en equipo crítico',
  'Se generó un Ticket por una persona atrapada en un equipo crítico.',
  '🚨🆘', 'ABRIR_TICKET', NULL, 10, 1
),
(
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO', 'Operacion', 'Tickets',
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO', 'Persona atrapada en un nuevo equipo crítico',
  'Un solo evento cuando el Ticket reporta una persona atrapada y hace que el equipo alcance la condición crítica.',
  'CRITICA', 1, 0, 1, 1, 0,
  'Persona atrapada en un nuevo equipo crítico',
  'Se generó un Ticket por una persona atrapada y el equipo pasó a condición crítica.',
  '🚨💥', 'ABRIR_TICKET', NULL, 11, 1
)
ON DUPLICATE KEY UPDATE
  agrupacion = VALUES(agrupacion),
  modulo = VALUES(modulo),
  accion = VALUES(accion),
  nombre_evento = VALUES(nombre_evento),
  descripcion = VALUES(descripcion),
  prioridad_default = VALUES(prioridad_default),
  configurable = VALUES(configurable),
  campana_default = VALUES(campana_default),
  push_default = VALUES(push_default),
  correo_default = VALUES(correo_default),
  titulo_default = VALUES(titulo_default),
  mensaje_default = VALUES(mensaje_default),
  icono_default = VALUES(icono_default),
  accion_destino = VALUES(accion_destino),
  ruta_default = VALUES(ruta_default),
  orden = VALUES(orden),
  activo = 1;

-- Las combinaciones conservan la audiencia de cualquiera de sus eventos
-- componentes. OBLIGATORIA prevalece sobre OPCIONAL para el mismo rol.
INSERT INTO notificacion_evento_roles (codigo_evento, id_rol, politica, activo)
SELECT
  'PERSONA_ATRAPADA_EQUIPO_CRITICO',
  source.id_rol,
  CASE
    WHEN MAX(source.politica = 'OBLIGATORIA') = 1 THEN 'OBLIGATORIA'
    ELSE 'OPCIONAL'
  END,
  1
FROM notificacion_evento_roles source
WHERE source.codigo_evento IN ('PERSONA_ATRAPADA', 'FALLA_EQUIPO_CRITICO')
  AND source.activo = 1
  AND source.politica IN ('OBLIGATORIA', 'OPCIONAL')
GROUP BY source.id_rol
ON DUPLICATE KEY UPDATE
  politica = VALUES(politica),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO notificacion_evento_roles (codigo_evento, id_rol, politica, activo)
SELECT
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO',
  source.id_rol,
  CASE
    WHEN MAX(source.politica = 'OBLIGATORIA') = 1 THEN 'OBLIGATORIA'
    ELSE 'OPCIONAL'
  END,
  1
FROM notificacion_evento_roles source
WHERE source.codigo_evento IN ('PERSONA_ATRAPADA', 'NUEVO_EQUIPO_CRITICO')
  AND source.activo = 1
  AND source.politica IN ('OBLIGATORIA', 'OPCIONAL')
GROUP BY source.id_rol
ON DUPLICATE KEY UPDATE
  politica = VALUES(politica),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Prioridad global aprobada.
UPDATE notificacion_eventos
SET prioridad_default = CASE
  WHEN codigo_evento IN (
    'PERSONA_ATRAPADA',
    'FALLA_EQUIPO_CRITICO',
    'NUEVO_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
  ) THEN 'CRITICA'
  WHEN codigo_evento IN (
    'tickets.vobo.actualizado',
    'tareas.asignada',
    'soporte.solicitud.actualizada',
    'ventas.cotizacion.estatus',
    'ventas.prospeccion.estatus',
    'ventas.redes.estatus'
  ) THEN 'ALTA'
  WHEN codigo_evento IN (
    'COMENTARIO',
    'tickets.comentario.creado',
    'tareas.comentario.creado',
    'ventas.cotizacion.comentario',
    'ventas.prospeccion.comentario',
    'ventas.redes.comentario'
  ) THEN 'MEDIA'
  ELSE prioridad_default
END
WHERE codigo_evento IN (
  'PERSONA_ATRAPADA',
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO',
  'tickets.vobo.actualizado',
  'tareas.asignada',
  'soporte.solicitud.actualizada',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.estatus',
  'ventas.redes.estatus',
  'COMENTARIO',
  'tickets.comentario.creado',
  'tareas.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.prospeccion.comentario',
  'ventas.redes.comentario'
);

UPDATE notificacion_eventos
SET icono_default = CASE codigo_evento
  WHEN 'PERSONA_ATRAPADA_EQUIPO_CRITICO' THEN '🚨🆘'
  WHEN 'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO' THEN '🚨💥'
  WHEN 'PERSONA_ATRAPADA' THEN '🚨'
  WHEN 'FALLA_EQUIPO_CRITICO' THEN '🆘'
  WHEN 'NUEVO_EQUIPO_CRITICO' THEN '💥'
  ELSE icono_default
END
WHERE codigo_evento IN (
  'PERSONA_ATRAPADA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO'
);

COMMIT;

-- Verificación: clasificación y canales.
SELECT
  codigo_evento,
  nombre_evento,
  prioridad_default,
  icono_default,
  campana_default,
  push_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'PERSONA_ATRAPADA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'tickets.vobo.actualizado',
  'tareas.asignada',
  'soporte.solicitud.actualizada',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.estatus',
  'ventas.redes.estatus',
  'COMENTARIO',
  'tickets.comentario.creado',
  'tareas.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.prospeccion.comentario',
  'ventas.redes.comentario'
)
ORDER BY FIELD(prioridad_default, 'CRITICA', 'ALTA', 'MEDIA', 'BAJA'), orden, codigo_evento;

-- Verificación: ambos eventos combinados deben tener matriz activa.
SELECT
  ner.codigo_evento,
  ner.politica,
  COUNT(DISTINCT ner.id_rol) AS roles_activos
FROM notificacion_evento_roles ner
INNER JOIN roles r ON r.id_rol = ner.id_rol AND r.estado = 1
WHERE ner.codigo_evento IN (
  'PERSONA_ATRAPADA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
)
  AND ner.activo = 1
GROUP BY ner.codigo_evento, ner.politica
ORDER BY ner.codigo_evento, ner.politica;
