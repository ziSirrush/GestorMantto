/*
  [Aster | 2026-09-01 | ASTER-MG | FASE 2 LOGISTICA PRODUCCION MOTOR MODO MANUAL V001]

  Objetivo:
  - Preparar la tabla EXISTENTE logistica_produccion para distinguir SEMI_AUTOMATICO / MANUAL.
  - Persistir referencias y valores manuales sin crear tablas nuevas.
  - Mantener id_log_ops opcional para que Modo Manual pueda relacionar un PPNS existente y reutilizar datos automaticos.
  - No modifica log_ops, ventas_cotizaciones_cor, usuarios, roles ni ins_fl.

  Prerrequisito funcional:
  - FASE 1 aplicada, incluido el catalogo Logistica / Estatus Produccion.
*/

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS sp_logistica_prod_f2_manual_v001;
DELIMITER $$
CREATE PROCEDURE sp_logistica_prod_f2_manual_v001()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='modo_registro'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN modo_registro ENUM('SEMI_AUTOMATICO','MANUAL') NOT NULL DEFAULT 'SEMI_AUTOMATICO' AFTER id_log_ops;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='id_cotizacion_venta'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN id_cotizacion_venta BIGINT UNSIGNED NULL AFTER proyecto_referencia;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='id_asesor_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN id_asesor_manual BIGINT NULL AFTER id_cotizacion_venta;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='id_supervisor_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN id_supervisor_manual BIGINT NULL AFTER id_asesor_manual;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='fecha_pvo_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN fecha_pvo_manual DATE NULL AFTER id_supervisor_manual;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='pvo_fl_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN pvo_fl_manual DATE NULL AFTER fecha_pvo_manual;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='fecha_cubos_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN fecha_cubos_manual DATE NULL AFTER pvo_fl_manual;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND COLUMN_NAME='estatus_logistica_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD COLUMN estatus_logistica_manual VARCHAR(100) COLLATE utf8mb4_unicode_ci NULL AFTER fecha_cubos_manual;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND INDEX_NAME='idx_log_prod_modo'
  ) THEN
    ALTER TABLE logistica_produccion ADD KEY idx_log_prod_modo (modo_registro,activo);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND INDEX_NAME='idx_log_prod_venta_ref'
  ) THEN
    ALTER TABLE logistica_produccion ADD KEY idx_log_prod_venta_ref (id_cotizacion_venta);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND INDEX_NAME='idx_log_prod_asesor_manual'
  ) THEN
    ALTER TABLE logistica_produccion ADD KEY idx_log_prod_asesor_manual (id_asesor_manual);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND INDEX_NAME='idx_log_prod_supervisor_manual'
  ) THEN
    ALTER TABLE logistica_produccion ADD KEY idx_log_prod_supervisor_manual (id_supervisor_manual);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND CONSTRAINT_NAME='fk_log_prod_venta_ref'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD CONSTRAINT fk_log_prod_venta_ref FOREIGN KEY (id_cotizacion_venta)
      REFERENCES ventas_cotizaciones_cor (id_cotizacion) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND CONSTRAINT_NAME='fk_log_prod_asesor_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD CONSTRAINT fk_log_prod_asesor_manual FOREIGN KEY (id_asesor_manual)
      REFERENCES usuarios (id_SB) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='logistica_produccion' AND CONSTRAINT_NAME='fk_log_prod_supervisor_manual'
  ) THEN
    ALTER TABLE logistica_produccion
      ADD CONSTRAINT fk_log_prod_supervisor_manual FOREIGN KEY (id_supervisor_manual)
      REFERENCES usuarios (id_SB) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$
DELIMITER ;

CALL sp_logistica_prod_f2_manual_v001();
DROP PROCEDURE IF EXISTS sp_logistica_prod_f2_manual_v001;

/* Verificacion estructural. */
SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='logistica_produccion'
  AND COLUMN_NAME IN (
    'modo_registro','id_cotizacion_venta','id_asesor_manual','id_supervisor_manual',
    'fecha_pvo_manual','pvo_fl_manual','fecha_cubos_manual','estatus_logistica_manual'
  )
ORDER BY ORDINAL_POSITION;

SELECT CONSTRAINT_NAME,CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE()
  AND TABLE_NAME='logistica_produccion'
  AND CONSTRAINT_NAME IN ('fk_log_prod_venta_ref','fk_log_prod_asesor_manual','fk_log_prod_supervisor_manual')
ORDER BY CONSTRAINT_NAME;
