-- Mantto Gestor - FIX V023
-- Complementa V022: crea permisos visuales reales para módulos vacíos y
-- para agrupaciones que todavía no tienen módulos configurados.
-- Usa exclusivamente las tablas existentes. Es idempotente.

START TRANSACTION;

INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('ACCESO_VISUAL', 'Acceso visual', 'Permite mostrar un contenedor del catálogo aunque todavía se encuentre en construcción.', 0, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), descripcion = VALUES(descripcion), activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Permiso visual para cada módulo activo sin acciones asignables.
INSERT INTO perm_elementos (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT pm.id_modulo, CONCAT(pm.codigo, '_ACCESO_VISUAL'), 'Acceso visual', 'VISUAL', 0, 1
FROM perm_modulos pm
WHERE pm.activo = 1
  AND pm.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
  AND NOT EXISTS (
    SELECT 1
    FROM perm_elementos pe0
    JOIN perm_subelementos ps0 ON ps0.id_elemento = pe0.id_elemento AND ps0.activo = 1
    JOIN perm_subelemento_acciones psa0 ON psa0.id_subelemento = ps0.id_subelemento AND psa0.activo = 1
    JOIN perm_acciones pa0 ON pa0.id_accion = psa0.id_accion AND pa0.activo = 1
    WHERE pe0.id_modulo = pm.id_modulo AND pe0.activo = 1
  )
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), tipo = 'VISUAL', activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT pe.id_elemento, CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO'), 'Mostrar módulo', 0, 1
FROM perm_modulos pm
JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
WHERE pm.activo = 1 AND pm.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones (id_subelemento, id_accion, codigo_permiso, activo)
SELECT ps.id_subelemento, pa.id_accion, CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), 1
FROM perm_modulos pm
JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento AND ps.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO')
JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
WHERE pm.activo = 1 AND pm.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
ON DUPLICATE KEY UPDATE activo = 1, updated_at = CURRENT_TIMESTAMP;

-- Permiso interno para una agrupación activa que aún no tiene módulos reales.
INSERT INTO perm_modulos (id_agrupacion, codigo, nombre, descripcion, orden, activo)
SELECT pg.id_agrupacion, CONCAT('__AGRUPACION_VISUAL_', pg.id_agrupacion),
       'Acceso visual de agrupación', 'Permiso interno para mostrar una agrupación sin módulos configurados.', 9999, 1
FROM perm_agrupaciones pg
WHERE pg.activo = 1
  AND NOT EXISTS (
    SELECT 1 FROM perm_modulos pm0
    WHERE pm0.id_agrupacion = pg.id_agrupacion
      AND pm0.activo = 1
      AND pm0.codigo NOT LIKE '__AGRUPACION_VISUAL_%'
  )
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT pm.id_modulo, CONCAT(pm.codigo, '_ELEMENTO'), 'Acceso visual de agrupación', 'VISUAL', 0, 1
FROM perm_modulos pm
WHERE pm.activo = 1 AND pm.codigo LIKE '__AGRUPACION_VISUAL_%'
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), tipo = 'VISUAL', activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT pe.id_elemento, CONCAT(pm.codigo, '_SUBELEMENTO'), 'Mostrar agrupación', 0, 1
FROM perm_modulos pm
JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.codigo = CONCAT(pm.codigo, '_ELEMENTO')
WHERE pm.activo = 1 AND pm.codigo LIKE '__AGRUPACION_VISUAL_%'
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones (id_subelemento, id_accion, codigo_permiso, activo)
SELECT ps.id_subelemento, pa.id_accion, CONCAT(pm.codigo, '.ACCESO_VISUAL'), 1
FROM perm_modulos pm
JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.codigo = CONCAT(pm.codigo, '_ELEMENTO')
JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento AND ps.codigo = CONCAT(pm.codigo, '_SUBELEMENTO')
JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
WHERE pm.activo = 1 AND pm.codigo LIKE '__AGRUPACION_VISUAL_%'
ON DUPLICATE KEY UPDATE activo = 1, updated_at = CURRENT_TIMESTAMP;

COMMIT;
