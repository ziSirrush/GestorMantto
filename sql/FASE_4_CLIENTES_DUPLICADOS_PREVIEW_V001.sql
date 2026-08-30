-- [Aster | 2026-08-30 | ASTER-MG | FASE 4 DASHBOARD VENTAS]
-- SOLO LECTURA. No modifica datos.
-- Objetivo: validar duplicados exactos de ventas_clientes y todas las FK que dependen de id_cliente.
-- Identidad reutilizada del backend vigente:
--   nombre_empresa + nombre_contacto + email + telefono (normalizados).

SELECT
  k.TABLE_NAME,
  k.COLUMN_NAME,
  k.CONSTRAINT_NAME,
  k.REFERENCED_TABLE_NAME,
  k.REFERENCED_COLUMN_NAME,
  r.DELETE_RULE,
  r.UPDATE_RULE
FROM information_schema.KEY_COLUMN_USAGE k
LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
 AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
 AND r.TABLE_NAME = k.TABLE_NAME
WHERE k.CONSTRAINT_SCHEMA = DATABASE()
  AND k.REFERENCED_TABLE_NAME = 'ventas_clientes'
  AND k.REFERENCED_COLUMN_NAME = 'id_cliente'
ORDER BY k.TABLE_NAME, k.COLUMN_NAME;

-- En el dump SABANA270826.sql se verificaron exactamente estas referencias:
--   ventas_clientes_contactos.id_cliente
--   ventas_cotizaciones_cor.id_cliente
--   ventas_prospecciones.id_cliente
-- Si el SELECT anterior devuelve una tabla adicional, DETENER y revisar antes del APPLY.

SELECT
  COUNT(*) AS grupos_duplicados,
  COALESCE(SUM(g.total_registros - 1), 0) AS registros_duplicados_a_consolidar
FROM (
  SELECT
    UPPER(TRIM(nombre_empresa)) AS k_empresa,
    COALESCE(UPPER(TRIM(nombre_contacto)), '') AS k_contacto,
    COALESCE(LOWER(TRIM(email)), '') AS k_email,
    COALESCE(TRIM(telefono), '') AS k_telefono,
    COUNT(*) AS total_registros
  FROM ventas_clientes
  WHERE activo = 1
  GROUP BY
    UPPER(TRIM(nombre_empresa)),
    COALESCE(UPPER(TRIM(nombre_contacto)), ''),
    COALESCE(LOWER(TRIM(email)), ''),
    COALESCE(TRIM(telefono), '')
  HAVING COUNT(*) > 1
) g;

-- Mapa canónico: se conserva el id_cliente activo más antiguo (MIN id_cliente).
SELECT
  vc.id_cliente AS id_cliente_duplicado,
  g.id_cliente_canonico,
  vc.nombre_empresa,
  vc.nombre_contacto,
  vc.email,
  vc.telefono,
  vc.iniciales,
  vc.created_at
FROM ventas_clientes vc
INNER JOIN (
  SELECT
    MIN(id_cliente) AS id_cliente_canonico,
    UPPER(TRIM(nombre_empresa)) AS k_empresa,
    COALESCE(UPPER(TRIM(nombre_contacto)), '') AS k_contacto,
    COALESCE(LOWER(TRIM(email)), '') AS k_email,
    COALESCE(TRIM(telefono), '') AS k_telefono
  FROM ventas_clientes
  WHERE activo = 1
  GROUP BY
    UPPER(TRIM(nombre_empresa)),
    COALESCE(UPPER(TRIM(nombre_contacto)), ''),
    COALESCE(LOWER(TRIM(email)), ''),
    COALESCE(TRIM(telefono), '')
  HAVING COUNT(*) > 1
) g
  ON UPPER(TRIM(vc.nombre_empresa)) = g.k_empresa
 AND COALESCE(UPPER(TRIM(vc.nombre_contacto)), '') = g.k_contacto
 AND COALESCE(LOWER(TRIM(vc.email)), '') = g.k_email
 AND COALESCE(TRIM(vc.telefono), '') = g.k_telefono
WHERE vc.activo = 1
  AND vc.id_cliente <> g.id_cliente_canonico
