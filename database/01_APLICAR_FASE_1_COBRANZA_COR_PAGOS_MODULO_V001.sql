USE mydb;
START TRANSACTION;

-- FASE 1 - COBRANZA COR / MODULO PAGOS
-- ALCANCE:
-- - registra el modulo Pagos dentro del catalogo de permisos existente;
-- - crea UNICAMENTE su permiso visual;
-- - reordena Aditivas de 30 a 40 para dejar Pagos en orden 30;
-- - NO crea ni altera tablas operativas de Cobranza;
-- - NO asigna el permiso a roles ni usuarios.
-- Script idempotente.

-- 1) La accion central ACCESO_VISUAL debe existir por PRECHECK.
-- Esta fase NO la crea ni modifica: la reutiliza en el INSERT final del permiso.

-- 2) Mantener el orden funcional aprobado:
-- Dashboard (10) -> Estados de Cuenta (20) -> Pagos (30) -> Aditivas (40).
UPDATE perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
SET
  pm.orden = 40,
  pm.updated_at = CURRENT_TIMESTAMP
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'COBRANZA_ADITIVAS';

-- 3) Registrar/reactivar el modulo Pagos en la agrupacion COBRANZA de CORELLIAN.
INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT
  pa.id_agrupacion,
  'COBRANZA_PAGOS',
  'Pagos',
  'cobranza-pagos',
  30,
  1
FROM perm_agrupaciones pa
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pa.activo = 1
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- 4) Elemento visual del modulo.
INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT
  pm.id_modulo,
  'COBRANZA_PAGOS_ACCESO_VISUAL',
  'Acceso visual',
  'VISUAL',
  0,
  1
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'COBRANZA_PAGOS'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- 5) Subelemento visual del modulo.
INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
SELECT
  pe.id_elemento,
  'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO',
  'Mostrar modulo',
  0,
  1
FROM perm_elementos pe
INNER JOIN perm_modulos pm
  ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'COBRANZA_PAGOS'
  AND pe.codigo = 'COBRANZA_PAGOS_ACCESO_VISUAL'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- 6) Permiso visual final consumido por el panel lateral.
INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  ps.id_subelemento,
  pac.id_accion,
  'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  1
FROM perm_subelementos ps
INNER JOIN perm_elementos pe
  ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm
  ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
INNER JOIN perm_acciones pac
  ON pac.codigo = 'ACCESO_VISUAL'
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'COBRANZA_PAGOS'
  AND pe.codigo = 'COBRANZA_PAGOS_ACCESO_VISUAL'
  AND ps.codigo = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO'
LIMIT 1
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Verificacion inmediata de la aplicacion.
SELECT
  pa.codigo AS agrupacion_codigo,
  pa.empresa AS agrupacion_empresa,
  pm.codigo AS modulo_codigo,
  pm.nombre AS modulo_nombre,
  pm.ruta_frontend,
  pm.orden AS modulo_orden,
  pm.activo AS modulo_activo,
  pe.codigo AS elemento_codigo,
  ps.codigo AS subelemento_codigo,
  pac.codigo AS accion_codigo,
  psa.codigo_permiso,
  psa.activo AS permiso_activo
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
LEFT JOIN perm_elementos pe
  ON pe.id_modulo = pm.id_modulo
 AND pe.codigo = 'COBRANZA_PAGOS_ACCESO_VISUAL'
LEFT JOIN perm_subelementos ps
  ON ps.id_elemento = pe.id_elemento
 AND ps.codigo = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO'
LEFT JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento = ps.id_subelemento
 AND psa.codigo_permiso = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
LEFT JOIN perm_acciones pac
  ON pac.id_accion = psa.id_accion
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'COBRANZA_PAGOS';
