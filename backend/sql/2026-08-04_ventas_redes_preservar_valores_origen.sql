USE mydb;

ALTER TABLE ventas_redes
  ADD COLUMN contacto_via_origen VARCHAR(255) NULL AFTER id_contacto_via,
  ADD COLUMN estado_origen VARCHAR(255) NULL AFTER id_estado,
  ADD COLUMN solicitud_origen VARCHAR(255) NULL AFTER id_solicitud,
  ADD COLUMN estatus_origen VARCHAR(255) NULL AFTER id_estatus,
  ADD COLUMN cotizacion_origen VARCHAR(255) NULL AFTER id_cotizacion;
