-- [Aster | 2026-08-30 | ASTER-MG | FASE 3 ALMACEN OPERATIVOS EXCEL V002]
-- Prerrequisito: FASE_2_ALMACEN_FUENTE_EXCEL_V002.sql aplicado.
-- Mantiene UNA SOLA tabla. No crea tablas adicionales.
-- Amplía almacen_fuente_excel para almacenar, en el mismo lote, hojas INVENTARIO,
-- PRESTAMO y RESGUARDO. Stock se deriva de INVENTARIO.

DELIMITER $$
DROP PROCEDURE IF EXISTS sp_almacen_f3_operativos_v002$$
CREATE PROCEDURE sp_almacen_f3_operativos_v002()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'almacen_fuente_excel'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falta almacen_fuente_excel. Aplica primero Fase 2 Almacen V002.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='tipo_registro') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN tipo_registro VARCHAR(24) NOT NULL DEFAULT 'INVENTARIO' AFTER mapeo_json;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='abc') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN abc VARCHAR(8) NULL AFTER valor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='criticidad') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN criticidad VARCHAR(80) NULL AFTER abc;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='demanda') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN demanda DECIMAL(20,4) NULL AFTER criticidad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='stock_seguridad') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN stock_seguridad DECIMAL(20,4) NULL AFTER demanda;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='punto_reorden') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN punto_reorden DECIMAL(20,4) NULL AFTER stock_seguridad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='minimo') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN minimo DECIMAL(20,4) NULL AFTER punto_reorden;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='maximo') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN maximo DECIMAL(20,4) NULL AFTER minimo;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='fecha_evento') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN fecha_evento DATE NULL AFTER maximo;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='ag') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN ag VARCHAR(255) NULL AFTER fecha_evento;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='responsable') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN responsable VARCHAR(255) NULL AFTER ag;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='sitio') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN sitio VARCHAR(500) NULL AFTER responsable;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='cantidad') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN cantidad DECIMAL(20,4) NULL AFTER sitio;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='costo_unitario') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN costo_unitario DECIMAL(20,6) NULL AFTER cantidad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='folio') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN folio VARCHAR(255) NULL AFTER costo_unitario;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='departamento') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN departamento VARCHAR(255) NULL AFTER folio;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='unidad') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN unidad VARCHAR(120) NULL AFTER departamento;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='proyecto') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN proyecto VARCHAR(500) NULL AFTER unidad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='equipo') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN equipo VARCHAR(255) NULL AFTER proyecto;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='entregado_por') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN entregado_por VARCHAR(255) NULL AFTER equipo;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='salida') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN salida VARCHAR(255) NULL AFTER entregado_por;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='ubicacion') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN ubicacion VARCHAR(500) NULL AFTER salida;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND COLUMN_NAME='con_stock') THEN
    ALTER TABLE almacen_fuente_excel ADD COLUMN con_stock VARCHAR(80) NULL AFTER ubicacion;
  END IF;

  UPDATE almacen_fuente_excel SET tipo_registro='INVENTARIO' WHERE tipo_registro IS NULL OR TRIM(tipo_registro)='';

  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND INDEX_NAME='uq_almacen_excel_lote_fila') THEN
    ALTER TABLE almacen_fuente_excel DROP INDEX uq_almacen_excel_lote_fila;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND INDEX_NAME='uq_almacen_excel_lote_tipo_hoja_fila') THEN
    ALTER TABLE almacen_fuente_excel ADD UNIQUE KEY uq_almacen_excel_lote_tipo_hoja_fila (lote_importacion,tipo_registro,hoja_origen,fila_origen);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND INDEX_NAME='idx_almacen_excel_tipo_empresa') THEN
    ALTER TABLE almacen_fuente_excel ADD KEY idx_almacen_excel_tipo_empresa (activo,tipo_registro,empresa);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND INDEX_NAME='idx_almacen_excel_tipo_resp') THEN
    ALTER TABLE almacen_fuente_excel ADD KEY idx_almacen_excel_tipo_resp (activo,tipo_registro,responsable);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='almacen_fuente_excel' AND INDEX_NAME='idx_almacen_excel_tipo_fecha') THEN
    ALTER TABLE almacen_fuente_excel ADD KEY idx_almacen_excel_tipo_fecha (activo,tipo_registro,fecha_evento);
  END IF;
END$$
CALL sp_almacen_f3_operativos_v002()$$
DROP PROCEDURE sp_almacen_f3_operativos_v002$$
DELIMITER ;

-- Validación posterior
SELECT tipo_registro, COUNT(*) AS filas, SUM(activo=1) AS activas
FROM almacen_fuente_excel
GROUP BY tipo_registro
ORDER BY tipo_registro;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='almacen_fuente_excel'
  AND COLUMN_NAME IN (
    'tipo_registro','abc','criticidad','demanda','stock_seguridad','punto_reorden','minimo','maximo',
    'fecha_evento','ag','responsable','sitio','cantidad','costo_unitario','folio','departamento',
    'unidad','proyecto','equipo','entregado_por','salida','ubicacion','con_stock'
  )
ORDER BY ORDINAL_POSITION;
