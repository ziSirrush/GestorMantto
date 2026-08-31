-- Mantto Gestor - Fase 3 - Retiro de Equipos Criticos Original Experimental
-- Fecha: 2026-08-05
-- Requisitos:
--   - Haber ejecutado las Fases 0 y 1 de la agrupacion Experimental.
--
-- Objetivo:
--   - Desactivar el modulo EQUIPOS_CRITICOS_ORIGINAL_EXP y sus permisos visuales.
--   - Conservar los registros historicos sin eliminarlos.
--
-- Alcance:
--   - No crea tablas.
--   - No altera estructuras.
--   - No modifica el modulo funcional Equipos Criticos del Gestor.
--   - No modifica EQUIPOS_CRITICOS_EXP.

USE mydb;
START TRANSACTION;

UPDATE perm_subelemento_acciones psa
INNER JOIN perm_subelementos ps
  ON ps.id_subelemento = psa.id_subelemento
INNER JOIN perm_elementos pe
  ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm
  ON pm.id_modulo = pe.id_modulo
SET
  psa.activo = 0,
  psa.updated_at = CURRENT_TIMESTAMP
WHERE pm.codigo = 'EQUIPOS_CRITICOS_ORIGINAL_EXP';

UPDATE perm_subelementos ps
INNER JOIN perm_elementos pe
  ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm
  ON pm.id_modulo = pe.id_modulo
SET
  ps.activo = 0,
  ps.updated_at = CURRENT_TIMESTAMP
WHERE pm.codigo = 'EQUIPOS_CRITICOS_ORIGINAL_EXP';

UPDATE perm_elementos pe
INNER JOIN perm_modulos pm
  ON pm.id_modulo = pe.id_modulo
SET
  pe.activo = 0,
  pe.updated_at = CURRENT_TIMESTAMP
WHERE pm.codigo = 'EQUIPOS_CRITICOS_ORIGINAL_EXP';

UPDATE perm_modulos
SET
  activo = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE codigo = 'EQUIPOS_CRITICOS_ORIGINAL_EXP';

COMMIT;

SELECT
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.activo
FROM perm_modulos pm
WHERE pm.codigo = 'EQUIPOS_CRITICOS_ORIGINAL_EXP';
