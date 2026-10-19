-- BLT NOW | ALMACEN FASE 1 | DDL DESTRUCTIVO - EJECUCION MANUAL
-- DECISION USUARIO: no migrar el Excel ni la antigua tabla de excepciones.
-- PRECONDICIONES TODAS OBLIGATORIAS:
-- 1. Ejecutado 00_PRECHECK sin referencias FK/vistas/triggers/rutinas externas.
-- 2. Respaldos de Aiven verificados y prueba de restauracion disponible.
-- 3. Backend nuevo /api/almacen desplegado y probado contra NS.
-- 4. Removidos los servicios legacy sin importadores activos.
-- 5. Existen las 4 tablas NS y almacen_auditoria; no se tocan.
-- ATENCION: MySQL ejecuta DROP TABLE con COMMIT implicito;
-- ROLLBACK NO REVIERTE ESTAS SENTENCIAS. No desactivar FK checks.
-- No usar IF EXISTS: el entorno equivocado debe dar error visible.

DROP TABLE `almacen_stock_reabasto_excepciones`;
DROP TABLE `almacen_fuente_excel`;
