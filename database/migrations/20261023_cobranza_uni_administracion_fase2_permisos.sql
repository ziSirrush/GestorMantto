-- BLT NOW | COBRANZA UNI ADMINISTRACION | FASE 2 V001
-- APLICACION MANUAL POR DBA AUTORIZADO. NO EJECUTAR EN AUTOMATICO.
-- No crea usuarios, no modifica roles, no asigna permisos.
-- Requiere agrupacion COBRANZA_UNI/UNITED y acciones ACCESO_VISUAL, VER, EDITAR.
-- Ejecutar solo despues de verificar el catalogo actual en entorno autorizado.
START TRANSACTION;

INSERT INTO perm_modulos (id_agrupacion,codigo,nombre,ruta_frontend,orden,activo)
SELECT pa.id_agrupacion, 'COBRANZA_UNI_ADMINISTRACION', 'Administración',
       'cobranza-uni-administracion', 80, 1
FROM perm_agrupaciones pa
WHERE pa.codigo='COBRANZA_UNI' AND pa.empresa='UNITED' AND pa.activo=1
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre),ruta_frontend=VALUES(ruta_frontend);

INSERT INTO perm_elementos (id_modulo,codigo,nombre,tipo,orden,activo)
SELECT pm.id_modulo, defs.codigo, defs.nombre, 'VISUAL', defs.orden, 1
FROM perm_modulos pm
JOIN (
  SELECT 'COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL' AS codigo, 'Administración' AS nombre, 0 AS orden
  UNION ALL SELECT 'COBRANZA_UNI_ADMINISTRACION_GESTION_CREDITO_EDITOR','Gestión de Crédito',1
  UNION ALL SELECT 'COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL_EDITOR','Venta Adicional',2
  UNION ALL SELECT 'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO_EDITOR','Mantenimiento Preventivo',3
) defs
WHERE pm.codigo='COBRANZA_UNI_ADMINISTRACION' AND pm.activo=1
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

INSERT INTO perm_subelementos (id_elemento,codigo,nombre,orden,activo)
SELECT pe.id_elemento, defs.codigo, defs.nombre, 0, 1
FROM perm_elementos pe
JOIN (
  SELECT 'COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL' AS padre,
         'COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO' AS codigo, 'Abrir Administración' AS nombre
  UNION ALL SELECT 'COBRANZA_UNI_ADMINISTRACION_GESTION_CREDITO_EDITOR',
         'COBRANZA_UNI_ADMINISTRACION_GESTION_CREDITO', 'Administrar Gestión de Crédito'
  UNION ALL SELECT 'COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL_EDITOR',
         'COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL', 'Administrar Venta Adicional'
  UNION ALL SELECT 'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO_EDITOR',
         'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO', 'Administrar Mantenimiento Preventivo'
) defs ON defs.padre=pe.codigo
JOIN perm_modulos pm ON pm.id_modulo=pe.id_modulo
WHERE pm.codigo='COBRANZA_UNI_ADMINISTRACION' AND pe.activo=1
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

INSERT INTO perm_subelemento_acciones (id_subelemento,id_accion,codigo_permiso,activo)
SELECT ps.id_subelemento, a.id_accion, CONCAT(ps.codigo,'.',a.codigo), 1
FROM perm_subelementos ps
JOIN perm_elementos pe ON pe.id_elemento=ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo=pe.id_modulo
JOIN perm_acciones a ON a.activo=1 AND (
  (ps.codigo='COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO' AND a.codigo='ACCESO_VISUAL') OR
  (ps.codigo<>'COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO' AND a.codigo IN ('VER','EDITAR'))
)
WHERE pm.codigo='COBRANZA_UNI_ADMINISTRACION' AND ps.activo=1
ON DUPLICATE KEY UPDATE codigo_permiso=VALUES(codigo_permiso);
COMMIT;

-- Comprobacion manual (solo lectura): deben aparecer 7 registros, ninguno asignado por este SQL.
-- SELECT psa.codigo_permiso FROM perm_subelemento_acciones psa
-- WHERE psa.codigo_permiso LIKE 'COBRANZA_UNI_ADMINISTRACION_%'
-- ORDER BY psa.codigo_permiso;
