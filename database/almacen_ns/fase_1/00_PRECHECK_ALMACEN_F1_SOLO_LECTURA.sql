-- BLT NOW | ALMACEN FASE 1 | PRECHECK SOLO LECTURA
-- Ejecutar en Aiven antes del cambio de codigo y antes de cualquier DROP.
-- REVISION HUMANA OBLIGATORIA; resultados distintos a lo esperado => DETENER.
SELECT DATABASE() AS esquema, VERSION() AS mysql_version;

-- Deben existir las cuatro NS, Auditoria y las dos legacy que se eliminaran.
SELECT requerido.tabla,
       IF(t.table_name IS NULL,'FALTA','EXISTE') AS estado
FROM (
  SELECT 'almacen_ns_lotes' AS tabla UNION ALL
  SELECT 'almacen_ns_inventario' UNION ALL
  SELECT 'almacen_ns_movimientos' UNION ALL
  SELECT 'almacen_ns_catalogo_articulos' UNION ALL
  SELECT 'almacen_auditoria' UNION ALL
  SELECT 'almacen_fuente_excel' UNION ALL
  SELECT 'almacen_stock_reabasto_excepciones'
) requerido
LEFT JOIN information_schema.tables t
  ON t.table_schema=DATABASE() AND t.table_name=requerido.tabla
ORDER BY requerido.tabla;

-- La Fase 0 de catalogo exige un ENUM con CATALOGO_ARTICULOS.
SELECT table_name,column_name,column_type,is_nullable
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND table_name='almacen_ns_lotes'
  AND column_name IN ('tipo_fuente','estado','activo','es_completo');

-- No eliminar si hay FK EXTERNAS que referencian a estas dos tablas.
-- Resultado esperado: 0 filas.
SELECT table_name,column_name,referenced_table_name,constraint_name
FROM information_schema.key_column_usage
WHERE table_schema=DATABASE()
  AND referenced_table_schema=DATABASE()
  AND referenced_table_name IN ('almacen_fuente_excel','almacen_stock_reabasto_excepciones')
  AND table_name NOT IN ('almacen_fuente_excel','almacen_stock_reabasto_excepciones');

-- Inventariar triggers, vistas, procedimientos o funciones que mencionan legacy.
-- NO continuar si hay referencias: deben retirarse explicitamente primero.
SELECT 'TRIGGER' AS objeto,t.trigger_name AS nombre
FROM information_schema.triggers t
WHERE t.trigger_schema=DATABASE()
  AND (t.event_object_table IN ('almacen_fuente_excel','almacen_stock_reabasto_excepciones')
       OR t.action_statement LIKE '%almacen_fuente_excel%'
       OR t.action_statement LIKE '%almacen_stock_reabasto_excepciones%')
UNION ALL
SELECT 'VIEW',v.table_name
FROM information_schema.views v
WHERE v.table_schema=DATABASE()
  AND (v.view_definition LIKE '%almacen_fuente_excel%'
       OR v.view_definition LIKE '%almacen_stock_reabasto_excepciones%')
UNION ALL
SELECT 'ROUTINE',r.routine_name
FROM information_schema.routines r
WHERE r.routine_schema=DATABASE()
  AND (r.routine_definition LIKE '%almacen_fuente_excel%'
       OR r.routine_definition LIKE '%almacen_stock_reabasto_excepciones%');

-- Guardar estos tres conteos de Aiven en evidencia previa al cambio.
-- Ejecutar SOLO cuando todas las tablas anteriores aparecen EXISTE.
SELECT 'almacen_auditoria' AS tabla,COUNT(*) AS filas FROM almacen_auditoria
UNION ALL
SELECT 'almacen_fuente_excel',COUNT(*) FROM almacen_fuente_excel
UNION ALL
SELECT 'almacen_stock_reabasto_excepciones',COUNT(*) FROM almacen_stock_reabasto_excepciones;

-- Fuente ACTIVA NetSuite para consulta (puede ser cero hasta F3).
SELECT tipo_fuente,estado,activo,es_completo,COUNT(*) AS lotes
FROM almacen_ns_lotes GROUP BY tipo_fuente,estado,activo,es_completo
ORDER BY tipo_fuente,estado;
