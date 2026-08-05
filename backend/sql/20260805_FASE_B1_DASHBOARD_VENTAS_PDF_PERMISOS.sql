-- Mantto Gestor - Dashboard Ventas - Fase B1
-- Catálogo de permisos para preparar PDF general e individual.
-- Idempotente. No asigna permisos automáticamente a roles ni usuarios.

USE mydb;
START TRANSACTION;

INSERT INTO perm_acciones (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('GENERAR_PDF_GENERAL', 'Generar PDF general', 'Permite preparar el reporte consolidado de todos los responsables del selector de Dashboard Ventas.', 1, 1),
  ('GENERAR_PDF_INDIVIDUAL', 'Generar PDF individual', 'Permite preparar el reporte del responsable comercial seleccionado en Dashboard Ventas.', 1, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  requiere_auditoria = VALUES(requiere_auditoria),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT pm.id_modulo, 'VENTAS_DASHBOARD_PDF', 'Reportes PDF', 'BOTONES', 60, 1
FROM perm_modulos pm
WHERE pm.codigo = 'VENTAS_DASHBOARD'
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT pe.id_elemento, 'VENTAS_DASHBOARD_PDF_REPORTES', 'Generación de reportes', 10, 1
FROM perm_elementos pe
WHERE pe.codigo = 'VENTAS_DASHBOARD_PDF'
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  ps.id_subelemento,
  pa.id_accion,
  CONCAT('VENTAS_DASHBOARD_PDF_REPORTES.', pa.codigo),
  1
FROM perm_subelementos ps
INNER JOIN perm_acciones pa
  ON pa.codigo IN ('GENERAR_PDF_GENERAL', 'GENERAR_PDF_INDIVIDUAL')
WHERE ps.codigo = 'VENTAS_DASHBOARD_PDF_REPORTES'
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

SELECT
  psa.id_subelemento_accion,
  psa.codigo_permiso,
  psa.activo
FROM perm_subelemento_acciones psa
WHERE psa.codigo_permiso IN (
  'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_GENERAL',
  'VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_INDIVIDUAL'
)
ORDER BY psa.codigo_permiso;
