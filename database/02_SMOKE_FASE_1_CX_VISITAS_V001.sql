-- [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 1 V001]
-- SOLO LECTURA. Validar despues de 01_APLICAR, antes de autorizar Fase 2.
USE mydb;

-- 1. Ambos objetos deben ser InnoDB, con 0 registros iniciales.
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cx_visitas', 'cx_visitas_historial')
ORDER BY TABLE_NAME;

SELECT 'cx_visitas' AS tabla, COUNT(*) AS registros FROM cx_visitas
UNION ALL
SELECT 'cx_visitas_historial', COUNT(*) FROM cx_visitas_historial;

-- 2. FK de historial y los indices de busqueda deben existir.
SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, UPDATE_RULE, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'cx_visitas_historial';

SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cx_visitas', 'cx_visitas_historial')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 3. EXACTAMENTE 5 permisos nuevos, asociados al modulo preexistente.
SELECT pa.codigo AS agrupacion, pa.empresa,
       pm.codigo AS modulo, pm.ruta_frontend,
       pe.codigo AS elemento, ps.codigo AS subelemento,
       psa.codigo_permiso, pac.codigo AS accion,
       pac.requiere_auditoria, psa.activo
FROM perm_subelemento_acciones psa
JOIN perm_acciones pac ON pac.id_accion = psa.id_accion
JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
WHERE psa.codigo_permiso LIKE 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.%'
ORDER BY psa.codigo_permiso;

SELECT COUNT(*) AS permisos_gestion_activos, 5 AS esperados
FROM perm_subelemento_acciones
WHERE codigo_permiso IN (
  'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER',
  'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.CREAR',
  'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.EDITAR',
  'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.DESACTIVAR',
  'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL'
) AND activo = 1;

-- 4. EXISTENTE, NO MODIFICADO: acceso visual del modulo.
SELECT codigo_permiso, activo
FROM perm_subelemento_acciones
WHERE codigo_permiso = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

-- 5. Nunca concede derechos por defecto; 0 es el estado esperado en una BD
-- donde nadie tenia previamente asignados permisos de esta fase.
SELECT COUNT(*) AS asignaciones_rol_ya_existentes
FROM rol_permisos rp
JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso LIKE 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.%'
  AND rp.permitido = 1;
