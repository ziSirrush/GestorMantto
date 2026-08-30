-- [Aster | 2026-08-30 | ASTER-MG | FASE 4 DASHBOARD VENTAS]
-- MODIFICA DATOS. Ejecutar DESPUÉS de FASE_4_CLIENTES_DUPLICADOS_PREVIEW_V001.sql.
-- No elimina físicamente clientes y no crea tablas permanentes.
-- Conserva el id_cliente activo más antiguo de cada identidad exacta y desactiva los duplicados.
-- Identidad: nombre_empresa + nombre_contacto + email + telefono normalizados.
--
-- PRECONDICIÓN VERIFICADA EN SABANA270826.sql:
--   ventas_clientes_contactos.id_cliente -> ventas_clientes.id_cliente
--   ventas_cotizaciones_cor.id_cliente    -> ventas_clientes.id_cliente
--   ventas_prospecciones.id_cliente       -> ventas_clientes.id_cliente
-- Si PREVIEW muestra otra FK, NO ejecutar este APPLY hasta revisar esa referencia.

START TRANSACTION;

-- 1) Cotizaciones: mover referencia del duplicado al canónico.
UPDATE ventas_cotizaciones_cor q
INNER JOIN (
  SELECT vc.id_cliente AS id_cliente_duplicado, g.id_cliente_canonico
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
    GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
    HAVING COUNT(*) > 1
  ) g
    ON UPPER(TRIM(vc.nombre_empresa)) = g.k_empresa
   AND COALESCE(UPPER(TRIM(vc.nombre_contacto)), '') = g.k_contacto
   AND COALESCE(LOWER(TRIM(vc.email)), '') = g.k_email
   AND COALESCE(TRIM(vc.telefono), '') = g.k_telefono
  WHERE vc.activo = 1
    AND vc.id_cliente <> g.id_cliente_canonico
) m ON m.id_cliente_duplicado = q.id_cliente
SET q.id_cliente = m.id_cliente_canonico;
SELECT ROW_COUNT() AS cotizaciones_referencias_movidas;

-- 2) Prospección: mover referencia del duplicado al canónico.
UPDATE ventas_prospecciones p
INNER JOIN (
  SELECT vc.id_cliente AS id_cliente_duplicado, g.id_cliente_canonico
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
    GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
    HAVING COUNT(*) > 1
  ) g
    ON UPPER(TRIM(vc.nombre_empresa)) = g.k_empresa
   AND COALESCE(UPPER(TRIM(vc.nombre_contacto)), '') = g.k_contacto
   AND COALESCE(LOWER(TRIM(vc.email)), '') = g.k_email
   AND COALESCE(TRIM(vc.telefono), '') = g.k_telefono
  WHERE vc.activo = 1
    AND vc.id_cliente <> g.id_cliente_canonico
) m ON m.id_cliente_duplicado = p.id_cliente
SET p.id_cliente = m.id_cliente_canonico;
SELECT ROW_COUNT() AS prospecciones_referencias_movidas;

-- 3) Contactos: conservar el mismo id_contacto, pero moverlo al cliente canónico.
-- Las FK de cotización/prospección a id_contacto siguen apuntando al mismo contacto.
UPDATE ventas_clientes_contactos c
INNER JOIN (
  SELECT vc.id_cliente AS id_cliente_duplicado, g.id_cliente_canonico
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
    GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
    HAVING COUNT(*) > 1
  ) g
    ON UPPER(TRIM(vc.nombre_empresa)) = g.k_empresa
   AND COALESCE(UPPER(TRIM(vc.nombre_contacto)), '') = g.k_contacto
   AND COALESCE(LOWER(TRIM(vc.email)), '') = g.k_email
   AND COALESCE(TRIM(vc.telefono), '') = g.k_telefono
  WHERE vc.activo = 1
    AND vc.id_cliente <> g.id_cliente_canonico
) m ON m.id_cliente_duplicado = c.id_cliente
SET c.id_cliente = m.id_cliente_canonico;
SELECT ROW_COUNT() AS contactos_referencias_movidas;

-- 4) Desactivar duplicados. NO se hace DELETE físico.
UPDATE ventas_clientes vc
INNER JOIN (
  SELECT id_cliente_duplicado
  FROM (
    SELECT d.id_cliente AS id_cliente_duplicado
    FROM ventas_clientes d
    INNER JOIN (
      SELECT
        MIN(id_cliente) AS id_cliente_canonico,
        UPPER(TRIM(nombre_empresa)) AS k_empresa,
        COALESCE(UPPER(TRIM(nombre_contacto)), '') AS k_contacto,
        COALESCE(LOWER(TRIM(email)), '') AS k_email,
        COALESCE(TRIM(telefono), '') AS k_telefono
      FROM ventas_clientes
      WHERE activo = 1
      GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
      HAVING COUNT(*) > 1
    ) g
      ON UPPER(TRIM(d.nombre_empresa)) = g.k_empresa
     AND COALESCE(UPPER(TRIM(d.nombre_contacto)), '') = g.k_contacto
     AND COALESCE(LOWER(TRIM(d.email)), '') = g.k_email
     AND COALESCE(TRIM(d.telefono), '') = g.k_telefono
    WHERE d.activo = 1
      AND d.id_cliente <> g.id_cliente_canonico
  ) materialized_mapping
) m ON m.id_cliente_duplicado = vc.id_cliente
SET vc.activo = 0;
SELECT ROW_COUNT() AS clientes_duplicados_desactivados;

COMMIT;

-- 5) Validación posterior: debe devolver 0 grupos duplicados activos bajo la identidad definida.
SELECT COUNT(*) AS grupos_duplicados_activos_restantes
FROM (
  SELECT 1
  FROM ventas_clientes
  WHERE activo = 1
  GROUP BY UPPER(TRIM(nombre_empresa)), COALESCE(UPPER(TRIM(nombre_contacto)), ''), COALESCE(LOWER(TRIM(email)), ''), COALESCE(TRIM(telefono), '')
  HAVING COUNT(*) > 1
) g;
