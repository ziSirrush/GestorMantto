-- BLT NOW | ALMACEN FASE 1 | SMOKE SOLO LECTURA DESPUES DE DROP
SELECT DATABASE() AS esquema, VERSION() AS mysql_version;

-- NS y Auditoria => EXISTE; dos legacy => ELIMINADA.
SELECT esperado.tabla,esperado.estado_esperado,
       IF(t.table_name IS NULL,'ELIMINADA','EXISTE') AS estado_real,
       IF(
         (esperado.estado_esperado='EXISTE' AND t.table_name IS NOT NULL)
         OR (esperado.estado_esperado='ELIMINADA' AND t.table_name IS NULL),
         'OK','ERROR'
       ) AS validacion
FROM (
  SELECT 'almacen_ns_lotes' AS tabla,'EXISTE' AS estado_esperado UNION ALL
  SELECT 'almacen_ns_inventario','EXISTE' UNION ALL
  SELECT 'almacen_ns_movimientos','EXISTE' UNION ALL
  SELECT 'almacen_ns_catalogo_articulos','EXISTE' UNION ALL
  SELECT 'almacen_auditoria','EXISTE' UNION ALL
  SELECT 'almacen_fuente_excel','ELIMINADA' UNION ALL
  SELECT 'almacen_stock_reabasto_excepciones','ELIMINADA'
) esperado
LEFT JOIN information_schema.tables t
  ON t.table_schema=DATABASE() AND t.table_name=esperado.tabla
ORDER BY esperado.tabla;

-- Comparar contra el conteo de auditoria registrado ANTES del DROP.
SELECT 'almacen_auditoria' AS tabla,COUNT(*) AS filas_despues
FROM almacen_auditoria;

-- Lote publicado completo. Cero filas es esperado mientras F3 no haya sincronizado.
SELECT id_lote,tipo_fuente,fecha_corte,estado,activo,es_completo,
       filas_esperadas,filas_recibidas,filas_validas
FROM almacen_ns_lotes
WHERE tipo_fuente='INVENTARIO_230' AND activo=1
ORDER BY publicado_en DESC LIMIT 1;
