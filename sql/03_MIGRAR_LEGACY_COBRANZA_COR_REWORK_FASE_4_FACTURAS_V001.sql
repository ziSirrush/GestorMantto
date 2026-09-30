USE mydb;

-- Migracion conservadora de referencias legacy.
-- IMPORTANTE: no se infiere monto de Factura desde el monto del Hito/Aditiva.
-- El folio legacy se conserva como una sola cadena; NO se divide por comas u otros separadores.

INSERT INTO cobranza_facturas_cor
(ppns,tipo_concepto,id_fuente_cor,id_aditiva_cor,factura,fecha_factura,moneda,subtotal,iva,total,estatus_factura,fecha_vencimiento,estatus_cobranza,origen_registro,activo,created_by,updated_by)
SELECT
  f.id_proyecto_origen,
  'HITO',
  f.id_fuente_cor,
  NULL,
  TRIM(f.factura),
  NULL,
  NULLIF(UPPER(TRIM(COALESCE(f.moneda,''))),''),
  NULL,NULL,NULL,
  CASE UPPER(TRIM(COALESCE(f.estatus_factura,'')))
    WHEN 'NO PAGADO' THEN 'No pagado'
    WHEN 'PAGADO' THEN 'Pagado'
    ELSE NULL
  END,
  NULL,
  NULL,
  'LEGACY_HITO',
  1,NULL,NULL
FROM cobranza_fuente_cor f
WHERE f.activo=1
  AND NULLIF(TRIM(COALESCE(f.id_proyecto_origen,'')),'') IS NOT NULL
  AND NULLIF(TRIM(COALESCE(f.factura,'')),'') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cobranza_facturas_cor cf
    WHERE cf.activo=1
      AND cf.tipo_concepto='HITO'
      AND cf.id_fuente_cor=f.id_fuente_cor
      AND UPPER(TRIM(cf.factura))=UPPER(TRIM(f.factura))
  );

INSERT INTO cobranza_facturas_cor
(ppns,tipo_concepto,id_fuente_cor,id_aditiva_cor,factura,fecha_factura,moneda,subtotal,iva,total,estatus_factura,fecha_vencimiento,estatus_cobranza,origen_registro,activo,created_by,updated_by)
SELECT
  a.pp_ns,
  'ADITIVA',
  NULL,
  a.id_aditiva_cor,
  TRIM(a.factura),
  NULL,
  NULLIF(UPPER(TRIM(COALESCE(a.moneda,''))),''),
  NULL,NULL,NULL,
  NULL,
  NULL,
  NULL,
  'LEGACY_ADITIVA',
  1,NULL,NULL
FROM cobranza_aditivas_cor a
WHERE a.activo=1
  AND NULLIF(TRIM(COALESCE(a.pp_ns,'')),'') IS NOT NULL
  AND NULLIF(TRIM(COALESCE(a.factura,'')),'') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cobranza_facturas_cor cf
    WHERE cf.activo=1
      AND cf.tipo_concepto='ADITIVA'
      AND cf.id_aditiva_cor=a.id_aditiva_cor
      AND UPPER(TRIM(cf.factura))=UPPER(TRIM(a.factura))
  );
