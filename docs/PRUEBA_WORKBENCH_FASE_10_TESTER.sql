-- FASE 10/11 - COBRANZA UNITED - TESTER 81
-- No modifica datos.

SET @tester_id := 81;

-- 1) Cuartos activos del usuario.
SELECT uz.usuario_id, z.id_zona, z.zona, z.nombre
FROM usuario_zop uz
JOIN z_op z ON z.id_zona = uz.zona_id AND z.estado = 1
WHERE uz.usuario_id = @tester_id
  AND uz.estado = 1
ORDER BY z.id_zona;

-- 2) Proyectos de Portafolio cuyo universo activo queda 100% dentro de los cuartos del Tester.
WITH tester_zones AS (
  SELECT uz.zona_id
  FROM usuario_zop uz
  JOIN z_op z ON z.id_zona = uz.zona_id AND z.estado = 1
  WHERE uz.usuario_id = @tester_id AND uz.estado = 1
), project_zones AS (
  SELECT
    LOWER(TRIM(p.proyecto)) AS proyecto_norm,
    COUNT(DISTINCT p.zona_id) AS zonas_total,
    COUNT(DISTINCT CASE WHEN tz.zona_id IS NOT NULL THEN p.zona_id END) AS zonas_tester,
    SUM(CASE WHEN p.zona_id IS NULL THEN 1 ELSE 0 END) AS sin_zona,
    GROUP_CONCAT(DISTINCT CONCAT(p.zona_id, ':', z.zona) ORDER BY p.zona_id SEPARATOR ', ') AS zonas
  FROM portafolio p
  LEFT JOIN tester_zones tz ON tz.zona_id = p.zona_id
  LEFT JOIN z_op z ON z.id_zona = p.zona_id
  WHERE p.estado_registro = 1
    AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
    AND NULLIF(TRIM(p.proyecto), '') IS NOT NULL
  GROUP BY LOWER(TRIM(p.proyecto))
)
SELECT *
FROM project_zones
WHERE zonas_total > 0
  AND zonas_total = zonas_tester
  AND sin_zona = 0
ORDER BY proyecto_norm;

-- 3) Gestion de Credito: comparar zona legacy contra zona estructurada de Portafolio.
SELECT
  gc.id_gc,
  gc.proyecto,
  gc.z_oper AS zona_legacy,
  GROUP_CONCAT(DISTINCT z.zona ORDER BY z.zona SEPARATOR ' / ') AS zona_portafolio,
  COUNT(DISTINCT p.zona_id) AS zonas_distintas
FROM gestion_credito gc
JOIN portafolio p
  ON LOWER(TRIM(p.proyecto)) = LOWER(TRIM(gc.proyecto))
 AND p.estado_registro = 1
 AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
LEFT JOIN z_op z ON z.id_zona = p.zona_id
GROUP BY gc.id_gc, gc.proyecto, gc.z_oper
HAVING UPPER(TRIM(COALESCE(gc.z_oper,''))) <> UPPER(TRIM(COALESCE(GROUP_CONCAT(DISTINCT z.zona ORDER BY z.zona SEPARATOR ' / '),'')))
ORDER BY gc.id_gc
LIMIT 100;

-- 4) Registros de Cobranza sin proyecto estructurable contra Portafolio.
SELECT 'gestion_credito' AS tabla, COUNT(*) AS sin_portafolio
FROM gestion_credito gc
WHERE NOT EXISTS (
  SELECT 1 FROM portafolio p
  WHERE p.estado_registro = 1
    AND LOWER(TRIM(p.proyecto)) = LOWER(TRIM(gc.proyecto))
)
UNION ALL
SELECT 'detalle_mp_2026', COUNT(*)
FROM detalle_mp_2026 mp
WHERE NOT EXISTS (
  SELECT 1 FROM portafolio p
  WHERE p.estado_registro = 1
    AND LOWER(TRIM(p.proyecto)) = LOWER(TRIM(mp.proyecto))
)
UNION ALL
SELECT 'pc', COUNT(*)
FROM pc
WHERE NOT EXISTS (
  SELECT 1 FROM portafolio p
  WHERE p.estado_registro = 1
    AND LOWER(TRIM(p.proyecto)) = LOWER(TRIM(pc.proyecto))
);
