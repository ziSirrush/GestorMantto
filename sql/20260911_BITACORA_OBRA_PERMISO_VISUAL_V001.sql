USE mydb;

-- ============================================================
-- BITACORA DE OBRA | PERMISO VISUAL V001
--
-- Agrega el apartado al catálogo de Panel de Control dentro de:
--   Instalaciones > Proyectos > Detalle de proyecto > Bitácora de Obra
--
-- No asigna el permiso a roles ni usuarios. El acceso queda cerrado
-- hasta habilitarlo expresamente desde Panel de Control.
-- Es idempotente y no modifica las tablas operativas de la Bitácora.
-- ============================================================

START TRANSACTION;

SET @bitacora_id_modulo := (
  SELECT id_modulo
  FROM perm_modulos
  WHERE codigo = 'INSTALACIONES_PROYECTOS'
    AND activo = 1
  LIMIT 1
);

INSERT INTO perm_elementos (
  id_modulo, codigo, nombre, tipo, orden, activo
)
SELECT
  @bitacora_id_modulo,
  'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO',
  'Detalle de proyecto',
  'DETALLE',
  40,
  1
WHERE @bitacora_id_modulo IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @bitacora_id_elemento := (
  SELECT id_elemento
  FROM perm_elementos
  WHERE codigo = 'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO'
  LIMIT 1
);

INSERT INTO perm_subelementos (
  id_elemento, codigo, nombre, orden, activo
)
SELECT
  @bitacora_id_elemento,
  'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_BITACORA',
  'Bitácora de Obra',
  10,
  1
WHERE @bitacora_id_elemento IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @bitacora_id_subelemento := (
  SELECT id_subelemento
  FROM perm_subelementos
  WHERE codigo = 'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_BITACORA'
  LIMIT 1
);

SET @bitacora_id_accion_ver := (
  SELECT id_accion
  FROM perm_acciones
  WHERE codigo = 'VER'
    AND activo = 1
  LIMIT 1
);

INSERT INTO perm_subelemento_acciones (
  id_subelemento, id_accion, codigo_permiso, activo
)
SELECT
  @bitacora_id_subelemento,
  @bitacora_id_accion_ver,
  'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_BITACORA.VER',
  1
WHERE @bitacora_id_subelemento IS NOT NULL
  AND @bitacora_id_accion_ver IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Debe devolver una fila activa. La asignación se administra desde
-- Panel de Control por rol o como excepción individual de usuario.
SELECT
  pa.nombre AS agrupacion,
  pm.nombre AS modulo,
  pe.nombre AS elemento,
  ps.nombre AS subelemento,
  psa.codigo_permiso,
  psa.activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
WHERE psa.codigo_permiso = 'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_BITACORA.VER';
