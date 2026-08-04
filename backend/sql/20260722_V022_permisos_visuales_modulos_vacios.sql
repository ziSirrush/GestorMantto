-- Mantto Gestor - FIX V022
-- Convierte cada modulo activo sin acciones en un permiso visual real.
-- Usa exclusivamente las tablas existentes del esquema Permisoscompleto(2).sql.
-- Es idempotente: puede ejecutarse mas de una vez.

START TRANSACTION;

INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('ACCESO_VISUAL', 'Acceso visual', 'Permite mostrar el modulo en el panel lateral aunque se encuentre en construccion.', 0, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT
  pm.id_modulo,
  CONCAT(pm.codigo, '_ACCESO_VISUAL'),
  'Acceso visual',
  'VISUAL',
  0,
  1
FROM perm_modulos pm
WHERE pm.activo = 1
  AND NOT EXISTS (
    SELECT 1
    FROM perm_elementos pe0
    INNER JOIN perm_subelementos ps0 ON ps0.id_elemento = pe0.id_elemento AND ps0.activo = 1
    INNER JOIN perm_subelemento_acciones psa0 ON psa0.id_subelemento = ps0.id_subelemento AND psa0.activo = 1
    WHERE pe0.id_modulo = pm.id_modulo
      AND pe0.activo = 1
  )
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  tipo = 'VISUAL',
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
SELECT
  pe.id_elemento,
  CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO'),
  'Mostrar modulo',
  0,
  1
FROM perm_modulos pm
INNER JOIN perm_elementos pe
  ON pe.id_modulo = pm.id_modulo
 AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
WHERE pm.activo = 1
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  ps.id_subelemento,
  pa.id_accion,
  CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'),
  1
FROM perm_modulos pm
INNER JOIN perm_elementos pe
  ON pe.id_modulo = pm.id_modulo
 AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
INNER JOIN perm_subelementos ps
  ON ps.id_elemento = pe.id_elemento
 AND ps.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO')
INNER JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
WHERE pm.activo = 1
ON DUPLICATE KEY UPDATE
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Verificacion sugerida:
-- SELECT pa.nombre agrupacion, pm.nombre modulo, psa.codigo_permiso
-- FROM perm_agrupaciones pa
-- JOIN perm_modulos pm ON pm.id_agrupacion = pa.id_agrupacion
-- LEFT JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo
-- LEFT JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento
-- LEFT JOIN perm_subelemento_acciones psa ON psa.id_subelemento = ps.id_subelemento
-- WHERE psa.codigo_permiso LIKE '%%ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
-- ORDER BY pa.orden, pm.orden;
