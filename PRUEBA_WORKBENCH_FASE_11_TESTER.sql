-- FASE 11/11 - EXPERIMENTAL - PRUEBAS PARA TESTER
-- Usuario esperado: Tester / id_SB = 81

-- 1) Cuartos activos asignados a Tester.
SELECT
  uz.usuario_id,
  z.id_zona,
  z.zona,
  z.nombre,
  uz.estado AS asignacion_activa,
  z.estado AS zona_activa
FROM usuario_zop uz
JOIN z_op z ON z.id_zona = uz.zona_id
WHERE uz.usuario_id = 81
  AND uz.estado = 1
  AND z.estado = 1
ORDER BY z.id_zona;

-- 2) Contraste de zona legacy vs zona estructurada para tickets con equipo.
SELECT
  t.id,
  t.ticket,
  t.codigo_equipo,
  t.proyecto,
  t.zona AS zona_ticket_legacy,
  p.zona_id,
  z.zona AS zona_oficial
FROM tickets t
JOIN portafolio p
  ON p.estado_registro = 1
 AND TRIM(p.numero_equipo) = TRIM(t.codigo_equipo)
JOIN z_op z
  ON z.id_zona = p.zona_id
 AND z.estado = 1
JOIN usuario_zop uz
  ON uz.usuario_id = 81
 AND uz.estado = 1
 AND uz.zona_id = p.zona_id
WHERE NULLIF(TRIM(t.codigo_equipo), '') IS NOT NULL
  AND UPPER(TRIM(COALESCE(t.zona, ''))) <> UPPER(TRIM(COALESCE(z.zona, '')))
ORDER BY t.id DESC
LIMIT 100;

-- 3) Universo territorial de tickets de Tester por zona oficial.
SELECT
  z.id_zona,
  z.zona AS zona_oficial,
  COUNT(*) AS tickets
FROM tickets t
JOIN portafolio p
  ON p.estado_registro = 1
 AND TRIM(p.numero_equipo) = TRIM(t.codigo_equipo)
JOIN z_op z
  ON z.id_zona = p.zona_id
 AND z.estado = 1
JOIN usuario_zop uz
  ON uz.usuario_id = 81
 AND uz.estado = 1
 AND uz.zona_id = p.zona_id
GROUP BY z.id_zona, z.zona
ORDER BY z.id_zona;

-- 4) Equipos de Entregas Recientes (12 meses) por zona oficial.
SELECT
  z.id_zona,
  z.zona AS zona_oficial,
  COUNT(*) AS equipos
FROM portafolio p
JOIN z_op z
  ON z.id_zona = p.zona_id
 AND z.estado = 1
JOIN usuario_zop uz
  ON uz.usuario_id = 81
 AND uz.estado = 1
 AND uz.zona_id = p.zona_id
WHERE p.estado_registro = 1
  AND COALESCE(
        STR_TO_DATE(NULLIF(TRIM(p.fecha_recepcion_mantenimiento), ''), '%Y-%m-%d'),
        STR_TO_DATE(NULLIF(TRIM(p.fecha_recepcion_mantenimiento), ''), '%d/%m/%Y'),
        STR_TO_DATE(NULLIF(TRIM(p.fecha_recepcion_mantenimiento), ''), '%d-%m-%Y')
      ) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY z.id_zona, z.zona
ORDER BY z.id_zona;

-- 5) Integridad: códigos de equipo normalizados que resuelven a más de una zona.
-- Resultado ideal: 0 filas.
SELECT
  UPPER(TRIM(p.numero_equipo)) AS numero_equipo_norm,
  COUNT(*) AS registros,
  COUNT(DISTINCT p.zona_id) AS zonas_distintas,
  GROUP_CONCAT(DISTINCT CONCAT(p.zona_id, ':', z.zona)
               ORDER BY p.zona_id SEPARATOR ', ') AS zonas
FROM portafolio p
LEFT JOIN z_op z ON z.id_zona = p.zona_id
WHERE p.estado_registro = 1
  AND NULLIF(TRIM(p.numero_equipo), '') IS NOT NULL
GROUP BY UPPER(TRIM(p.numero_equipo))
HAVING COUNT(DISTINCT p.zona_id) > 1
ORDER BY numero_equipo_norm;
