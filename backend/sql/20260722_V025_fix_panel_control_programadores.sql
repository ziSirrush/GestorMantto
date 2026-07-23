-- Mantto Gestor - FIX V025
-- Objetivo: garantizar el permiso visual del Panel de Control para todos los
-- roles Programador activos, independientemente de que sean rol principal o secundario.
-- Idempotente: puede ejecutarse más de una vez.

START TRANSACTION;

INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('ACCESO_VISUAL', 'Acceso visual',
   'Permite mostrar un contenedor del catálogo aunque todavía se encuentre en construcción.',
   0, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT
  pm.id_modulo,
  'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL',
  'Acceso visual',
  'VISUAL',
  0,
  1
FROM perm_modulos pm
WHERE pm.codigo = 'GENERAL_PANEL_DE_CONTROL'
  AND pm.activo = 1
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  tipo = 'VISUAL',
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
SELECT
  pe.id_elemento,
  'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO',
  'Mostrar módulo',
  0,
  1
FROM perm_elementos pe
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
WHERE pm.codigo = 'GENERAL_PANEL_DE_CONTROL'
  AND pe.codigo = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL'
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  ps.id_subelemento,
  pa.id_accion,
  'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  1
FROM perm_subelementos ps
INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
WHERE pm.codigo = 'GENERAL_PANEL_DE_CONTROL'
  AND ps.codigo = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO'
ON DUPLICATE KEY UPDATE
  codigo_permiso = VALUES(codigo_permiso),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO rol_permisos
  (id_rol, id_subelemento_accion, permitido, created_by, updated_by)
SELECT
  r.id_rol,
  psa.id_subelemento_accion,
  1,
  NULL,
  NULL
FROM roles r
INNER JOIN perm_subelemento_acciones psa
  ON psa.codigo_permiso = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
 AND psa.activo = 1
WHERE r.estado = 1
  AND LOWER(TRIM(r.rol)) IN (
    'programador',
    'programador united',
    'programador corellian'
  )
ON DUPLICATE KEY UPDATE
  permitido = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- VALIDACIÓN 1: cada rol Programador debe regresar permitido = 1.
SELECT
  r.id_rol,
  r.rol,
  psa.codigo_permiso,
  rp.permitido
FROM roles r
INNER JOIN rol_permisos rp ON rp.id_rol = r.id_rol
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE LOWER(TRIM(r.rol)) IN (
  'programador',
  'programador united',
  'programador corellian'
)
AND psa.codigo_permiso = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
ORDER BY r.rol;

-- VALIDACIÓN 2: identifica DENY personales activos que seguirán prevaleciendo.
SELECT
  u.id_SB,
  u.nombre,
  u.correo,
  up.permitido,
  up.motivo,
  up.fecha_inicio,
  up.fecha_fin
FROM usuario_permisos up
INNER JOIN usuarios u ON u.id_SB = up.id_usuario
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = up.id_subelemento_accion
WHERE psa.codigo_permiso = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  AND up.activo = 1
  AND up.permitido = 0
  AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
  AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW());
