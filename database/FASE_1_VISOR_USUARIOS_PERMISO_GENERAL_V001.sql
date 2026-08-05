-- Mantto Gestor
-- Fase 1 - Visor de usuarios en pestaña nueva
-- Fecha: 2026-08-04
-- Motor: MySQL 8.x
--
-- Registra el permiso GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR.
-- El permiso aparece dentro de la agrupación General del Panel de Control.
-- Se conserva el acceso histórico de los roles Programador; cualquier otro
-- rol o usuario podrá recibirlo desde el Panel de Control.
--
-- Script idempotente: puede ejecutarse más de una vez.

USE mydb;
START TRANSACTION;

INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT
  pa.id_agrupacion,
  'GENERAL_VISOR_USUARIOS',
  'Visor de usuarios',
  'visor-usuarios',
  30,
  1
FROM perm_agrupaciones pa
WHERE pa.codigo = 'GENERAL'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT
  pm.id_modulo,
  'GENERAL_VISOR_USUARIOS_OPERACION',
  'Operación del Visor de usuarios',
  'OPERACION',
  10,
  1
FROM perm_modulos pm
WHERE pm.codigo = 'GENERAL_VISOR_USUARIOS'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
SELECT
  pe.id_elemento,
  'GENERAL_VISOR_USUARIOS_OPERACION',
  'Visor de usuarios',
  10,
  1
FROM perm_elementos pe
WHERE pe.codigo = 'GENERAL_VISOR_USUARIOS_OPERACION'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  (
    'USAR_VISOR',
    'Usar visor',
    'Permite abrir en otra pestaña una vista temporal con el contexto de otro usuario.',
    1,
    1
  )
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  requiere_auditoria = VALUES(requiere_auditoria),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  ps.id_subelemento,
  pac.id_accion,
  'GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR',
  1
FROM perm_subelementos ps
INNER JOIN perm_elementos pe
  ON pe.id_elemento = ps.id_elemento
 AND pe.codigo = 'GENERAL_VISOR_USUARIOS_OPERACION'
INNER JOIN perm_acciones pac
  ON pac.codigo = 'USAR_VISOR'
WHERE ps.codigo = 'GENERAL_VISOR_USUARIOS_OPERACION'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Conserva el acceso que ya tenían los perfiles Programador.
INSERT INTO rol_permisos
  (id_rol, id_subelemento_accion, permitido)
SELECT
  r.id_rol,
  psa.id_subelemento_accion,
  1
FROM roles r
CROSS JOIN perm_subelemento_acciones psa
WHERE r.estado = 1
  AND psa.codigo_permiso = 'GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR'
  AND LOWER(TRIM(r.rol)) IN (
    'programador',
    'programador united',
    'programador corellian'
  )
ON DUPLICATE KEY UPDATE
  id_rol = VALUES(id_rol);

COMMIT;

-- Validación del catálogo.
SELECT
  pa.codigo AS agrupacion,
  pm.codigo AS modulo,
  pe.codigo AS elemento,
  ps.codigo AS subelemento,
  pac.codigo AS accion,
  psa.codigo_permiso,
  psa.activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
INNER JOIN perm_acciones pac ON pac.id_accion = psa.id_accion
WHERE psa.codigo_permiso = 'GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR';

-- Validación de asignación inicial a roles Programador.
SELECT
  r.id_rol,
  r.rol,
  psa.codigo_permiso,
  rp.permitido
FROM rol_permisos rp
INNER JOIN roles r ON r.id_rol = rp.id_rol
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso = 'GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR'
ORDER BY r.rol;
