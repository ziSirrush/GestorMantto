-- FASE 6/11 - Operacion > Dashboard Call Center
-- Validacion de referencia para Tester (id 81).
-- Solo lectura. No modifica datos.

SET @tester_id := 81;

SELECT uz.usuario_id, z.id_zona, z.zona, z.nombre
FROM usuario_zop uz
INNER JOIN z_op z ON z.id_zona = uz.zona_id AND z.estado = 1
WHERE uz.usuario_id = @tester_id AND uz.estado = 1
ORDER BY z.zona;

SELECT z.zona AS zona_oficial, COUNT(*) AS equipos
FROM portafolio p
INNER JOIN usuario_zop uz ON uz.zona_id = p.zona_id AND uz.usuario_id = @tester_id AND uz.estado = 1
INNER JOIN z_op z ON z.id_zona = p.zona_id AND z.estado = 1
WHERE p.estado_registro = 1
  AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','1','TRUE','INACTIVO'))
GROUP BY z.id_zona, z.zona
ORDER BY z.zona;

SELECT z.zona AS zona_oficial, COUNT(DISTINCT t.id) AS tickets
FROM tickets t
INNER JOIN portafolio p
  ON TRIM(COALESCE(p.numero_equipo, '')) = TRIM(COALESCE(t.codigo_equipo, ''))
 AND p.estado_registro = 1
INNER JOIN usuario_zop uz ON uz.zona_id = p.zona_id AND uz.usuario_id = @tester_id AND uz.estado = 1
INNER JOIN z_op z ON z.id_zona = p.zona_id AND z.estado = 1
WHERE NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
GROUP BY z.id_zona, z.zona
ORDER BY z.zona;

SELECT t.ticket, t.codigo_equipo, t.zona AS zona_texto_ticket, p.zona_id, z.zona AS zona_oficial
FROM tickets t
INNER JOIN portafolio p
  ON TRIM(COALESCE(p.numero_equipo, '')) = TRIM(COALESCE(t.codigo_equipo, ''))
 AND p.estado_registro = 1
INNER JOIN usuario_zop uz ON uz.zona_id = p.zona_id AND uz.usuario_id = @tester_id AND uz.estado = 1
INNER JOIN z_op z ON z.id_zona = p.zona_id AND z.estado = 1
WHERE NULLIF(TRIM(COALESCE(t.zona, '')), '') IS NOT NULL
  AND UPPER(TRIM(t.zona)) <> UPPER(TRIM(z.zona))
ORDER BY t.id DESC
LIMIT 100;
