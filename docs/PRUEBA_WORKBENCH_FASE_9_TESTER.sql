-- FASE 9/11 - Portafolio > Movimientos de Portafolio
-- Usuario de prueba: Tester / id_SB = 81
-- Solo lectura. No modifica datos.

-- 1) Cuartos UNITED activos de Tester.
SELECT
    uz.usuario_id,
    z.id_zona,
    z.zona,
    z.nombre,
    uz.estado AS asignacion_activa,
    z.estado AS zona_activa
FROM usuario_zop uz
INNER JOIN z_op z
    ON z.id_zona = uz.zona_id
WHERE uz.usuario_id = 81
  AND uz.estado = 1
  AND z.estado = 1
ORDER BY z.zona;

-- 2) Movimientos mensuales actuales, agrupados por zona CANONICA.
SELECT
    z.id_zona,
    z.zona AS zona_oficial,
    COUNT(*) AS movimientos,
    SUM(CASE
        WHEN LOWER(TRIM(p.estatus_ul_mes)) IN ('en servicio','servicio')
         AND LOWER(TRIM(p.estatus_servicio)) NOT IN ('en servicio','servicio')
        THEN 1 ELSE 0 END) AS degradados,
    SUM(CASE
        WHEN LOWER(TRIM(p.estatus_ul_mes)) NOT IN ('en servicio','servicio')
         AND LOWER(TRIM(p.estatus_servicio)) IN ('en servicio','servicio')
        THEN 1 ELSE 0 END) AS recuperados
FROM portafolio p
INNER JOIN usuario_zop uz
    ON uz.usuario_id = 81
   AND uz.zona_id = p.zona_id
   AND uz.estado = 1
INNER JOIN z_op z
    ON z.id_zona = p.zona_id
   AND z.estado = 1
WHERE p.estado_registro = 1
  AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
  AND p.estatus_ul_mes IS NOT NULL
  AND TRIM(p.estatus_ul_mes) <> ''
  AND p.estatus_servicio IS NOT NULL
  AND TRIM(p.estatus_servicio) <> ''
  AND LOWER(TRIM(p.estatus_ul_mes)) <> LOWER(TRIM(p.estatus_servicio))
GROUP BY z.id_zona, z.zona
ORDER BY z.zona;

-- 3) Prueba de inconsistencia: la zona mostrada por Fase 9 debe ser zona_oficial.
SELECT
    p.id_portafolio,
    p.numero_equipo,
    p.proyecto,
    p.zona_id,
    z.zona AS zona_oficial,
    p.zona_operativa AS zona_legacy,
    p.estatus_ul_mes,
    p.estatus_servicio
FROM portafolio p
INNER JOIN usuario_zop uz
    ON uz.usuario_id = 81
   AND uz.zona_id = p.zona_id
   AND uz.estado = 1
INNER JOIN z_op z
    ON z.id_zona = p.zona_id
   AND z.estado = 1
WHERE p.estado_registro = 1
  AND UPPER(TRIM(COALESCE(p.zona_operativa,''))) <> UPPER(TRIM(COALESCE(z.zona,'')))
ORDER BY p.id_portafolio
LIMIT 50;

-- 4) Catalogo de cortes semanales existente.
SELECT
    id_corte,
    anio_iso,
    semana_iso,
    fecha_inicio,
    fecha_fin,
    fecha_corte,
    estado
FROM portafolio_cortes_semanales
WHERE estado = 'CERRADO'
ORDER BY anio_iso DESC, semana_iso DESC
LIMIT 20;

-- 5) Ver estructura del primer movimiento del corte mas reciente.
-- Cortes anteriores a Fase 9 normalmente NO tendran zona_id dentro del JSON.
SELECT
    id_corte,
    anio_iso,
    semana_iso,
    JSON_EXTRACT(movimientos_json, '$[0]') AS primer_movimiento
FROM portafolio_cortes_semanales
WHERE estado = 'CERRADO'
ORDER BY anio_iso DESC, semana_iso DESC
LIMIT 1;

-- 6) Despues de generarse un NUEVO corte con Fase 9 desplegada,
-- este query debe mostrar zona_id y la zona canonica dentro del snapshot JSON.
SELECT
    id_corte,
    anio_iso,
    semana_iso,
    JSON_EXTRACT(snapshot_json, '$[0].equipo') AS equipo,
    JSON_EXTRACT(snapshot_json, '$[0].zona_id') AS zona_id,
    JSON_EXTRACT(snapshot_json, '$[0].zona') AS zona_oficial,
    JSON_EXTRACT(snapshot_json, '$[0].zona_legacy') AS zona_legacy
FROM portafolio_cortes_semanales
WHERE estado = 'CERRADO'
ORDER BY anio_iso DESC, semana_iso DESC
LIMIT 1;
