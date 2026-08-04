-- Mantto Gestor
-- V024 - Fix de acceso al Panel de Control para todos los roles Programador
-- Fecha: 2026-07-22
-- Motor objetivo: MySQL 8.x
--
-- Propósito:
-- 1) Garantizar el permiso visual navegable de GENERAL_PANEL_DE_CONTROL.
-- 2) Otorgarlo a todos los roles activos de Programador, aunque sean secundarios.
-- 3) Mantener la evaluación normal de permisos: una excepción personal DENY continúa prevaleciendo.
--
-- Script idempotente: puede ejecutarse más de una vez sin duplicar registros.

START TRANSACTION;

-- Acción estándar de acceso visual.
INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('ACCESO_VISUAL', 'Acceso visual',
   'Permite mostrar un contenedor del catálogo aunque todavía se encuentre en construcción.',
   0, 1)
ON DUPLICATE KEY UPDATE
  nombre = 'Acceso visual',
  descripcion = 'Permite mostrar un contenedor del catálogo aunque todavía se encuentre en construcción.',
  requiere_auditoria = 0,
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Elemento visual del módulo Panel de Control.
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
LIMIT 1
ON DUPLICATE KEY UPDATE
  nombre = 'Acceso visual',
  tipo = 'VISUAL',
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Subelemento navegable del Panel de Control.
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
LIMIT 1
ON DUPLICATE KEY UPDATE
  nombre = 'Mostrar módulo',
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Relación subelemento + acción que consume la sesión del frontend.
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
LIMIT 1
ON DUPLICATE KEY UPDATE
  codigo_permiso = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Otorga el permiso a todos los roles activos de Programador.
-- Incluye las variantes generales, United y Corellian cuando existan en el catálogo.
INSERT INTO rol_permisos
  (id_rol, id_subelemento_accion, permitido, created_by, updated_by)
SELECT
  r.id_rol,
  psa.id_subelemento_accion,
  1,
  NULL,
  NULL
FROM roles r
CROSS JOIN perm_subelemento_acciones psa
WHERE r.estado = 1
  AND psa.codigo_permiso = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  AND (
    UPPER(TRIM(COALESCE(r.codigo, ''))) IN (
      'PROGRAMADOR',
      'PROGRAMADOR_UNITED',
      'PROGRAMADOR_CORELLIAN'
    )
    OR UPPER(TRIM(COALESCE(r.rol, ''))) IN (
      'PROGRAMADOR',
      'PROGRAMADOR UNITED',
      'PROGRAMADOR CORELLIAN'
    )
  )
ON DUPLICATE KEY UPDATE
  permitido = 1,
  updated_by = NULL,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- ============================================================
-- VALIDACIÓN
-- Debe devolver una fila por cada rol Programador activo.
-- permitido debe ser 1.
-- ============================================================
SELECT
  r.id_rol,
  r.rol,
  r.codigo AS codigo_rol,
  psa.id_subelemento_accion,
  psa.codigo_permiso,
  rp.permitido
FROM roles r
INNER JOIN rol_permisos rp ON rp.id_rol = r.id_rol
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  AND (
    UPPER(TRIM(COALESCE(r.codigo, ''))) IN (
      'PROGRAMADOR',
      'PROGRAMADOR_UNITED',
      'PROGRAMADOR_CORELLIAN'
    )
    OR UPPER(TRIM(COALESCE(r.rol, ''))) IN (
      'PROGRAMADOR',
      'PROGRAMADOR UNITED',
      'PROGRAMADOR CORELLIAN'
    )
  )
ORDER BY r.id_rol;

-- Diagnóstico opcional de excepciones personales DENY.
-- Si un usuario Programador sigue sin ver el Panel y aparece aquí con permitido = 0,
-- la denegación personal está prevaleciendo correctamente sobre sus roles.
SELECT
  u.id_SB AS id_usuario,
  u.nombre,
  u.correo,
  up.permitido AS permiso_personal,
  up.activo,
  up.fecha_inicio,
  up.fecha_fin,
  up.motivo
FROM usuario_permisos up
INNER JOIN usuarios u ON u.id_SB = up.id_usuario
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = up.id_subelemento_accion
WHERE psa.codigo_permiso = 'GENERAL_PANEL_DE_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  AND up.activo = 1
  AND up.permitido = 0
  AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
  AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())
ORDER BY u.nombre;
