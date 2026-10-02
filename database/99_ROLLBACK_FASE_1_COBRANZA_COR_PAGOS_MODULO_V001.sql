USE mydb;
START TRANSACTION;

-- ROLLBACK LOGICO DE FASE 1.
-- No borra catalogos, asignaciones ni historial.
-- Desactiva exclusivamente el modulo/permiso visual creado por esta fase
-- y restaura el orden previo de Aditivas.

UPDATE perm_subelemento_acciones
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_permiso = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

UPDATE perm_subelementos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo = 'COBRANZA_PAGOS_ACCESO_VISUAL_MODULO';

UPDATE perm_elementos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo = 'COBRANZA_PAGOS_ACCESO_VISUAL';

UPDATE perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
SET pm.activo = 0,
    pm.updated_at = CURRENT_TIMESTAMP
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'COBRANZA_PAGOS';

UPDATE perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
SET pm.orden = 30,
    pm.updated_at = CURRENT_TIMESTAMP
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
  AND pm.codigo = 'COBRANZA_ADITIVAS';

COMMIT;

SELECT
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pa
  ON pa.id_agrupacion = pm.id_agrupacion
WHERE pa.codigo = 'COBRANZA'
  AND UPPER(pa.empresa) LIKE '%CORELLIAN%'
ORDER BY pm.orden, pm.id_modulo;
