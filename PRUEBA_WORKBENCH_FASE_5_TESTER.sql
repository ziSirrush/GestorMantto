-- FASE 5/11 - Operacion > Equipos Criticos
-- Prueba de solo lectura para Tester (id_SB 81).
-- No modifica datos.

SET @tester_id := 81;
SET @dias := 35;
SET @min_fallas := 3;

-- 1) Cuartos autorizados del usuario.
SELECT z.id_zona, z.zona, z.nombre
FROM usuario_zop uz
INNER JOIN z_op z ON z.id_zona = uz.zona_id AND z.estado = 1
WHERE uz.usuario_id = @tester_id
  AND uz.estado = 1
ORDER BY z.zona;

-- 2) Equipos criticos que el backend puede devolver al usuario.
-- La zona mostrada sale de z_op.zona, no de tickets.zona ni zona_operativa.
SELECT
    t.codigo_equipo,
    z.id_zona AS zona_id_oficial,
    z.zona AS zona_oficial,
    p.proyecto,
    COUNT(*) AS fallas_blt_periodo,
    MAX(t.fecha_reporte) AS ultimo_blt
FROM tickets t
INNER JOIN portafolio p
    ON p.numero_equipo = t.codigo_equipo
INNER JOIN usuario_zop uz
    ON uz.zona_id = p.zona_id
   AND uz.usuario_id = @tester_id
   AND uz.estado = 1
INNER JOIN z_op z
    ON z.id_zona = p.zona_id
   AND z.estado = 1
WHERE p.estado_registro = 1
  AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE'))
  AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'
  AND t.fecha_reporte IS NOT NULL
  AND t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL @dias DAY)
  AND t.codigo_equipo IS NOT NULL
  AND t.codigo_equipo <> ''
  AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%'
GROUP BY t.codigo_equipo, z.id_zona, z.zona, p.proyecto
HAVING COUNT(*) >= @min_fallas
ORDER BY fallas_blt_periodo DESC, ultimo_blt DESC, t.codigo_equipo;

-- 3) Control negativo: este resultado debe ser 0.
-- Detecta si el universo estructurado de Tester contiene una zona no asignada.
SELECT COUNT(*) AS registros_fuera_de_cuartos
FROM portafolio p
LEFT JOIN usuario_zop uz
    ON uz.zona_id = p.zona_id
   AND uz.usuario_id = @tester_id
   AND uz.estado = 1
WHERE p.estado_registro = 1
  AND uz.id_usuario_zop IS NULL
  AND p.numero_equipo IN (
      SELECT DISTINCT t.codigo_equipo
      FROM tickets t
      INNER JOIN portafolio p2 ON p2.numero_equipo = t.codigo_equipo
      INNER JOIN usuario_zop uz2
          ON uz2.zona_id = p2.zona_id
         AND uz2.usuario_id = @tester_id
         AND uz2.estado = 1
      WHERE t.fecha_reporte >= DATE_SUB(CURDATE(), INTERVAL @dias DAY)
        AND UPPER(COALESCE(t.responsabilidad,'')) LIKE '%BLT%'
  );
