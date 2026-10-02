USE mydb;

-- FASE 1 - COBRANZA COR / MODULO PAGOS
-- PRECHECK SOLO LECTURA.
-- No modifica tablas, permisos, roles ni datos operativos.

SELECT DATABASE() AS base_actual, VERSION() AS mysql_version;

-- 1) La agrupacion COBRANZA debe existir una sola vez y pertenecer a CORELLIAN.
SELECT
  id_agrupacion,
  codigo,
  nombre,
  empresa,
  orden,
  activo
FROM perm_agrupaciones
WHERE codigo = 'COBRANZA';

-- Esperado:
-- - exactamente 1 fila;
-- - codigo = COBRANZA;
-- - empresa identifica CORELLIAN;
-- - activo = 1.

-- 2) Estado actual de los modulos Cobranza.
SELECT
  pm.id_modulo,
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
WHERE pa.codigo = 'COBRANZA'
ORDER BY pm.orden, pm.id_modulo;

-- Antes de esta fase se espera encontrar al menos:
-- COBRANZA_DASHBOARD       | cobranza-dashboard       | orden 10
-- COBRANZA_ESTADOS_CUENTA | cobranza-estados-cuenta | orden 20
-- COBRANZA_ADITIVAS        | cobranza-aditivas        | orden 30
-- COBRANZA_PAGOS no debe existir, salvo que esta Fase ya haya sido aplicada.

-- 3) Accion visual reutilizada por el sistema de permisos.
SELECT
  id_accion,
  codigo,
  nombre,
  requiere_auditoria,
  activo
FROM perm_acciones
WHERE codigo = 'ACCESO_VISUAL';

-- 4) Detectar cualquier registro previo del nuevo modulo/ruta/permiso.
SELECT
  pm.id_modulo,
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo
FROM perm_modulos pm
WHERE pm.codigo = 'COBRANZA_PAGOS'
   OR pm.ruta_frontend = 'cobranza-pagos';

SELECT
  psa.id_subelemento_accion,
  psa.codigo_permiso,
  psa.activo
FROM perm_subelemento_acciones psa
WHERE psa.codigo_permiso = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

-- 5) Confirmar que esta fase NO requiere ninguna estructura operativa nueva.
-- Solo se listan las tablas que ya soportan el dominio de Cobranza/Pagos.
SELECT
  TABLE_NAME,
  ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'cobranza_pagos_cor',
    'cobranza_facturas_cor',
    'cobranza_rel_pagos',
    'cobranza_fuente_cor'
  )
ORDER BY TABLE_NAME;
