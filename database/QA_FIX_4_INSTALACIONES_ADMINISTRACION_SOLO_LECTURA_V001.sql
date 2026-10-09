-- [Aster | 2026-10-09 | ASTER-MG | FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
-- AIVEN: CONSULTAS EXCLUSIVAMENTE DE LECTURA, sin cambios estructurales ni de datos.
-- Cuenta sugerida: usuario SQL con privilegio SELECT. No mostrar registros personales.
-- Estos conteos no prueban funcionalidad E2E ni autorizan un despliegue.

-- A. Catalogo completo: 1 acceso visual + 11 VER + 11 EDITAR = 23.
SELECT COUNT(DISTINCT psa.codigo_permiso) AS activos, 23 AS esperados
FROM perm_subelemento_acciones psa
WHERE psa.codigo_permiso LIKE 'INSTALACIONES_ADMINISTRACION_%'
  AND psa.activo = 1;

-- B. El modulo pertenece a la agrupacion CORELLIAN Instalaciones.
SELECT m.codigo AS modulo, a.codigo AS agrupacion, a.empresa AS dominio, m.activo AS modulo_activo
FROM perm_modulos m
INNER JOIN perm_agrupaciones a ON a.id_agrupacion = m.id_agrupacion
WHERE m.codigo = 'INSTALACIONES_ADMINISTRACION';

-- C. Conteo agregado de concesiones explicitas del acceso visual.
-- NO revela nombres ni IDs de usuarios; NO otorga ni quita permisos.
SELECT
  (SELECT COUNT(*) FROM rol_permisos rp
    INNER JOIN perm_subelemento_acciones psa
      ON psa.id_subelemento_accion = rp.id_subelemento_accion
   WHERE psa.codigo_permiso = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
     AND rp.permitido = 1) AS asignaciones_rol_permitidas,
  (SELECT COUNT(*) FROM usuario_permisos up
    INNER JOIN perm_subelemento_acciones psa
      ON psa.id_subelemento_accion = up.id_subelemento_accion
   WHERE psa.codigo_permiso = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
     AND up.activo = 1 AND up.permitido = 1
     AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
     AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())) AS asignaciones_usuario_permitidas,
  (SELECT COUNT(*) FROM usuario_permisos up
    INNER JOIN perm_subelemento_acciones psa
      ON psa.id_subelemento_accion = up.id_subelemento_accion
   WHERE psa.codigo_permiso = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
     AND up.activo = 1 AND up.permitido = 0
     AND (up.fecha_inicio IS NULL OR up.fecha_inicio <= NOW())
     AND (up.fecha_fin IS NULL OR up.fecha_fin >= NOW())) AS denegaciones_usuario_explicitas;
-- ATENCION: estas cifras no consideran la Puerta CORELLIAN ni Alcance del Registro.

-- D. Esquema exigido en las DOS tablas ya existentes.
SELECT TABLE_NAME, COUNT(DISTINCT COLUMN_NAME) AS columnas_clave_presentes
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'ins_fl' AND COLUMN_NAME IN
      ('id_ins_fl','id_proyecto','referencia_sitio','proyecto','estatus','id_sup','id_asesor','id_admin','updated_at'))
    OR (TABLE_NAME = 'usuario_interacciones' AND COLUMN_NAME IN
      ('id_interaccion','id_usuario','tipo_interaccion','modulo','detalle_json','created_at'))
  )
GROUP BY TABLE_NAME
ORDER BY TABLE_NAME;
-- Esperados: ins_fl=9, usuario_interacciones=6.

-- E. Auditoria reciente (solo conteos, sin before/after ni datos de usuarios).
-- Realizar prueba de escritura UNICAMENTE en laboratorio QA con autorizacion.
SELECT COUNT(*) AS auditorias_7_dias,
  SUM(CASE WHEN detalle_json IS NULL THEN 1 ELSE 0 END) AS sin_detalle,
  SUM(CASE WHEN detalle_json IS NOT NULL AND JSON_VALID(detalle_json) <> 1
       THEN 1 ELSE 0 END) AS json_invalido,
  COUNT(DISTINCT id_referencia) AS referencias_auditadas
FROM usuario_interacciones
WHERE modulo = 'instalaciones-administracion'
  AND tipo_interaccion = 'AUDITAR_CAMBIO'
  AND created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY;
-- Sin auditorias nuevas NO es prueba de falla. Una nueva sin detalle bloquea la liberacion.
