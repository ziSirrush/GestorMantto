-- Mantto Gestor - Ventas
-- Agrega la llave estable de la fuente (Google Sheets / Glide) para permitir UPSERT.

ALTER TABLE ventas_cotizaciones_cor
  ADD COLUMN id_cot_origen BIGINT UNSIGNED NULL AFTER id_cotizacion,
  ADD UNIQUE KEY uq_ventas_cotizaciones_id_cot_origen (id_cot_origen);
