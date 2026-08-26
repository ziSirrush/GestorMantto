-- [Gestor Mantto | 2026-08-25 | FASE 2 NOTIFICACIONES]
-- PRE-FLIGHT / POST-FLIGHT de emisores Tareas, Tickets y Soporte.
-- SOLO LECTURA. No modifica esquema ni datos.
--
-- Prerrequisito: aplicar primero la Fase 1 del motor central.
-- Esta Fase 2 no crea tablas ni agrega catalogos nuevos.

-- 1) Deben existir y estar activos exactamente los cinco eventos usados por Fase 2.
SELECT
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  nombre_evento,
  obligatoria,
  campana_default,
  push_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'tareas.asignada',
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'tickets.vobo.actualizado',
  'soporte.solicitud.actualizada'
)
ORDER BY codigo_evento;

-- 2) Cada evento activo de Fase 2 debe tener al menos una relacion Evento-Rol ACTIVA.
SELECT
  e.codigo_evento,
  e.activo AS evento_activo,
  COUNT(CASE WHEN ner.activo = 1 THEN 1 END) AS relaciones_rol_activas,
  CASE
    WHEN e.activo <> 1 THEN 'EVENTO_INACTIVO'
    WHEN COUNT(CASE WHEN ner.activo = 1 THEN 1 END) = 0 THEN 'SIN_ROLES_ACTIVOS'
    ELSE 'OK'
  END AS diagnostico
FROM notificacion_eventos e
LEFT JOIN notificacion_evento_roles ner
  ON ner.codigo_evento = e.codigo_evento
WHERE e.codigo_evento IN (
  'tareas.asignada',
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'tickets.vobo.actualizado',
  'soporte.solicitud.actualizada'
)
GROUP BY e.codigo_evento, e.activo
ORDER BY e.codigo_evento;

-- 3) Detalle de la matriz activa que realmente puede participar en el motor.
SELECT
  ner.codigo_evento,
  ner.id_rol,
  r.rol,
  ner.politica,
  ner.activo AS relacion_activa,
  r.estado AS rol_activo
FROM notificacion_evento_roles ner
LEFT JOIN roles r
  ON r.id_rol = ner.id_rol
WHERE ner.codigo_evento IN (
  'tareas.asignada',
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'tickets.vobo.actualizado',
  'soporte.solicitud.actualizada'
)
  AND ner.activo = 1
ORDER BY ner.codigo_evento, r.rol, ner.id_rol;

-- 4) Relaciones activas apuntando a roles inexistentes o inactivos.
-- El resultado esperado es 0 filas.
SELECT
  ner.codigo_evento,
  ner.id_rol,
  ner.politica,
  ner.activo,
  r.rol,
  r.estado
FROM notificacion_evento_roles ner
LEFT JOIN roles r
  ON r.id_rol = ner.id_rol
WHERE ner.codigo_evento IN (
  'tareas.asignada',
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'tickets.vobo.actualizado',
  'soporte.solicitud.actualizada'
)
  AND ner.activo = 1
  AND (r.id_rol IS NULL OR r.estado <> 1);

-- 5) Prerrequisito estructural de Fase 1: identidad y traza persistentes.
-- Deben aparecer clave_deduplicacion y trace_id.
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sup_notificaciones'
  AND COLUMN_NAME IN ('clave_deduplicacion', 'trace_id')
ORDER BY COLUMN_NAME;

-- 6) Debe existir un indice unico que incluya usuario + tipo + clave de deduplicacion.
SELECT
  INDEX_NAME,
  NON_UNIQUE,
  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columnas
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sup_notificaciones'
GROUP BY INDEX_NAME, NON_UNIQUE
HAVING NON_UNIQUE = 0
   AND FIND_IN_SET('id_usuario', columnas) > 0
   AND FIND_IN_SET('tipo_notificacion', columnas) > 0
   AND FIND_IN_SET('clave_deduplicacion', columnas) > 0;

-- 7) Usuarios con asociaciones de rol activas hacia roles inactivos/inexistentes.
-- El resultado esperado es 0 filas.
SELECT
  ur.id_usuario,
  ur.id_rol,
  r.rol,
  r.estado
FROM usuario_roles ur
LEFT JOIN roles r
  ON r.id_rol = ur.id_rol
WHERE ur.activo = 1
  AND (r.id_rol IS NULL OR r.estado <> 1)
ORDER BY ur.id_usuario, ur.id_rol;

-- 8) Diagnostico territorial UNITED para usuarios activos.
-- No implica error que un usuario no tenga zona si su flujo no usa UNITED o posee llave maestra.
SELECT
  u.id_SB,
  u.nombre,
  COUNT(DISTINCT CASE WHEN uz.estado = 1 AND z.estado = 1 THEN uz.zona_id END) AS zonas_activas
FROM usuarios u
LEFT JOIN usuario_zop uz
  ON uz.usuario_id = u.id_SB
LEFT JOIN z_op z
  ON z.id_zona = uz.zona_id
WHERE u.estado = 1
GROUP BY u.id_SB, u.nombre
ORDER BY u.id_SB;
