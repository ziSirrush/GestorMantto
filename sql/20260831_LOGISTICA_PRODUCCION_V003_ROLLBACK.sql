-- Rollback destructivo de la instalacion V003. Ejecutar solo antes de cargar datos reales
-- o despues de respaldarlos expresamente.
DROP TABLE IF EXISTS `logistica_produccion_comentarios`;
DROP TABLE IF EXISTS `logistica_produccion_archivos`;
DROP TABLE IF EXISTS `logistica_produccion`;
DROP TABLE IF EXISTS `logistica_cortes_semanales`;

DELETE FROM `estados_visuales`
 WHERE `codigo` IN ('FALTA_ARCHIVO_PVO','FALTA_PPNS','FALTAN_DOCS_PROD');
