-- ============================================================
-- Gestor Mantto
-- FIX V006 - Permiso de Edicion Rapida en Instalaciones > Dashboard
-- Fecha: 2026-08-18
--
-- Reutiliza exclusivamente:
--   perm_subelementos
--   perm_acciones
--   perm_subelemento_acciones
--
-- NO crea tablas.
-- NO crea acciones nuevas.
-- NO asigna el permiso a roles ni usuarios.
-- El permiso debe habilitarse desde Panel de Control a quien corresponda.
-- ============================================================

SELECT
  'SUBELEMENTO_REPORTE' AS validacion,
  COUNT(*) AS encontrados,
  1 AS esperados
FROM perm_subelementos
WHERE codigo = 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO'
  AND activo = 1;

SELECT
  'ACCION_EDITAR' AS validacion,
  COUNT(*) AS encontrados,
  1 AS esperados
FROM perm_acciones
WHERE codigo = 'EDITAR'
  AND activo = 1;

START TRANSACTION;

INSERT INTO perm_subelemento_acciones (
  id_subelemento,
  id_accion,
  codigo_permiso,
  activo
)
SELECT
  ps.id_subelemento,
  pa.id_accion,
  'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.EDITAR',
  1
FROM perm_subelementos ps
INNER JOIN perm_acciones pa
  ON pa.codigo = 'EDITAR'
 AND pa.activo = 1
WHERE ps.codigo = 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO'
  AND ps.activo = 1
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

SELECT
  psa.codigo_permiso,
  pa.codigo AS accion,
  psa.activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_acciones pa
  ON pa.id_accion = psa.id_accion
WHERE psa.codigo_permiso = 'INSTALACIONES_DASHBOARD_REPORTE_SECCION_LISTADO.EDITAR';

-- Resultado esperado: 1 fila activa con accion EDITAR.
-- ============================================================
-- FIN FIX V006
-- ============================================================
