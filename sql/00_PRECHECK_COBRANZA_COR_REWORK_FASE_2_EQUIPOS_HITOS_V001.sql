USE mydb;

-- SOLO LECTURA. Fase 2 no modifica esquema.
SELECT c.TABLE_NAME,c.COLUMN_NAME,c.COLUMN_TYPE,c.IS_NULLABLE
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA=DATABASE()
  AND ((c.TABLE_NAME='cobranza_fuente_cor' AND c.COLUMN_NAME IN (
    'id_fuente_cor','id_proyecto_origen','porcentaje','moneda','subtotal','iva','total','factura','pago_total',
    'estatus_factura','fecha_pago','fecha_vencimiento','dias_vencimiento','estimado_pago','estatus_vencimiento',
    'orden_hito','fecha_programada','fecha_notificada','estatus_hito','anio_proyecto','iva_general_pct','activo'
  )) OR (c.TABLE_NAME='cobranza_partidas_cor' AND c.COLUMN_NAME IN ('id_partida_cor','ppns','orden','moneda','monto_base','activo'))
     OR (c.TABLE_NAME='log_ops' AND c.COLUMN_NAME IN ('id_log_ops','id_ppns','ph_ns')))
ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION;

SELECT COUNT(*) AS anio_null, SUM(anio_proyecto=0) AS anio_cero
FROM cobranza_fuente_cor
WHERE activo=1;
