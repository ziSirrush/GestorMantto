USE mydb;

-- FIX 4: integración de permisos operativos de Cotizaciones.
-- Compatible con la estructura de Dump20260803.sql.
-- No elimina permisos personalizados ni revoca configuraciones existentes.

START TRANSACTION;

INSERT INTO perm_agrupaciones (codigo, nombre, empresa, orden, activo)
VALUES ('VENTAS', 'Ventas', 'CORELLIAN', 70, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  empresa = VALUES(empresa),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_modulos (id_agrupacion, codigo, nombre, ruta_frontend, orden, activo)
SELECT id_agrupacion, 'VENTAS_COTIZACIONES', 'Cotizaciones', 'ventas-cotizaciones', 10, 1
FROM perm_agrupaciones
WHERE codigo = 'VENTAS'
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_elementos (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT id_modulo, 'VENTAS_COTIZACIONES_OPERACION', 'Operación de cotizaciones', 'OPERACION', 10, 1
FROM perm_modulos
WHERE codigo = 'VENTAS_COTIZACIONES'
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos (id_elemento, codigo, nombre, orden, activo)
SELECT id_elemento, 'VENTAS_COTIZACIONES_OPERACION', 'Cotizaciones', 10, 1
FROM perm_elementos
WHERE codigo = 'VENTAS_COTIZACIONES_OPERACION'
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_acciones (codigo, nombre, descripcion, requiere_auditoria, activo)
VALUES
  ('VER', 'Ver', 'Permite consultar cotizaciones, catálogos, indicadores, comentarios y archivos.', 0, 1),
  ('CREAR', 'Crear', 'Permite crear cotizaciones.', 1, 1),
  ('EDITAR', 'Editar', 'Permite modificar cotizaciones, estatus, asignaciones, comentarios y archivos.', 1, 1),
  ('ELIMINAR', 'Eliminar', 'Permite desactivar cotizaciones.', 1, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  requiere_auditoria = VALUES(requiere_auditoria),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  ps.id_subelemento,
  pa.id_accion,
  CONCAT('VENTAS_COTIZACIONES_OPERACION.', pa.codigo),
  1
FROM perm_subelementos ps
INNER JOIN perm_elementos pe
        ON pe.id_elemento = ps.id_elemento
       AND pe.codigo = 'VENTAS_COTIZACIONES_OPERACION'
INNER JOIN perm_acciones pa
        ON pa.codigo IN ('VER', 'CREAR', 'EDITAR', 'ELIMINAR')
WHERE ps.codigo = 'VENTAS_COTIZACIONES_OPERACION'
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Grupo validado de acceso total a Ventas:
-- 1 Director General
-- 4 Director Ventas
-- 34 Jefa Administracion Ventas
-- 39 Auxiliar Direccion
INSERT INTO rol_permisos (id_rol, id_subelemento_accion, permitido)
SELECT
  r.id_rol,
  psa.id_subelemento_accion,
  1
FROM roles r
CROSS JOIN perm_subelemento_acciones psa
WHERE r.id_rol IN (1, 4, 34, 39)
  AND r.estado = 1
  AND psa.codigo_permiso IN (
    'VENTAS_COTIZACIONES_OPERACION.VER',
    'VENTAS_COTIZACIONES_OPERACION.CREAR',
    'VENTAS_COTIZACIONES_OPERACION.EDITAR',
    'VENTAS_COTIZACIONES_OPERACION.ELIMINAR'
  )
ON DUPLICATE KEY UPDATE
  permitido = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Verificaciones. Deben aparecer los cuatro permisos para cada rol activo del grupo.
SELECT
  r.id_rol,
  r.rol,
  psa.codigo_permiso,
  rp.permitido
FROM roles r
INNER JOIN rol_permisos rp ON rp.id_rol = r.id_rol
INNER JOIN perm_subelemento_acciones psa
        ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE r.id_rol IN (1, 4, 34, 39)
  AND psa.codigo_permiso LIKE 'VENTAS_COTIZACIONES_OPERACION.%'
ORDER BY r.id_rol, psa.codigo_permiso;

-- Diagnóstico informativo: permisos heredados actualmente concedidos a otros roles.
-- Este FIX no los revoca para evitar romper accesos vigentes antes de configurar
-- formalmente toda la agrupación desde el Panel de Control.
SELECT
  r.id_rol,
  r.rol,
  psa.codigo_permiso,
  rp.permitido
FROM rol_permisos rp
INNER JOIN roles r ON r.id_rol = rp.id_rol
INNER JOIN perm_subelemento_acciones psa
        ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE r.id_rol NOT IN (1, 4, 34, 39)
  AND rp.permitido = 1
  AND psa.codigo_permiso LIKE 'VENTAS_COTIZACIONES_OPERACION.%'
ORDER BY r.id_rol, psa.codigo_permiso;
