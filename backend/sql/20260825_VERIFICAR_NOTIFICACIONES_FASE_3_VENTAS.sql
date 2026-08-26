-- [Gestor Mantto | 2026-08-25 | FASE 3 NOTIFICACIONES]
-- PRE-FLIGHT / POST-FLIGHT de Ventas: Cotizaciones, Prospeccion y Redes.
-- SOLO LECTURA. No modifica esquema ni datos.
--
-- Prerrequisitos:
--   1) Fase 1 - motor central de notificaciones.
--   2) Fase 2 - emisor seguro post-accion.
--
-- Fase 3 NO crea tablas ni agrega eventos nuevos. Usa los seis eventos
-- que ya existen en notificacion_eventos / Panel de Control.

-- 1) Los seis eventos oficiales de Fase 3 deben existir.
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
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
ORDER BY codigo_evento;

-- 2) Cada evento activo debe tener al menos una relacion Evento-Rol ACTIVA.
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
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
GROUP BY e.codigo_evento, e.activo
ORDER BY e.codigo_evento;

-- 3) Matriz activa y politica por Rol. Esta configuracion es la autoridad;
-- Fase 3 no redefine obligatorio/opcional en codigo.
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
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
  AND ner.activo = 1
ORDER BY ner.codigo_evento, r.rol, ner.id_rol;

-- 4) Relaciones activas a roles inexistentes/inactivos.
-- Resultado esperado: 0 filas.
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
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
  AND ner.activo = 1
  AND (r.id_rol IS NULL OR r.estado <> 1);

-- 5) Usuarios activos que pueden llegar al filtro de alcance de Ventas
-- por tener AL MENOS un Rol activo configurado para cada evento.
SELECT
  ner.codigo_evento,
  COUNT(DISTINCT u.id_SB) AS usuarios_con_rol_activo
FROM notificacion_evento_roles ner
INNER JOIN roles r
  ON r.id_rol = ner.id_rol
 AND r.estado = 1
INNER JOIN usuario_roles ur
  ON ur.id_rol = r.id_rol
 AND ur.activo = 1
INNER JOIN usuarios u
  ON u.id_SB = ur.id_usuario
 AND u.estado = 1
WHERE ner.codigo_evento IN (
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
  AND ner.activo = 1
GROUP BY ner.codigo_evento
ORDER BY ner.codigo_evento;

-- 6) Alcance de Informacion CORELLIAN persistido para los usuarios que
-- participan en la matriz de Fase 3. Es diagnostico: el resolver oficial
-- de Ventas tambien conserva su fallback de compatibilidad actual.
SELECT
  u.id_SB,
  u.nombre,
  SUM(CASE
        WHEN uai.activo = 1
         AND uai.tipo_alcance = 'DOMINIO_COMPLETO'
         AND UPPER(TRIM(COALESCE(uai.dominio, ''))) = 'CORELLIAN'
        THEN 1 ELSE 0
      END) AS dominio_corellian_completo,
  SUM(CASE WHEN uai.activo = 1 AND uai.tipo_alcance = 'REPORTA_A' THEN 1 ELSE 0 END) AS usa_reporta_a,
  SUM(CASE WHEN uai.activo = 1 AND uai.tipo_alcance = 'REL_ADMIN' THEN 1 ELSE 0 END) AS usa_rel_admin,
  SUM(CASE WHEN uai.activo = 1 AND uai.tipo_alcance = 'USUARIO' THEN 1 ELSE 0 END) AS usuarios_adicionales
FROM usuarios u
LEFT JOIN usuarios_alcance_informacion uai
  ON uai.id_usuario = u.id_SB
WHERE u.estado = 1
  AND EXISTS (
    SELECT 1
      FROM usuario_roles ur
      INNER JOIN roles r
        ON r.id_rol = ur.id_rol
       AND r.estado = 1
      INNER JOIN notificacion_evento_roles ner
        ON ner.id_rol = r.id_rol
       AND ner.activo = 1
     WHERE ur.id_usuario = u.id_SB
       AND ur.activo = 1
       AND ner.codigo_evento IN (
         'ventas.cotizacion.comentario',
         'ventas.cotizacion.estatus',
         'ventas.prospeccion.comentario',
         'ventas.prospeccion.estatus',
         'ventas.redes.comentario',
         'ventas.redes.estatus'
       )
  )
GROUP BY u.id_SB, u.nombre
ORDER BY u.id_SB;

-- 7) Prerrequisito estructural de Fase 1: deduplicacion y traza persistentes.
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

-- 8) Debe existir un indice unico que incluya usuario + tipo + clave.
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
