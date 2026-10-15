-- BLT NOW | CX > Visitas | FASE 4 V001 | SOLO LECTURA
-- Ejecutar en Aiven DESPUES de Fase 1, antes de habilitar API/usuarios.
-- NO contiene USE, SET, INSERT, UPDATE, DELETE, ALTER, DDL ni transacciones.
-- Utiliza la base actualmente seleccionada; confirmar DATABASE() = mydb.
-- NO imprime informacion personal; solo resultados de esquema/contadores.

SELECT DATABASE() AS base_seleccionada,
       VERSION() AS mysql_version,
       @@session.time_zone AS zona_sesion,
       @@global.time_zone AS zona_global;

-- Deben existir exactamente dos tablas InnoDB para este modulo.
SELECT COUNT(*) AS tablas_innodb_detectadas,
       CASE WHEN COUNT(*)=2 THEN 'PASS' ELSE 'BLOCKED' END AS resultado
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND ENGINE='InnoDB'
  AND TABLE_NAME IN ('cx_visitas','cx_visitas_historial');

-- Campos que consume estrictamente la Fase 2.
SELECT t.TABLE_NAME, t.expected AS columnas_requeridas,
       COUNT(c.COLUMN_NAME) AS columnas_presentes,
       CASE WHEN COUNT(c.COLUMN_NAME)=t.expected THEN 'PASS' ELSE 'BLOCKED' END AS resultado
FROM (
  SELECT 'cx_visitas' AS TABLE_NAME,19 AS expected
  UNION ALL SELECT 'cx_visitas_historial',6
) t
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=t.TABLE_NAME
 AND ( (t.TABLE_NAME='cx_visitas' AND c.COLUMN_NAME IN (
    'id_visita','id_usuario_creador','id_usuario_responsable',
    'id_usuario_ultima_modificacion','titulo','objetivo','resultado',
    'observaciones','referencia_origen','referencia_id','proyecto_nombre',
    'cliente_nombre','ubicacion','fecha_programada_utc',
    'fecha_realizada_utc','estado','inactivo','created_at','updated_at'
  )) OR (t.TABLE_NAME='cx_visitas_historial' AND c.COLUMN_NAME IN (
    'id_evento','id_visita','id_actor_usuario','accion','detalle','created_at'
  )))
GROUP BY t.TABLE_NAME,t.expected;

-- Si el conteo falla, revisar las definiciones; no ejecutar DDL de reparacion automatica.
SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME IN ('cx_visitas','cx_visitas_historial')
ORDER BY TABLE_NAME,ORDINAL_POSITION;

-- Visual preexistente y 5 acciones agregadas en Fase 1.
SELECT psa.codigo_permiso, pac.codigo AS accion,
       pac.requiere_auditoria, psa.activo AS permiso_activo,
       pm.codigo AS modulo, pa.codigo AS agrupacion, pa.empresa
FROM perm_subelemento_acciones psa
JOIN perm_acciones pac ON pac.id_accion=psa.id_accion
JOIN perm_subelementos ps ON ps.id_subelemento=psa.id_subelemento
JOIN perm_elementos pe ON pe.id_elemento=ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo=pe.id_modulo
JOIN perm_agrupaciones pa ON pa.id_agrupacion=pm.id_agrupacion
WHERE psa.codigo_permiso IN (
 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.CREAR',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.EDITAR',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.DESACTIVAR',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL'
)
ORDER BY psa.codigo_permiso;

-- PASS requiere 6 filas activas con agrupacion CX y empresa CORELLIAN.
SELECT COUNT(*) AS permisos_en_catalogo,
  SUM(CASE WHEN psa.activo=1 AND pac.activo=1 AND pm.activo=1
      AND pa.codigo='CUSTOMER_EXPERIENCE'
      AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
      THEN 1 ELSE 0 END) AS permisos_validos,
  CASE WHEN COUNT(*)=6 AND SUM(CASE WHEN psa.activo=1 AND pac.activo=1 AND pm.activo=1
      AND pa.codigo='CUSTOMER_EXPERIENCE'
      AND UPPER(pa.empresa) LIKE '%CORELLIAN%' THEN 1 ELSE 0 END)=6
    THEN 'PASS' ELSE 'BLOCKED' END AS resultado
FROM perm_subelemento_acciones psa
JOIN perm_acciones pac ON pac.id_accion=psa.id_accion
JOIN perm_subelementos ps ON ps.id_subelemento=psa.id_subelemento
JOIN perm_elementos pe ON pe.id_elemento=ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo=pe.id_modulo
JOIN perm_agrupaciones pa ON pa.id_agrupacion=pm.id_agrupacion
WHERE psa.codigo_permiso IN (
 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.CREAR',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.EDITAR',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.DESACTIVAR',
 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL'
);

-- Auditoria y datos operativos: contadores, sin exponer PII.
SELECT COUNT(*) AS visitas_total,
  SUM(CASE WHEN inactivo=0 THEN 1 ELSE 0 END) AS visitas_activas,
  SUM(CASE WHEN inactivo=1 THEN 1 ELSE 0 END) AS visitas_inactivas
FROM cx_visitas;

SELECT COUNT(*) AS total_eventos,
  SUM(CASE WHEN accion='CREAR' THEN 1 ELSE 0 END) AS creaciones,
  SUM(CASE WHEN accion='EDITAR' THEN 1 ELSE 0 END) AS ediciones,
  SUM(CASE WHEN accion='DESACTIVAR' THEN 1 ELSE 0 END) AS desactivaciones
FROM cx_visitas_historial;

SELECT COUNT(*) AS eventos_huerfanos
FROM cx_visitas_historial h
LEFT JOIN cx_visitas v ON v.id_visita=h.id_visita
WHERE v.id_visita IS NULL;

-- Permisos concedidos a roles: resultado informativo, no los modifica.
SELECT COUNT(*) AS asignaciones_activas_rol
FROM rol_permisos rp
JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion=rp.id_subelemento_accion
WHERE psa.codigo_permiso LIKE 'CUSTOMER_EXPERIENCE_VISITAS_%'
  AND rp.permitido=1;
