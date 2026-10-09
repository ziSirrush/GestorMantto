-- [Aster | 2026-10-09 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001]
-- SOLO REGISTRO DE UN PERMISO NUEVO EN TABLAS EXISTENTES.
-- Requisito: FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_V001.sql ya aplicada.
-- No modifica rol_permisos, usuario_permisos, usuarios ni ins_fl.
-- No concede acceso a nadie automaticamente. Ejecutar manualmente tras respaldo
-- y revision del diff de permisos. El sistema falla cerrado si no se registra.

START TRANSACTION;

INSERT INTO perm_subelemento_acciones (
  id_subelemento, id_accion, codigo_permiso, activo
)
SELECT ps.id_subelemento, pa.id_accion,
       'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR', 1
FROM perm_subelementos ps
INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_agrupaciones pg ON pg.id_agrupacion = pm.id_agrupacion
INNER JOIN perm_acciones pa ON pa.codigo = 'EDITAR' AND pa.activo = 1
WHERE ps.codigo = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO'
  AND ps.activo = 1
  AND pe.codigo = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL'
  AND pe.activo = 1
  AND pm.codigo = 'INSTALACIONES_ADMINISTRACION'
  AND pm.activo = 1
  -- `perm_agrupaciones.empresa` almacena nombre legal, no codigo de dominio.
  -- El Guard central asocia INSTALACIONES al dominio CORELLIAN.
  AND pg.codigo = 'INSTALACIONES'
  AND pg.activo = 1
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Debe regresar EXACTAMENTE una fila con activo=1 y accion=EDITAR.
-- Si no aparece, NO desplegar el backend (revisar Fase 2/permisos).
SELECT psa.id_subelemento_accion, psa.codigo_permiso,
       pa.codigo AS accion, pa.requiere_auditoria, psa.activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_acciones pa ON pa.id_accion = psa.id_accion
WHERE psa.codigo_permiso =
  'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR';

-- Asignar permiso de EDITAR desde Panel de Control solo a destinatarios
-- autorizados. Deben tener tambien ACCESO_VISUAL y puerta CORELLIAN valida.
-- No insertar aqui permisos por rol ni generar llaves maestras implicitas.
