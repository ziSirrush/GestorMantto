-- Mantto Gestor · APLICAR · Movimientos Criticos · Fase 2 V001
-- Registra el modulo OPERACION > Movimientos Criticos y su permiso ACCESO_VISUAL.
-- NO asigna el permiso a roles ni usuarios. La administracion de acceso queda en Panel de Control.
-- Es idempotente.

START TRANSACTION;

-- La agrupacion OPERACION ya es estructura oficial. No se crea una agrupacion paralela.
-- Se mantiene activa y se conserva su empresa/orden/nombre actual sin sobreescribirlos.
INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT
  pa.id_agrupacion,
  'OPERACION_MOVIMIENTOS_CRITICOS',
  'Movimientos Críticos',
  'movimientos-criticos',
  9,
  1
FROM perm_agrupaciones pa
WHERE pa.codigo = 'OPERACION'
  AND pa.activo = 1
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Si OPERACION no existe/esta inactiva, @id_modulo queda NULL y el siguiente
-- INSERT falla por NOT NULL; la transaccion no llega a COMMIT.
INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('ACCESO_VISUAL', 'Acceso visual', 'Permite mostrar y consultar el módulo cuando el usuario tiene alcance de información autorizado.', 0, 1)
ON DUPLICATE KEY UPDATE
  -- ACCESO_VISUAL es accion compartida. No se cambia nombre/descripcion global para evitar efectos laterales.
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @id_modulo := (
  SELECT id_modulo
  FROM perm_modulos
  WHERE codigo = 'OPERACION_MOVIMIENTOS_CRITICOS'
  LIMIT 1
);

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
VALUES
  (@id_modulo, 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL', 'Acceso visual', 'VISUAL', 0, 1)
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @id_elemento := (
  SELECT id_elemento
  FROM perm_elementos
  WHERE codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL'
  LIMIT 1
);

INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
VALUES
  (@id_elemento, 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO', 'Mostrar módulo', 0, 1)
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @id_subelemento := (
  SELECT id_subelemento
  FROM perm_subelementos
  WHERE codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO'
  LIMIT 1
);

SET @id_accion_acceso_visual := (
  SELECT id_accion
  FROM perm_acciones
  WHERE codigo = 'ACCESO_VISUAL'
  LIMIT 1
);

INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
VALUES
  (@id_subelemento, @id_accion_acceso_visual, 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 1)
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Verificacion inmediata. Debe devolver exactamente un permiso activo y ninguna asignacion creada por este script.
SELECT
  pa.codigo AS agrupacion_codigo,
  pm.codigo AS modulo_codigo,
  pm.nombre AS modulo_nombre,
  pm.ruta_frontend,
  pe.codigo AS elemento_codigo,
  ps.codigo AS subelemento_codigo,
  psa.codigo_permiso,
  psa.activo
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
  AND psa.codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
