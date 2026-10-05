-- Mantto Gestor · ROLLBACK · Movimientos Criticos · Fase 2 V001
-- Elimina solamente el catalogo creado por esta fase.
-- PROTECCION: si el permiso ya fue asignado a roles o usuarios, aborta para no borrar configuracion administrativa.

START TRANSACTION;

-- Las FK RESTRICT de rol_permisos/usuario_permisos protegen el catalogo:
-- si el permiso ya fue asignado, el DELETE siguiente falla y no se alcanza COMMIT.
DELETE FROM perm_subelemento_acciones
WHERE codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

DELETE ps
FROM perm_subelementos ps
INNER JOIN perm_elementos pe
  ON pe.id_elemento = ps.id_elemento
WHERE ps.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO'
  AND pe.codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL';

DELETE FROM perm_elementos
WHERE codigo = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL';

DELETE FROM perm_modulos
WHERE codigo = 'OPERACION_MOVIMIENTOS_CRITICOS';

-- ACCESO_VISUAL NO se elimina: es una accion global compartida por otros modulos.
COMMIT;

SELECT COUNT(*) AS modulo_restante
FROM perm_modulos
WHERE codigo = 'OPERACION_MOVIMIENTOS_CRITICOS';

SELECT COUNT(*) AS permiso_restante
FROM perm_subelemento_acciones
WHERE codigo_permiso = 'OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
