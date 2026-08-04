CREATE TABLE IF NOT EXISTS catalogo_general (
  id_catalogo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  area VARCHAR(100) NOT NULL,
  elemento VARCHAR(150) NOT NULL,
  articulo VARCHAR(200) NOT NULL,
  descripcion VARCHAR(500) DEFAULT NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by BIGINT DEFAULT NULL,
  PRIMARY KEY(id_catalogo),
  UNIQUE KEY uq_catalogo_general(area,elemento,articulo),
  KEY idx_catalogo_area_elemento(area,elemento,activo,orden),
  CONSTRAINT fk_catalogo_general_created_by FOREIGN KEY(created_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_catalogo_general_updated_by FOREIGN KEY(updated_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- La tabla ventas_clientes_contactos y las columnas id_cliente/id_contacto ya deben existir.
-- Este bloque es idempotente solo para catalogo_general.


-- Carga inicial de contactos principales desde el respaldo de clientes.
INSERT INTO ventas_clientes_contactos (
  id_cliente, nombre_contacto, email, telefono,
  contacto_principal, activo, created_by, updated_by
)
SELECT
  vc.id_cliente,
  vc.nombre_contacto,
  vc.email,
  vc.telefono,
  1,
  1,
  vc.created_by,
  vc.updated_by
FROM ventas_clientes vc
WHERE vc.activo = 1
  AND NULLIF(TRIM(vc.nombre_contacto), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM ventas_clientes_contactos vcc
    WHERE vcc.id_cliente = vc.id_cliente
      AND vcc.activo = 1
      AND UPPER(TRIM(vcc.nombre_contacto)) = UPPER(TRIM(vc.nombre_contacto))
      AND COALESCE(LOWER(TRIM(vcc.email)), '') = COALESCE(LOWER(TRIM(vc.email)), '')
      AND COALESCE(TRIM(vcc.telefono), '') = COALESCE(TRIM(vc.telefono), '')
  );
