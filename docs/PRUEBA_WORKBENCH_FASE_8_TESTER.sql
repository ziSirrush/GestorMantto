-- FASE 8/11 - Portafolio > Proyectos de Mantenimiento
-- Usuario de prueba: Tester / id_SB = 81
-- Objetivo: validar que el universo del modulo nace de usuario_zop -> portafolio.zona_id -> z_op.zona.

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
ORDER BY z.id_zona;

-- Esperado con las pruebas previas:
-- 4 CNA-01
-- 5 CNA-02
-- 6 CNA-03

-- 2) Proyectos/equipos visibles por zona canonica.
SELECT
    z.id_zona,
    z.zona AS zona_oficial,
    COUNT(DISTINCT p.proyecto) AS proyectos,
    COUNT(*) AS equipos
FROM usuario_zop uz
INNER JOIN z_op z
    ON z.id_zona = uz.zona_id
   AND z.estado = 1
INNER JOIN portafolio p
    ON p.zona_id = z.id_zona
   AND p.estado_registro = 1
WHERE uz.usuario_id = 81
  AND uz.estado = 1
  AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','1','TRUE','INACTIVO'))
  AND NULLIF(TRIM(p.proyecto), '') IS NOT NULL
GROUP BY z.id_zona, z.zona
ORDER BY z.id_zona;

-- 3) Misma forma territorial usada por el listado de proyectos.
SELECT
    p.proyecto,
    GROUP_CONCAT(DISTINCT z.zona ORDER BY z.zona SEPARATOR ' / ') AS zona_oficial,
    GROUP_CONCAT(DISTINCT p.zona_id ORDER BY p.zona_id SEPARATOR ',') AS zona_ids_oficiales,
    COUNT(*) AS equipos
FROM portafolio p
INNER JOIN z_op z
    ON z.id_zona = p.zona_id
   AND z.estado = 1
INNER JOIN usuario_zop uz
    ON uz.zona_id = p.zona_id
   AND uz.usuario_id = 81
   AND uz.estado = 1
WHERE p.estado_registro = 1
  AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','1','TRUE','INACTIVO'))
  AND NULLIF(TRIM(p.proyecto), '') IS NOT NULL
GROUP BY p.proyecto
ORDER BY p.proyecto;

-- 4) Demostracion de por que zona_operativa NO puede gobernar el modulo.
SELECT
    p.id_portafolio,
    p.proyecto,
    p.numero_equipo,
    p.zona_id,
    z.zona AS zona_oficial,
    p.zona_operativa AS zona_legacy
FROM portafolio p
INNER JOIN z_op z
    ON z.id_zona = p.zona_id
INNER JOIN usuario_zop uz
    ON uz.zona_id = p.zona_id
   AND uz.usuario_id = 81
   AND uz.estado = 1
WHERE p.estado_registro = 1
  AND z.estado = 1
  AND UPPER(TRIM(COALESCE(p.zona_operativa, ''))) <> UPPER(TRIM(COALESCE(z.zona, '')))
ORDER BY p.proyecto, p.numero_equipo
LIMIT 100;

-- Si esta consulta devuelve filas, es correcto que la Fase 8 ignore
-- portafolio.zona_operativa para autorizacion, filtros y zona mostrada.
