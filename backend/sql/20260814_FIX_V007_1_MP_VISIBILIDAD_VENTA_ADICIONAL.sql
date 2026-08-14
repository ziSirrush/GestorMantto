-- Mantto Gestor · FIX V007.1
-- Cobranza United: visibilidad de Mantenimiento Preventivo + renombre Aditivas -> Venta Adicional
-- Idempotente. No crea ni altera tablas operativas.
--
-- Criterio de acceso:
--   Mantenimiento Preventivo hereda inicialmente las MISMAS asignaciones de acceso visual
--   que Gestión de Crédito (COBRANZA_UNI_ESTADOS_CUENTA), tanto por rol como por usuario.
--   Las asignaciones que ya existan específicamente para MP NO se sobrescriben.

USE mydb;
START TRANSACTION;

-- 1) Garantizar catálogo de Mantenimiento Preventivo.
INSERT INTO perm_modulos (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT id_agrupacion, 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO', 'Mantenimiento Preventivo', 'cobranza-uni-mp-pro', 25, 1
FROM perm_agrupaciones
WHERE codigo = 'COBRANZA_UNI'
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT id_modulo, 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL', 'Acceso visual', 'VISUAL', 0, 1
FROM perm_modulos
WHERE codigo = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO'
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT id_elemento, 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO', 'Mostrar modulo', 0, 1
FROM perm_elementos
WHERE codigo = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL'
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones (id_subelemento, id_accion, codigo_permiso, activo)
SELECT ps.id_subelemento, pa.id_accion,
       'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 1
FROM perm_subelementos ps
INNER JOIN perm_acciones pa ON pa.codigo = 'ACCESO_VISUAL'
WHERE ps.codigo = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO'
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- 2) Renombrar visualmente el cuarto módulo sin cambiar su código ni ruta.
UPDATE perm_modulos
SET nombre = 'Venta Adicional', updated_at = CURRENT_TIMESTAMP
WHERE codigo = 'COBRANZA_UNI_ADITIVAS';

-- 3) Copiar permisos POR ROL de Gestión de Crédito hacia MP únicamente cuando falten.
INSERT INTO rol_permisos
  (id_rol, id_subelemento_accion, permitido, created_by, updated_by)
SELECT
  rp.id_rol,
  destino.id_subelemento_accion,
  rp.permitido,
  rp.created_by,
  rp.updated_by
FROM rol_permisos rp
INNER JOIN perm_subelemento_acciones origen
  ON origen.id_subelemento_accion = rp.id_subelemento_accion
 AND origen.codigo_permiso = 'COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
INNER JOIN perm_subelemento_acciones destino
  ON destino.codigo_permiso = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
ON DUPLICATE KEY UPDATE
  id_rol_permiso = id_rol_permiso;

-- 4) Copiar excepciones/permisos POR USUARIO de Gestión de Crédito hacia MP únicamente cuando falten.
INSERT INTO usuario_permisos
  (id_usuario, id_subelemento_accion, permitido, motivo, fecha_inicio, fecha_fin, activo, created_by, updated_by)
SELECT
  up.id_usuario,
  destino.id_subelemento_accion,
  up.permitido,
  up.motivo,
  up.fecha_inicio,
  up.fecha_fin,
  up.activo,
  up.created_by,
  up.updated_by
FROM usuario_permisos up
INNER JOIN perm_subelemento_acciones origen
  ON origen.id_subelemento_accion = up.id_subelemento_accion
 AND origen.codigo_permiso = 'COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
INNER JOIN perm_subelemento_acciones destino
  ON destino.codigo_permiso = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
ON DUPLICATE KEY UPDATE
  id_usuario_permiso = id_usuario_permiso;

COMMIT;

-- Verificación: deben verse 4 módulos en COBRANZA_UNI.
SELECT
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo,
  psa.codigo_permiso
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pg ON pg.id_agrupacion = pm.id_agrupacion
LEFT JOIN perm_elementos pe ON pe.id_modulo = pm.id_modulo
LEFT JOIN perm_subelementos ps ON ps.id_elemento = pe.id_elemento
LEFT JOIN perm_subelemento_acciones psa ON psa.id_subelemento = ps.id_subelemento
WHERE pg.codigo = 'COBRANZA_UNI'
ORDER BY pm.orden, pm.id_modulo;

-- Verificación de cobertura MP comparada con Gestión de Crédito.
SELECT
  'roles_gc' AS concepto,
  COUNT(*) AS total
FROM rol_permisos rp
INNER JOIN perm_subelemento_acciones psa ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso = 'COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
UNION ALL
SELECT
  'roles_mp', COUNT(*)
FROM rol_permisos rp
INNER JOIN perm_subelemento_acciones psa ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
UNION ALL
SELECT
  'usuarios_gc', COUNT(*)
FROM usuario_permisos up
INNER JOIN perm_subelemento_acciones psa ON psa.id_subelemento_accion = up.id_subelemento_accion
WHERE psa.codigo_permiso = 'COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
UNION ALL
SELECT
  'usuarios_mp', COUNT(*)
FROM usuario_permisos up
INNER JOIN perm_subelemento_acciones psa ON psa.id_subelemento_accion = up.id_subelemento_accion
WHERE psa.codigo_permiso = 'COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
