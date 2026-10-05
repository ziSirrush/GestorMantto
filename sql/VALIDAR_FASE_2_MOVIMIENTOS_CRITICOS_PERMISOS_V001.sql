-- Mantto Gestor · VALIDAR · Movimientos Criticos · Fase 2 V001
-- Solo lectura.

SELECT
  pa.codigo AS agrupacion_codigo,
  pa.nombre AS agrupacion_nombre,
  pm.id_modulo,
  pm.codigo AS modulo_codigo,
  pm.nombre AS modulo_nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo AS modulo_activo,
  pe.id_elemento,
  pe.codigo AS elemento_codigo,
  pe.activo AS elemento_activo,
  ps.id_subelemento,
  ps.codigo AS subelemento_codigo,
  ps.activo AS subelemento_activo,
  psa.id_subelemento_accion,
  psa.codigo_permiso,
  psa.activo AS permiso_activo
FROM perm_agrupaciones pa
INNER JOIN perm_modulos pm
  ON pm.id_agrupacion = pa.id_agrupacion
INNER JOIN perm_elementos pe
  ON pe.id_modulo = pm.id_modulo
INNER JOIN perm_subelementos ps
  ON ps.id_elemento = pe.id_elemento
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento = ps.id_subelemento
WHERE pa.codigo = 'OPERACION'
  AND pm.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS'
  AND pe.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL'
  AND ps.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO'
  AND psa.codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

-- Debe ser 1.
SELECT COUNT(*) AS permisos_movimientos_criticos
FROM perm_subelemento_acciones
WHERE codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
  AND activo = 1;

-- Informativo: Fase 2 no concede accesos automaticamente.
SELECT
  r.id_rol,
  r.rol,
  rp.permitido
FROM rol_permisos rp
INNER JOIN roles r
  ON r.id_rol = rp.id_rol
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
ORDER BY r.id_rol;

SELECT
  u.id_SB,
  u.nombre,
  up.permitido,
  up.activo
FROM usuario_permisos up
INNER JOIN usuarios u
  ON u.id_SB = up.id_usuario
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = up.id_subelemento_accion
WHERE psa.codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
ORDER BY u.id_SB;
