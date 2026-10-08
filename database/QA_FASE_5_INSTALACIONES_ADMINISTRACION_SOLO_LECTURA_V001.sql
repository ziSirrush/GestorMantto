-- [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
-- CONSULTAS DE SOLO LECTURA. No CREATE/ALTER/INSERT/UPDATE/DELETE/COMMIT.
-- Ejecutar unicamente en la base de datos autorizada, con usuario de lectura.
-- Los resultados son indicadores; no sustituyen pruebas funcionales E2E.

-- CATALOGO DE PERMISOS: deben existir 23 codigos activos de Fase 2.
SELECT COUNT(DISTINCT psa.codigo_permiso) AS permisos_activos_f2, 23 AS esperados
FROM perm_subelemento_acciones psa
WHERE psa.codigo_permiso LIKE 'INSTALACIONES_ADMINISTRACION_%'
  AND psa.activo = 1;

-- ESTRUCTURA MINIMA PREEXISTENTE (sin crear columnas).
SELECT TABLE_NAME, COUNT(DISTINCT COLUMN_NAME) AS columnas_clave_presentes
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME='ins_fl' AND COLUMN_NAME IN
      ('id_ins_fl','id_proyecto','referencia_sitio','proyecto','id_sup','id_asesor','id_admin','updated_at'))
    OR (TABLE_NAME='usuario_interacciones' AND COLUMN_NAME IN
      ('id_interaccion','id_usuario','tipo_interaccion','modulo','detalle_json','created_at'))
  )
GROUP BY TABLE_NAME
ORDER BY TABLE_NAME;
-- Referencia: ins_fl 8/8, usuario_interacciones 6/6.

-- SOLO EVENTOS DE ESTE MODULO. Debe validarse DESPUES de una edicion autorizada de laboratorio.
-- No devuelve datos personales ni before/after.
SELECT COUNT(*) AS auditorias_ultimos_7_dias,
       COALESCE(SUM(CASE WHEN detalle_json IS NULL THEN 1 ELSE 0 END), 0) AS auditorias_sin_detalle,
       COALESCE(SUM(CASE WHEN JSON_VALID(detalle_json) = 0 THEN 1 ELSE 0 END), 0) AS auditorias_detalle_invalido
FROM usuario_interacciones
WHERE modulo = 'instalaciones-administracion'
  AND tipo_interaccion = 'AUDITAR_CAMBIO'
  AND created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY;
-- Si no hubo ediciones reales, 0 eventos es esperado. No inferir que la auditoria no sirve.
-- Cualquier auditoria nueva sin detalle constituye bloqueo de liberacion.
