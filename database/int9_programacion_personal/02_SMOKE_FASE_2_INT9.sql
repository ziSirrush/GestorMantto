-- [Mantto Gestor | 2026-10-16 | INT9 FASE 2 | SMOKE SOLO LECTURA]
-- Ejecutar manualmente DESPUES del SQL 01, una vez aprobado.
SELECT DATABASE() AS base_actual;
SELECT TABLE_NAME,ENGINE,TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='instalaciones_programacion_asignaciones';
SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='instalaciones_programacion_asignaciones'
 ORDER BY ORDINAL_POSITION;
SELECT CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='instalaciones_programacion_asignaciones'
   AND REFERENCED_TABLE_NAME IS NOT NULL;
SELECT COUNT(*) AS asignaciones_reales FROM instalaciones_programacion_asignaciones;
SELECT COUNT(*) AS montadores_activos FROM instalaciones_personal
 WHERE tipo_personal='MONTADOR' AND activo=1;
SELECT COUNT(*) AS ajustadores_activos FROM instalaciones_personal
 WHERE tipo_personal='AJUSTADOR' AND activo=1;
-- No hay INSERT, UPDATE, DELETE, DDL ni concesiones de permisos en este smoke.
