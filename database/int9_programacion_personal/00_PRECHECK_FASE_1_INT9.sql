-- [Mantto Gestor | 2026-10-16 | INT-9 FASE 1 | PRECHECK SOLO LECTURA]
-- Ejecutar manualmente contra Aiven ANTES de aprobar cualquier DDL.
-- Requiere revisar resultados: no se hace ninguna escritura.
SELECT DATABASE() AS base_actual, VERSION() AS version_mysql, NOW() AS hora_servidor;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('instalaciones_personal', 'instalaciones_personal_montadores',
                     'instalaciones_personal_ajustadores', 'instalaciones_programacion_asignaciones')
ORDER BY table_name;
SELECT codigo, id_agrupacion, empresa, activo
FROM perm_agrupaciones WHERE codigo = 'INSTALACIONES';
SELECT codigo, id_accion, activo
FROM perm_acciones WHERE codigo IN ('VER','CREAR','EDITAR','DESACTIVAR')
ORDER BY codigo;
SELECT codigo, id_modulo, ruta_frontend, activo
FROM perm_modulos WHERE codigo = 'INSTALACIONES_PROGRAMACION_PERSONAL';
SELECT codigo, id_elemento FROM perm_elementos
WHERE codigo = 'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO';
SELECT codigo, id_subelemento FROM perm_subelementos
WHERE codigo = 'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION';
SELECT codigo_permiso, id_subelemento_accion FROM perm_subelemento_acciones
WHERE codigo_permiso LIKE 'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION.%';
