-- [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001]
-- SOLO SELECT. Consultas manuales sobre Aiven con credencial de lectura.
-- Estos conteos no acreditan una auditoria de escritura ni permisos efectivos por usuario.

-- 1) Acceso visual y edicion total deben existir y estar activos.
SELECT psa.codigo_permiso, pa.codigo AS accion, pa.requiere_auditoria, psa.activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_acciones pa ON pa.id_accion = psa.id_accion
WHERE psa.codigo_permiso IN (
  'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR'
)
ORDER BY psa.codigo_permiso;

-- 2) Los permisos de escritura se asignan desde Panel de Control, no por nombre de rol.
SELECT psa.codigo_permiso, COUNT(DISTINCT rp.id_rol) AS roles_concesion
FROM perm_subelemento_acciones psa
LEFT JOIN rol_permisos rp
  ON rp.id_subelemento_accion = psa.id_subelemento_accion AND rp.permitido = 1
WHERE psa.codigo_permiso = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR'
GROUP BY psa.codigo_permiso;

-- 3) Estado agregado de auditoria; no mostrar before/after ni identificadores personales.
SELECT COUNT(*) AS auditorias_recientes,
       SUM(CASE WHEN detalle_json IS NULL THEN 1 ELSE 0 END) AS sin_detalle,
       SUM(CASE WHEN detalle_json IS NOT NULL AND JSON_VALID(detalle_json) <> 1 THEN 1 ELSE 0 END) AS json_invalido
FROM usuario_interacciones
WHERE modulo = 'instalaciones-administracion'
  AND tipo_interaccion = 'AUDITAR_CAMBIO'
  AND created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY;

-- 4) Confirmacion basica de la tabla unica fuente de datos operativos.
SELECT TABLE_NAME, COUNT(*) AS columnas_esperadas_presentes
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ins_fl'
  AND COLUMN_NAME IN ('id_ins_fl','id_proyecto','referencia_sitio','estatus','id_sup','updated_at')
GROUP BY TABLE_NAME;
