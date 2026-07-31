USE mydb;

ALTER TABLE ventas_prospecciones
  ADD COLUMN id_proyecto_instalacion VARCHAR(100) NULL AFTER proyecto_cotizado,
  ADD COLUMN id_cotizacion BIGINT UNSIGNED NULL AFTER id_proyecto_instalacion,
  ADD COLUMN id_cliente BIGINT UNSIGNED NULL AFTER id_cotizacion,
  ADD COLUMN id_contacto BIGINT UNSIGNED NULL AFTER id_cliente,
  ADD KEY idx_vp_proyecto_instalacion (id_proyecto_instalacion),
  ADD KEY idx_vp_cotizacion (id_cotizacion),
  ADD KEY idx_vp_cliente (id_cliente),
  ADD KEY idx_vp_contacto (id_contacto),
  ADD CONSTRAINT fk_vp_cotizacion
    FOREIGN KEY (id_cotizacion)
    REFERENCES ventas_cotizaciones_cor (id_cotizacion)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_vp_cliente
    FOREIGN KEY (id_cliente)
    REFERENCES ventas_clientes (id_cliente)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_vp_contacto
    FOREIGN KEY (id_contacto)
    REFERENCES ventas_clientes_contactos (id_contacto)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- id_proyecto_instalacion conserva la llave lógica ins_fl.id_proyecto.
-- No se crea FK porque ins_fl.id_proyecto no es UNIQUE por sí solo;
-- la tabla usa UNIQUE(id_proyecto, referencia_sitio).
