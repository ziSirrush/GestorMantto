-- FASE 7/11 - Dashboard Portafolio - prueba territorial con Tester
-- Aiven MySQL / solo lectura

SET @tester_id := (
    SELECT id_SB
    FROM usuarios
    WHERE UPPER(TRIM(nombre)) = 'TESTER'
       OR UPPER(TRIM(iniciales)) = 'BTST'
    ORDER BY id_SB DESC
    LIMIT 1
);

SELECT @tester_id AS tester_id;

-- Cuartos efectivos.
SELECT z.id_zona, z.zona, z.nombre
FROM usuario_zop uz
INNER JOIN z_op z ON z.id_zona = uz.zona_id AND z.estado = 1
WHERE uz.usuario_id = @tester_id
  AND uz.estado = 1
ORDER BY z.zona;

-- Universo que debe alimentar Dashboard Portafolio.
SELECT
    z.id_zona,
    z.zona AS zona_oficial,
    COUNT(*) AS equipos_activos
FROM portafolio p
INNER JOIN usuario_zop uz
    ON uz.zona_id = p.zona_id
   AND uz.usuario_id = @tester_id
   AND uz.estado = 1
INNER JOIN z_op z
    ON z.id_zona = p.zona_id
   AND z.estado = 1
WHERE p.estado_registro = 1
  AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
GROUP BY z.id_zona, z.zona
ORDER BY z.zona;

-- Confirmar que la zona mostrada debe salir de z_op y no del texto legacy.
SELECT
    p.id_portafolio,
    p.numero_equipo,
    p.proyecto,
    p.zona_id,
    z.zona AS zona_oficial,
    p.zona_operativa AS zona_legacy
FROM portafolio p
INNER JOIN usuario_zop uz
    ON uz.zona_id = p.zona_id
   AND uz.usuario_id = @tester_id
   AND uz.estado = 1
INNER JOIN z_op z
    ON z.id_zona = p.zona_id
   AND z.estado = 1
WHERE p.estado_registro = 1
  AND UPPER(TRIM(COALESCE(p.zona_operativa,''))) <> UPPER(TRIM(z.zona))
ORDER BY z.zona, p.numero_equipo
LIMIT 100;
