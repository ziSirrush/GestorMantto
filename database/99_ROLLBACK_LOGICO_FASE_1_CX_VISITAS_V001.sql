-- [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 1 V001]
-- ROLLBACK LOGICO ADITIVO. No eliminar registros reales ni tablas.
-- NO desactiva el permiso visual, ni el modulo CX Visitas: son PREEXISTENTES.
-- Puede ser necesario restaurar permisos asignados por usuarios mas adelante.
USE mydb;
START TRANSACTION;

UPDATE perm_subelemento_acciones psa
JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
SET psa.activo = 0, psa.updated_at = CURRENT_TIMESTAMP
WHERE pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
  AND pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION'
  AND ps.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS'
  AND psa.codigo_permiso IN (
    'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER',
    'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.CREAR',
    'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.EDITAR',
    'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.DESACTIVAR',
    'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL'
  );

UPDATE perm_subelementos ps
JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
SET ps.activo = 0, ps.updated_at = CURRENT_TIMESTAMP
WHERE pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
  AND pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION'
  AND ps.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS';

UPDATE perm_elementos pe
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
SET pe.activo = 0, pe.updated_at = CURRENT_TIMESTAMP
WHERE pm.codigo = 'CUSTOMER_EXPERIENCE_VISITAS'
  AND pe.codigo = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION';

COMMIT;

-- NO DROP TABLE: la informacion persiste incluso si se revierte esta fase.
-- Si ninguna visita fue escrita, el retiro fisico se decide en mantenimiento
-- planificado, con respaldo y verificacion independiente.
SELECT codigo_permiso, activo
FROM perm_subelemento_acciones
WHERE codigo_permiso LIKE 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.%'
   OR codigo_permiso = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
ORDER BY codigo_permiso;