ORDER BY g.id_cliente_canonico, vc.id_cliente;

-- Referencias que se moverían hacia el registro canónico.
SELECT 'ventas_cotizaciones_cor' AS tabla, COUNT(*) AS referencias_a_mover
FROM ventas_cotizaciones_cor q
WHERE q.id_cliente IN (
  SELECT id_cliente_duplicado
  FROM (
    SELECT vc.id_cliente AS id_cliente_duplicado
    FROM ventas_clientes vc
    INNER JOIN (
      SELECT MIN(id_cliente) AS id_cliente_canonico,
             UPPER(TRIM(nombre_empresa)) AS k_empresa,
             COALESCE(UPPER(TRIM(nombre_contacto)), '') AS k_contacto,
             COALESCE(LOWER(TRIM(email)), '') AS k_email,
             COALESCE(TRIM(telefono), '') AS k_telefono
      FROM ventas_clientes
      WHERE activo = 1
      GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
      HAVING COUNT(*) > 1
    ) g
      ON UPPER(TRIM(vc.nombre_empresa)) = g.k_empresa
     AND COALESCE(UPPER(TRIM(vc.nombre_contacto)), '') = g.k_contacto
     AND COALESCE(LOWER(TRIM(vc.email)), '') = g.k_email
     AND COALESCE(TRIM(vc.telefono), '') = g.k_telefono
    WHERE vc.activo = 1 AND vc.id_cliente <> g.id_cliente_canonico
  ) x
)
UNION ALL
SELECT 'ventas_prospecciones', COUNT(*)
FROM ventas_prospecciones p
WHERE p.id_cliente IN (
  SELECT id_cliente_duplicado
  FROM (
    SELECT vc.id_cliente AS id_cliente_duplicado
    FROM ventas_clientes vc
    INNER JOIN (
      SELECT MIN(id_cliente) AS id_cliente_canonico,
             UPPER(TRIM(nombre_empresa)) AS k_empresa,
             COALESCE(UPPER(TRIM(nombre_contacto)), '') AS k_contacto,
             COALESCE(LOWER(TRIM(email)), '') AS k_email,
             COALESCE(TRIM(telefono), '') AS k_telefono
      FROM ventas_clientes
      WHERE activo = 1
      GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
      HAVING COUNT(*) > 1
    ) g
      ON UPPER(TRIM(vc.nombre_empresa)) = g.k_empresa
     AND COALESCE(UPPER(TRIM(vc.nombre_contacto)), '') = g.k_contacto
     AND COALESCE(LOWER(TRIM(vc.email)), '') = g.k_email
     AND COALESCE(TRIM(vc.telefono), '') = g.k_telefono
    WHERE vc.activo = 1 AND vc.id_cliente <> g.id_cliente_canonico
  ) x
)
UNION ALL
SELECT 'ventas_clientes_contactos', COUNT(*)
FROM ventas_clientes_contactos c
WHERE c.id_cliente IN (
  SELECT id_cliente_duplicado
  FROM (
    SELECT vc.id_cliente AS id_cliente_duplicado
    FROM ventas_clientes vc
    INNER JOIN (
      SELECT MIN(id_cliente) AS id_cliente_canonico,
             UPPER(TRIM(nombre_empresa)) AS k_empresa,
             COALESCE(UPPER(TRIM(nombre_contacto)), '') AS k_contacto,
             COALESCE(LOWER(TRIM(email)), '') AS k_email,
             COALESCE(TRIM(telefono), '') AS k_telefono
      FROM ventas_clientes
      WHERE activo = 1
      GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
      HAVING COUNT(*) > 1
    ) g
      ON UPPER(TRIM(vc.nombre_empresa)) = g.k_empresa
     AND COALESCE(UPPER(TRIM(vc.nombre_contacto)), '') = g.k_contacto
     AND COALESCE(LOWER(TRIM(vc.email)), '') = g.k_email
     AND COALESCE(TRIM(vc.telefono), '') = g.k_telefono
    WHERE vc.activo = 1 AND vc.id_cliente <> g.id_cliente_canonico
  ) x
);
