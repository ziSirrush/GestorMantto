-- [Mantto Gestor | 2026-10-16 | INT-9 FASE 1 | SOLO LECTURA]
-- Ejecutar tras aplicar SQL en entorno autorizado. No altera datos.
SELECT table_name FROM information_schema.tables
WHERE table_schema=DATABASE() AND table_name='instalaciones_personal';
SELECT column_name, column_type, is_nullable, extra FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name='instalaciones_personal'
ORDER BY ordinal_position;
SELECT m.codigo AS modulo, m.ruta_frontend, e.codigo AS elemento,
       s.codigo AS subelemento, a.codigo_permiso
FROM perm_modulos m
JOIN perm_elementos e ON e.id_modulo=m.id_modulo
JOIN perm_subelementos s ON s.id_elemento=e.id_elemento
JOIN perm_subelemento_acciones a ON a.id_subelemento=s.id_subelemento
WHERE m.codigo='INSTALACIONES_PROGRAMACION_PERSONAL'
ORDER BY a.codigo_permiso;
SELECT COUNT(*) AS personal_total, COALESCE(SUM(activo=1),0) AS personal_activo
FROM instalaciones_personal;
