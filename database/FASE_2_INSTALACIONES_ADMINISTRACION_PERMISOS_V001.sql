-- ============================================================
-- Gestor Mantto
-- FASE 2 - Instalaciones > Administracion
-- Permisos funcionales V001
-- Fecha: 2026-10-08
--
-- REUTILIZA EXCLUSIVAMENTE:
--   perm_agrupaciones
--   perm_modulos
--   perm_elementos
--   perm_subelementos
--   perm_acciones
--   perm_subelemento_acciones
--
-- NO crea tablas.
-- NO crea columnas.
-- NO crea acciones nuevas.
-- NO asigna permisos a roles ni usuarios.
-- ============================================================

START TRANSACTION;

SET @id_agrupacion_instalaciones := (
  SELECT id_agrupacion
  FROM perm_agrupaciones
  WHERE codigo = 'INSTALACIONES'
    AND activo = 1
  LIMIT 1
);

-- Fail-closed: si INSTALACIONES no existe, los INSERT SELECT no crean filas.
INSERT INTO perm_modulos (
  id_agrupacion, codigo, nombre, ruta_frontend, orden, activo
)
SELECT
  @id_agrupacion_instalaciones,
  'INSTALACIONES_ADMINISTRACION',
  'Administracion',
  'instalaciones-administracion',
  90,
  1
WHERE @id_agrupacion_instalaciones IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @id_modulo_admin := (
  SELECT id_modulo
  FROM perm_modulos
  WHERE codigo = 'INSTALACIONES_ADMINISTRACION'
  LIMIT 1
);

INSERT INTO perm_elementos (
  id_modulo, codigo, nombre, tipo, orden, activo
)
SELECT @id_modulo_admin,
       'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL',
       'Acceso visual',
       'VISUAL',
       0,
       1
WHERE @id_modulo_admin IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo), nombre = VALUES(nombre), tipo = VALUES(tipo),
  orden = VALUES(orden), activo = 1, updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos (
  id_modulo, codigo, nombre, tipo, orden, activo
)
SELECT @id_modulo_admin,
       'INSTALACIONES_ADMINISTRACION_GRUPOS',
       'Grupos de administracion',
       'FORMULARIO',
       10,
       1
WHERE @id_modulo_admin IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo), nombre = VALUES(nombre), tipo = VALUES(tipo),
  orden = VALUES(orden), activo = 1, updated_at = CURRENT_TIMESTAMP;

SET @id_elemento_acceso := (
  SELECT id_elemento FROM perm_elementos
  WHERE codigo = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL' LIMIT 1
);
SET @id_elemento_grupos := (
  SELECT id_elemento FROM perm_elementos
  WHERE codigo = 'INSTALACIONES_ADMINISTRACION_GRUPOS' LIMIT 1
);

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT @id_elemento_acceso,
       'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO',
       'Mostrar modulo', 0, 1
WHERE @id_elemento_acceso IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento), nombre = VALUES(nombre), orden = VALUES(orden),
  activo = 1, updated_at = CURRENT_TIMESTAMP;

-- 11 acordeones funcionales.
INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT @id_elemento_grupos, x.codigo, x.nombre, x.orden, 1
FROM (
  SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_PROYECTO' codigo, 'Proyecto e identificacion' nombre, 10 orden
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_SEGUIMIENTO', 'Seguimiento operativo', 20
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_CLIENTE_CONTRATO', 'Cliente y contrato', 30
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_UBICACION_CONTACTO', 'Ubicacion y contacto', 40
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_EQUIPO', 'Datos del equipo', 50
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_PRODUCCION_LOGISTICA', 'Produccion y logistica', 60
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_MONTAJE', 'Montaje / instalacion', 70
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_AJUSTE_CALIDAD', 'Ajuste y calidad', 80
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_ENTREGA_GARANTIA_MANTENIMIENTO', 'Entrega, garantia y mantenimiento', 90
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_COSTOS', 'Costos', 100
  UNION ALL SELECT 'INSTALACIONES_ADMINISTRACION_GRUPOS_RESPONSABLES', 'Responsables', 110
) x
WHERE @id_elemento_grupos IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento), nombre = VALUES(nombre), orden = VALUES(orden),
  activo = 1, updated_at = CURRENT_TIMESTAMP;

SET @accion_acceso := (
  SELECT id_accion FROM perm_acciones WHERE codigo = 'ACCESO_VISUAL' AND activo = 1 LIMIT 1
);
SET @accion_ver := (
  SELECT id_accion FROM perm_acciones WHERE codigo = 'VER' AND activo = 1 LIMIT 1
);
SET @accion_editar := (
  SELECT id_accion FROM perm_acciones WHERE codigo = 'EDITAR' AND activo = 1 LIMIT 1
);

SET @sub_acceso := (
  SELECT id_subelemento FROM perm_subelementos
  WHERE codigo = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO' LIMIT 1
);

INSERT INTO perm_subelemento_acciones (
  id_subelemento, id_accion, codigo_permiso, activo
)
SELECT @sub_acceso, @accion_acceso,
       'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL', 1
WHERE @sub_acceso IS NOT NULL AND @accion_acceso IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento), id_accion = VALUES(id_accion),
  activo = 1, updated_at = CURRENT_TIMESTAMP;

-- VER y EDITAR para cada grupo. EDITAR ya existe en perm_acciones y requiere auditoria.
INSERT INTO perm_subelemento_acciones (
  id_subelemento, id_accion, codigo_permiso, activo
)
SELECT
  ps.id_subelemento,
  pa.id_accion,
  CONCAT(ps.codigo, '.', pa.codigo),
  1
FROM perm_subelementos ps
JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
JOIN perm_acciones pa ON pa.codigo IN ('VER', 'EDITAR') AND pa.activo = 1
WHERE pe.codigo = 'INSTALACIONES_ADMINISTRACION_GRUPOS'
  AND ps.codigo LIKE 'INSTALACIONES_ADMINISTRACION_GRUPOS_%'
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento), id_accion = VALUES(id_accion),
  activo = 1, updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Validaciones: 1 acceso visual + 22 permisos de grupo = 23.
SELECT
  COUNT(*) AS permisos_instalaciones_administracion,
  23 AS esperados
FROM perm_subelemento_acciones
WHERE codigo_permiso LIKE 'INSTALACIONES_ADMINISTRACION_%'
  AND activo = 1;

SELECT
  psa.codigo_permiso,
  pa.codigo AS accion,
  pa.requiere_auditoria,
  psa.activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_acciones pa ON pa.id_accion = psa.id_accion
WHERE psa.codigo_permiso LIKE 'INSTALACIONES_ADMINISTRACION_%'
ORDER BY psa.codigo_permiso;

-- No se asigna ningun permiso. La asignacion se realiza desde Panel de Control.
-- ============================================================
-- FIN FASE 2
-- ============================================================
