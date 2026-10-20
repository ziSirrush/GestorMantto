-- Mantto Gestor / BLT NOW
-- Fase 1: permiso independiente para el piloto de Modo Offline.
-- Idempotente. No asigna el permiso a ningun rol ni usuario: queda denegado
-- por defecto y se libera persona por persona desde el Panel de Control.

START TRANSACTION;

INSERT INTO perm_agrupaciones
  (codigo, nombre, empresa, orden, activo)
VALUES
  ('MODO_OFFLINE', 'Modo Offline', 'GENERAL', 98, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  empresa = VALUES(empresa),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT id_agrupacion, 'GENERAL_MODO_OFFLINE', 'Configuracion Offline', 'offline-configuracion', 10, 1
FROM perm_agrupaciones
WHERE codigo = 'MODO_OFFLINE'
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('ACCESO_VISUAL', 'Acceso visual', 'Permite mostrar un modulo habilitado por BLT NOW.', 0, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT id_modulo, 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL', 'Acceso visual', 'VISUAL', 0, 1
FROM perm_modulos
WHERE codigo = 'GENERAL_MODO_OFFLINE'
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = 'VISUAL',
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
SELECT id_elemento, 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO', 'Mostrar modulo', 0, 1
FROM perm_elementos
WHERE codigo = 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL'
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT ps.id_subelemento, pa.id_accion,
       'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 1
FROM perm_subelementos ps
JOIN perm_elementos pe
  ON pe.id_elemento = ps.id_elemento
 AND pe.codigo = 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL'
JOIN perm_acciones pa
  ON pa.codigo = 'ACCESO_VISUAL'
WHERE ps.codigo = 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO'
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Verificacion. permisos_asignados debe iniciar en 0.
SELECT
  pg.codigo AS agrupacion,
  pg.empresa,
  pm.codigo AS modulo,
  pm.ruta_frontend,
  psa.codigo_permiso,
  (
    SELECT COUNT(*) FROM rol_permisos rp
    WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
      AND rp.permitido = 1
  ) + (
    SELECT COUNT(*) FROM usuario_permisos up
    WHERE up.id_subelemento_accion = psa.id_subelemento_accion
      AND up.permitido = 1
  ) AS permisos_asignados
FROM perm_agrupaciones pg
JOIN perm_modulos pm ON pm.id_agrupacion = pg.id_agrupacion
JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo
JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento
JOIN perm_subelemento_acciones psa ON psa.id_subelemento = ps.id_subelemento
WHERE pg.codigo = 'MODO_OFFLINE'
  AND psa.codigo_permiso = 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
