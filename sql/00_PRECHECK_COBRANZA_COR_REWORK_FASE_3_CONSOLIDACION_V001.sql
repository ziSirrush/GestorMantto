USE mydb;

-- [Aster | 2026-09-30 | ASTER-MG | FASE 3 CONSOLIDACION CREAR EDITAR V001]
-- SOLO LECTURA. No modifica datos.

SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cobranza_fuente_cor','cobranza_partidas_cor','cobranza_equipos_cor','cobranza_aditivas_cor')
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME='cobranza_fuente_cor' AND COLUMN_NAME IN (
      'id_fuente_cor','id_proyecto_origen','proyecto','cliente','contractual','porcentaje','condicion','moneda',
      'subtotal','iva','total','factura','pago_total','estatus_factura','fecha_pago','fecha_vencimiento',
      'dias_vencimiento','estimado_pago','estatus_vencimiento','orden_hito','fecha_programada','fecha_notificada',
      'estatus_hito','anio_proyecto','iva_general_pct','activo'
    ))
    OR (TABLE_NAME='cobranza_partidas_cor' AND COLUMN_NAME IN ('id_partida_cor','ppns','orden','moneda','monto_base','activo'))
    OR (TABLE_NAME='cobranza_aditivas_cor' AND COLUMN_NAME IN ('id_aditiva_cor','pp_ns','activo'))
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
