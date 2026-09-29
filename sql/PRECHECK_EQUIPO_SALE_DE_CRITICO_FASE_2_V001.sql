-- Mantto Gestor · PRECHECK · EQUIPO_SALE_DE_CRITICO · Fase 2 V001
-- Solo lectura. No modifica datos ni estructura.
-- Prerrequisito: Fase 1 aplicada y evento EQUIPO_SALE_DE_CRITICO existente.

SET @schema_name = DATABASE();
SET @hoy_cdmx = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00'));
SET @ayer_cdmx = DATE_SUB(@hoy_cdmx, INTERVAL 1 DAY);

SELECT @schema_name AS schema_actual, @hoy_cdmx AS hoy_cdmx, @ayer_cdmx AS ayer_cdmx;

SELECT
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  nombre_evento,
  descripcion,
  prioridad_default,
  configurable,
  campana_default,
  push_default,
  accion_destino,
  ruta_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';

SELECT
  ner.codigo_evento,
  ner.id_rol,
  r.rol,
  ner.politica,
  ner.activo
FROM notificacion_evento_roles ner
LEFT JOIN roles r ON r.id_rol = ner.id_rol
WHERE ner.codigo_evento = 'EQUIPO_SALE_DE_CRITICO'
ORDER BY ner.id_rol;

SELECT
  s.index_name,
  s.non_unique,
  GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ', ') AS columnas
FROM information_schema.statistics s
WHERE s.table_schema = @schema_name
  AND s.table_name = 'sup_notificaciones'
  AND s.index_name = 'uq_sup_notif_evento_logico'
GROUP BY s.index_name, s.non_unique;

-- Vista previa de equipos que HOY dejaron de cumplir 3/35 solo por cambio de ventana.
SELECT
  ap.numero_equipo,
  ap.proyecto,
  ap.identificacion_sitio,
  ap.zona_id,
  COUNT(DISTINCT CASE
    WHEN t.fecha_reporte >= DATE_SUB(@ayer_cdmx, INTERVAL 35 DAY)
     AND t.fecha_reporte < DATE_ADD(@ayer_cdmx, INTERVAL 1 DAY)
    THEN t.id ELSE NULL END
  ) AS fallas_blt_antes,
  COUNT(DISTINCT CASE
    WHEN t.fecha_reporte >= DATE_SUB(@hoy_cdmx, INTERVAL 35 DAY)
     AND t.fecha_reporte < DATE_ADD(@hoy_cdmx, INTERVAL 1 DAY)
    THEN t.id ELSE NULL END
  ) AS fallas_blt_despues
FROM (
  SELECT
    MIN(p.id_portafolio) AS id_portafolio,
    p.numero_equipo,
    MAX(p.proyecto) AS proyecto,
    MAX(p.identificacion_sitio) AS identificacion_sitio,
    MIN(p.zona_id) AS zona_id,
    SUM(CASE WHEN p.zona_id IS NULL THEN 1 ELSE 0 END) AS zonas_nulas,
    COUNT(DISTINCT p.zona_id) AS zonas_distintas
  FROM portafolio p
  WHERE p.estado_registro = 1
    AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
    AND UPPER(TRIM(COALESCE(p.estatus_servicio, ''))) NOT LIKE '%NO EN SERVICIO%'
    AND p.numero_equipo IS NOT NULL
    AND TRIM(p.numero_equipo) <> ''
  GROUP BY p.numero_equipo
  HAVING zonas_nulas = 0
     AND zonas_distintas = 1
) ap
LEFT JOIN tickets t
  ON t.codigo_equipo = ap.numero_equipo
 AND t.fecha_reporte IS NOT NULL
 AND t.fecha_reporte >= DATE_SUB(@hoy_cdmx, INTERVAL 36 DAY)
 AND t.fecha_reporte < DATE_ADD(@hoy_cdmx, INTERVAL 1 DAY)
 AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
GROUP BY ap.numero_equipo, ap.proyecto, ap.identificacion_sitio, ap.zona_id
HAVING fallas_blt_antes >= 3
   AND fallas_blt_despues < 3
ORDER BY ap.numero_equipo;
