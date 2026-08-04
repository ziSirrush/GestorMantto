-- Mantto Gestor - V027
-- Crea el rol Soporte, la agrupacion Soporte y sus modulos iniciales.
-- Los tres modulos quedan registrados con permiso visual y asignados al rol Soporte.
-- Idempotente: puede ejecutarse mas de una vez.

START TRANSACTION;

INSERT INTO roles
  (rol, codigo, descripcion, nivel, es_sistema, empresa, estado, created_by, updated_by)
VALUES
  ('Soporte', 'SOPORTE', 'Atencion y seguimiento de solicitudes de soporte del sistema.', 50, 0, 'GENERAL', 1, 'migracion_V027', 'migracion_V027')
ON DUPLICATE KEY UPDATE
  rol = VALUES(rol),
  descripcion = VALUES(descripcion),
  estado = 1,
  updated_by = 'migracion_V027';

INSERT INTO perm_agrupaciones
  (codigo, nombre, empresa, orden, activo)
VALUES
  ('SOPORTE', 'Soporte', 'BLT', 11, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  empresa = VALUES(empresa),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT id_agrupacion, 'SOPORTE_DASHBOARD', 'Dashboard', 'soporte-dashboard', 10, 1
FROM perm_agrupaciones WHERE codigo = 'SOPORTE'
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion), nombre = VALUES(nombre), ruta_frontend = VALUES(ruta_frontend), orden = VALUES(orden), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT id_agrupacion, 'SOPORTE_SOLICITUDES', 'Solicitudes', 'soporte-solicitudes', 20, 1
FROM perm_agrupaciones WHERE codigo = 'SOPORTE'
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion), nombre = VALUES(nombre), ruta_frontend = VALUES(ruta_frontend), orden = VALUES(orden), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT id_agrupacion, 'SOPORTE_CHATS', 'Chats', 'soporte-chats', 30, 1
FROM perm_agrupaciones WHERE codigo = 'SOPORTE'
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion), nombre = VALUES(nombre), ruta_frontend = VALUES(ruta_frontend), orden = VALUES(orden), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('ACCESO_VISUAL', 'Acceso visual', 'Permite mostrar un modulo aunque todavia se encuentre en construccion.', 0, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), descripcion = VALUES(descripcion), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT id_modulo, CONCAT(codigo, '_ACCESO_VISUAL'), 'Acceso visual', 'VISUAL', 0, 1
FROM perm_modulos
WHERE codigo IN ('SOPORTE_DASHBOARD','SOPORTE_SOLICITUDES','SOPORTE_CHATS')
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo), nombre = VALUES(nombre), tipo = 'VISUAL', activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT pe.id_elemento, CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO'), 'Mostrar modulo', 0, 1
FROM perm_modulos pm
JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
WHERE pm.codigo IN ('SOPORTE_DASHBOARD','SOPORTE_SOLICITUDES','SOPORTE_CHATS')
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento), nombre = VALUES(nombre), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones (id_subelemento, id_accion, codigo_permiso, activo)
SELECT ps.id_subelemento, pa.id_accion, CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), 1
FROM perm_modulos pm
JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento AND ps.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO')
JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
WHERE pm.codigo IN ('SOPORTE_DASHBOARD','SOPORTE_SOLICITUDES','SOPORTE_CHATS')
ON DUPLICATE KEY UPDATE
  activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO rol_permisos (id_rol, id_subelemento_accion, permitido)
SELECT r.id_rol, psa.id_subelemento_accion, 1
FROM roles r
JOIN perm_subelemento_acciones psa
  ON psa.codigo_permiso IN (
    'SOPORTE_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    'SOPORTE_SOLICITUDES_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
    'SOPORTE_CHATS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  )
WHERE r.codigo = 'SOPORTE'
ON DUPLICATE KEY UPDATE
  permitido = 1, updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Verificacion:
SELECT pg.codigo AS agrupacion, pm.codigo AS modulo, pm.nombre, pm.ruta_frontend, pm.activo
FROM perm_agrupaciones pg
JOIN perm_modulos pm ON pm.id_agrupacion = pg.id_agrupacion
WHERE pg.codigo = 'SOPORTE'
ORDER BY pm.orden;

SELECT r.id_rol, r.rol, r.codigo, COUNT(rp.id_rol_permiso) AS permisos_soporte
FROM roles r
LEFT JOIN rol_permisos rp ON rp.id_rol = r.id_rol
LEFT JOIN perm_subelemento_acciones psa ON psa.id_subelemento_accion = rp.id_subelemento_accion
  AND psa.codigo_permiso LIKE 'SOPORTE_%'
WHERE r.codigo = 'SOPORTE'
GROUP BY r.id_rol, r.rol, r.codigo;
