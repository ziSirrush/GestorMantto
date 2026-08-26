-- [Aster | 2026-08-25 | ASTER-MG | VERIFICACION: NOTIFICACIONES FASE 4 CRITICOS V001]
-- SOLO LECTURA. No modifica datos ni estructura.

-- 1) Los tres eventos criticos deben existir y estar activos.
SELECT
  e.codigo_evento,
  e.nombre_evento,
  e.activo,
  e.campana_default,
  e.push_default,
  e.accion_destino,
  e.ruta_default
FROM notificacion_eventos e
WHERE e.codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
)
ORDER BY e.codigo_evento;

-- 2) Cada evento activo debe tener al menos una relacion Evento-Rol ACTIVA.
SELECT
  e.codigo_evento,
  COUNT(DISTINCT CASE
    WHEN ner.activo = 1
     AND r.estado = 1
     AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
    THEN ner.id_rol END) AS roles_activos,
  SUM(CASE WHEN ner.activo = 1 AND ner.politica = 'OBLIGATORIA' THEN 1 ELSE 0 END) AS relaciones_obligatorias,
  SUM(CASE WHEN ner.activo = 1 AND ner.politica = 'OPCIONAL' THEN 1 ELSE 0 END) AS relaciones_opcionales
FROM notificacion_eventos e
LEFT JOIN notificacion_evento_roles ner
  ON ner.codigo_evento = e.codigo_evento
LEFT JOIN roles r
  ON r.id_rol = ner.id_rol
WHERE e.codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
)
GROUP BY e.codigo_evento
ORDER BY e.codigo_evento;

-- 3) Usuarios potenciales por TODOS sus roles activos, no solo el principal.
SELECT
  ner.codigo_evento,
  COUNT(DISTINCT u.id_SB) AS usuarios_con_rol_activo,
  COUNT(DISTINCT CASE WHEN ur.principal = 1 THEN u.id_SB END) AS usuarios_via_rol_principal,
  COUNT(DISTINCT CASE WHEN COALESCE(ur.principal, 0) = 0 THEN u.id_SB END) AS usuarios_via_rol_no_principal
FROM notificacion_evento_roles ner
INNER JOIN roles r
  ON r.id_rol = ner.id_rol
 AND r.estado = 1
INNER JOIN usuario_roles ur
  ON ur.id_rol = ner.id_rol
 AND ur.activo = 1
INNER JOIN usuarios u
  ON u.id_SB = ur.id_usuario
 AND u.estado = 1
WHERE ner.activo = 1
  AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
  AND ner.codigo_evento IN (
    'FALLA_EQUIPO_CRITICO',
    'NUEVO_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA'
  )
GROUP BY ner.codigo_evento
ORDER BY ner.codigo_evento;

-- 4) Salud de la llave territorial estructurada de Portafolio.
--    zona_id nula o un equipo repetido en zonas diferentes impedira resolver
--    de forma segura el destino territorial de una notificacion.
SELECT
  COUNT(*) AS filas_portafolio_activas,
  SUM(CASE WHEN p.zona_id IS NULL THEN 1 ELSE 0 END) AS filas_sin_zona_id,
  COUNT(DISTINCT p.zona_id) AS zonas_estructuradas
FROM portafolio p
WHERE p.estado_registro = 1;

SELECT
  p.numero_equipo,
  COUNT(*) AS filas,
  COUNT(DISTINCT p.zona_id) AS zonas_distintas,
  GROUP_CONCAT(DISTINCT p.zona_id ORDER BY p.zona_id) AS zona_ids
FROM portafolio p
WHERE p.estado_registro = 1
  AND NULLIF(TRIM(COALESCE(p.numero_equipo, '')), '') IS NOT NULL
GROUP BY p.numero_equipo
HAVING SUM(CASE WHEN p.zona_id IS NULL THEN 1 ELSE 0 END) > 0
    OR COUNT(DISTINCT p.zona_id) <> 1
ORDER BY p.numero_equipo;

-- 5) Estado actual de equipos que cumplen el criterio ya existente:
--    3 o mas tickets BLT dentro de los ultimos 35 dias.
SELECT
  p.numero_equipo,
  MIN(p.proyecto) AS proyecto,
  MIN(p.zona_id) AS zona_id,
  COUNT(DISTINCT t.id) AS fallas_blt_35_dias
FROM portafolio p
INNER JOIN tickets t
  ON t.codigo_equipo = p.numero_equipo
 AND t.fecha_reporte IS NOT NULL
 AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL 35 DAY)
 AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
WHERE p.estado_registro = 1
  AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
  AND UPPER(TRIM(COALESCE(p.estatus_servicio, ''))) NOT LIKE '%NO EN SERVICIO%'
GROUP BY p.numero_equipo
HAVING COUNT(DISTINCT t.id) >= 3
ORDER BY fallas_blt_35_dias DESC, p.numero_equipo;

-- 6) Llave maestra UNITED y zonas territoriales disponibles para destinatarios.
SELECT
  u.id_SB AS id_usuario,
  u.nombre,
  EXISTS (
    SELECT 1
    FROM usuarios_alcance_informacion uai
    WHERE uai.id_usuario = u.id_SB
      AND uai.activo = 1
      AND uai.tipo_alcance = 'DOMINIO_COMPLETO'
      AND UPPER(TRIM(uai.dominio)) = 'UNITED'
  ) AS united_dominio_completo,
  GROUP_CONCAT(DISTINCT CASE WHEN uz.estado = 1 THEN uz.zona_id END ORDER BY uz.zona_id) AS zona_ids
FROM usuarios u
LEFT JOIN usuario_zop uz
  ON uz.usuario_id = u.id_SB
WHERE u.estado = 1
GROUP BY u.id_SB, u.nombre
ORDER BY u.id_SB;

-- 7) Verificar columnas de deduplicacion/diagnostico incorporadas por Fase 1.
SELECT
  c.COLUMN_NAME,
  c.DATA_TYPE,
  c.IS_NULLABLE
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA = DATABASE()
  AND c.TABLE_NAME = 'sup_notificaciones'
  AND c.COLUMN_NAME IN ('clave_deduplicacion', 'trace_id')
ORDER BY c.COLUMN_NAME;

-- 8) Notificaciones criticas ya existentes y su destino real.
SELECT
  n.id_notificacion,
  n.id_usuario,
  n.tipo_notificacion,
  n.id_referencia,
  n.accion_notificacion,
  n.ruta_destino,
  n.clave_deduplicacion,
  n.trace_id,
  n.fecha_creacion
FROM sup_notificaciones n
WHERE n.tipo_notificacion IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
)
ORDER BY n.id_notificacion DESC
LIMIT 200;

-- 9) Detectar duplicados logicos en datos historicos. Fase 4 no los borra.
SELECT
  n.id_usuario,
  n.tipo_notificacion,
  n.id_referencia,
  COUNT(*) AS total
FROM sup_notificaciones n
WHERE n.activo = 1
  AND n.tipo_notificacion IN (
    'FALLA_EQUIPO_CRITICO',
    'NUEVO_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA'
  )
GROUP BY n.id_usuario, n.tipo_notificacion, n.id_referencia
HAVING COUNT(*) > 1
ORDER BY total DESC, n.tipo_notificacion, n.id_referencia;
