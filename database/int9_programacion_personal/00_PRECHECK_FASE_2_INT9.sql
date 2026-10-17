-- [Mantto Gestor | 2026-10-16 | INT9 FASE 2 | PRECHECK SOLO LECTURA]
-- Ejecutar y revisar manualmente EN LA BD AUTORIZADA, antes de aprobar/aplicar F2.
-- Debe existir instalaciones_personal (F1); NO debe existir tabla F2 ni equivalente.
SELECT DATABASE() AS base_actual, VERSION() AS version_mysql, NOW() AS hora_servidor;
SELECT TABLE_NAME,ENGINE FROM INFORMATION_SCHEMA.TABLES
 WHERE TABLE_SCHEMA=DATABASE()
   AND TABLE_NAME IN ('instalaciones_personal','instalaciones_programacion_asignaciones',
     'instalaciones_personal_montadores','instalaciones_personal_ajustadores')
 ORDER BY TABLE_NAME;
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY
 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
   AND TABLE_NAME IN ('instalaciones_personal','ins_fl')
   AND COLUMN_NAME IN ('id_personal','tipo_personal','activo','id_ins_fl','proyecto','id_proyecto',
     'referencia_sitio','fecha_inicio_montaje','fecha_fin_montaje_planeado',
     'fecha_fin_montaje_modificado','fecha_fin_montaje_real','fecha_inicio_ajuste',
     'fecha_fin_ajuste_planeado','fecha_fin_ajuste_modificado','fecha_fin_ajuste_real',
     'id_sup','id_asesor','id_admin')
 ORDER BY TABLE_NAME,COLUMN_NAME;
SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('instalaciones_personal','ins_fl')
   AND COLUMN_NAME IN ('id_personal','id_ins_fl')
 ORDER BY TABLE_NAME,CONSTRAINT_NAME;
SELECT codigo_permiso,activo FROM perm_subelemento_acciones
 WHERE codigo_permiso LIKE 'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION.%'
 ORDER BY codigo_permiso;
-- Criterios de detencion: tabla F1 ausente, alguna columna/tipo/FK inesperado,
-- tablas equivalentes ya existentes, codigo de permiso faltante, cambios en Aiven.
