-- Mantto Gestor · PRECHECK · Movimientos Criticos · Fase 2 V001
-- Solo lectura. No modifica datos.
-- Base esperada: ziSirrush/GestorMantto main e5d0d3f5b7ab4bf85a3ed7d89557ee9566068a0c

SELECT
  pa.id_agrupacion,
  pa.codigo,
  pa.nombre,
  pa.empresa,
  pa.activo
FROM perm_agrupaciones pa
WHERE pa.codigo = 'OPERACION';

SELECT
  pm.id_modulo,
  pm.id_agrupacion,
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo
FROM perm_modulos pm
WHERE pm.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS';

SELECT
  pe.id_elemento,
  pe.codigo AS elemento_codigo,
  ps.id_subelemento,
  ps.codigo AS subelemento_codigo,
  psa.id_subelemento_accion,
  psa.codigo_permiso,
  psa.activo
FROM perm_elementos pe
LEFT JOIN perm_subelementos ps
  ON ps.id_elemento = pe.id_elemento
LEFT JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento = ps.id_subelemento
WHERE pe.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL'
   OR ps.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO'
   OR psa.codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

SELECT
  pa.id_accion,
  pa.codigo,
  pa.nombre,
  pa.activo
FROM perm_acciones pa
WHERE pa.codigo = 'ACCESO_VISUAL';

-- Debe devolver 0 antes de una instalacion nueva.
SELECT COUNT(*) AS asignaciones_rol_existentes
FROM rol_permisos rp
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE psa.codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

SELECT COUNT(*) AS asignaciones_usuario_existentes
FROM usuario_permisos up
INNER JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = up.id_subelemento_accion
WHERE psa.codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
