-- Mantto Gestor - Fase 1 - Estructura Experimental y Cobranza United
-- Fecha: 2026-08-05
-- Requisitos:
--   - Ejecutar primero 20260805_FASE_0_EXPERIMENTAL_PERMISOS.sql.
--
-- Objetivo:
--   1) Colocar la agrupacion Experimental inmediatamente antes de Operacion.
--   2) Crear la agrupacion COBRANZA_UNI inmediatamente despues de Portafolio.
--   3) Registrar en COBRANZA_UNI los mismos modulos visibles de la Cobranza actual:
--      Dashboard Cobranza, Estados de Cuenta y Aditivas.
--   4) Crear permisos visuales independientes para esos tres modulos.
--
-- Alcance deliberadamente limitado:
--   - No crea tablas nuevas.
--   - No modifica tablas operativas.
--   - No copia datos de Cobranza Corellian.
--   - No asigna permisos automaticamente a roles ni usuarios.
--   - No modifica los modulos funcionales existentes.
--
-- Script idempotente: puede ejecutarse mas de una vez.

USE mydb;
START TRANSACTION;

-- =============================================================
-- 1. ASEGURAR AGRUPACION EXPERIMENTAL Y SU POSICION
-- =============================================================
INSERT INTO perm_agrupaciones
  (codigo, nombre, empresa, orden, activo)
SELECT
  'EXPERIMENTAL',
  'Experimental',
  'UNITED',
  GREATEST(COALESCE(op.orden, 20) - 1, 0),
  1
FROM (
  SELECT MAX(CASE WHEN codigo = 'OPERACION' THEN orden END) AS orden
  FROM perm_agrupaciones
) op
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  empresa = VALUES(empresa),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- =============================================================
-- 2. CREAR AGRUPACION COBRANZA UNITED DEBAJO DE PORTAFOLIO
-- =============================================================
INSERT INTO perm_agrupaciones
  (codigo, nombre, empresa, orden, activo)
SELECT
  'COBRANZA_UNI',
  'Cobranza',
  'UNITED',
  COALESCE(pf.orden, 30) + 1,
  1
FROM (
  SELECT MAX(CASE WHEN codigo = 'PORTAFOLIO' THEN orden END) AS orden
  FROM perm_agrupaciones
) pf
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  empresa = VALUES(empresa),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- =============================================================
-- 3. MODULOS INICIALES DE COBRANZA UNITED
-- =============================================================
INSERT INTO perm_modulos
  (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT
  pg.id_agrupacion,
  catalogo.codigo,
  catalogo.nombre,
  catalogo.ruta_frontend,
  catalogo.orden,
  1
FROM perm_agrupaciones pg
INNER JOIN (
  SELECT 'COBRANZA_UNI_DASHBOARD' AS codigo,
         'Dashboard Cobranza' AS nombre,
         'cobranza-uni-dashboard' AS ruta_frontend,
         10 AS orden
  UNION ALL
  SELECT 'COBRANZA_UNI_ESTADOS_CUENTA',
         'Estados de Cuenta',
         'cobranza-uni-estados-cuenta',
         20
  UNION ALL
  SELECT 'COBRANZA_UNI_ADITIVAS',
         'Aditivas',
         'cobranza-uni-aditivas',
         30
) catalogo
WHERE pg.codigo = 'COBRANZA_UNI'
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- =============================================================
-- 4. PERMISOS VISUALES PARA COBRANZA UNITED
-- =============================================================
INSERT INTO perm_acciones
  (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  (
    'ACCESO_VISUAL',
    'Acceso visual',
    'Permite mostrar el modulo en el panel lateral.',
    0,
    1
  )
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  requiere_auditoria = VALUES(requiere_auditoria),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT
  pm.id_modulo,
  CONCAT(pm.codigo, '_ACCESO_VISUAL'),
  'Acceso visual',
  'VISUAL',
  0,
  1
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pg
  ON pg.id_agrupacion = pm.id_agrupacion
WHERE pg.codigo = 'COBRANZA_UNI'
  AND pm.codigo IN (
    'COBRANZA_UNI_DASHBOARD',
    'COBRANZA_UNI_ESTADOS_CUENTA',
    'COBRANZA_UNI_ADITIVAS'
  )
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
  CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO'),
  'Mostrar modulo',
  0,
  1
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pg
  ON pg.id_agrupacion = pm.id_agrupacion
INNER JOIN perm_elementos pe
  ON pe.id_modulo = pm.id_modulo
 AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
WHERE pg.codigo = 'COBRANZA_UNI'
  AND pm.codigo IN (
    'COBRANZA_UNI_DASHBOARD',
    'COBRANZA_UNI_ESTADOS_CUENTA',
    'COBRANZA_UNI_ADITIVAS'
  )
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  ps.id_subelemento,
  pa.id_accion,
  CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'),
  1
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pg
  ON pg.id_agrupacion = pm.id_agrupacion
INNER JOIN perm_elementos pe
  ON pe.id_modulo = pm.id_modulo
 AND pe.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL')
INNER JOIN perm_subelementos ps
  ON ps.id_elemento = pe.id_elemento
 AND ps.codigo = CONCAT(pm.codigo, '_ACCESO_VISUAL_MODULO')
INNER JOIN perm_acciones pa
  ON pa.codigo = 'ACCESO_VISUAL'
WHERE pg.codigo = 'COBRANZA_UNI'
  AND pm.codigo IN (
    'COBRANZA_UNI_DASHBOARD',
    'COBRANZA_UNI_ESTADOS_CUENTA',
    'COBRANZA_UNI_ADITIVAS'
  )
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- =============================================================
-- 5. VERIFICACION POSTERIOR
-- =============================================================
SELECT
  codigo,
  nombre,
  empresa,
  orden,
  activo
FROM perm_agrupaciones
WHERE codigo IN ('EXPERIMENTAL', 'OPERACION', 'PORTAFOLIO', 'COBRANZA_UNI')
ORDER BY orden, id_agrupacion;

SELECT
  pg.codigo AS agrupacion_codigo,
  pg.nombre AS agrupacion_nombre,
  pg.empresa,
  pm.codigo AS modulo_codigo,
  pm.nombre AS modulo_nombre,
  pm.ruta_frontend,
  pm.orden AS modulo_orden,
  psa.codigo_permiso,
  psa.activo
FROM perm_agrupaciones pg
INNER JOIN perm_modulos pm
  ON pm.id_agrupacion = pg.id_agrupacion
LEFT JOIN perm_elementos pe
  ON pe.id_modulo = pm.id_modulo
LEFT JOIN perm_subelementos ps
  ON ps.id_elemento = pe.id_elemento
LEFT JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento = ps.id_subelemento
WHERE pg.codigo IN ('EXPERIMENTAL', 'COBRANZA_UNI')
ORDER BY pg.orden, pm.orden, pe.orden, ps.orden, psa.codigo_permiso;
