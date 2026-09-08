USE mydb;

-- [Aster | 2026-09-08 | ASTER-MG | ROLLBACK INTERES MANTTO PORTAFOLIO V001]
-- NO elimina portafolio_interes ni sus datos personales de seguimiento.
-- Revierte solo el catálogo de permiso + evento agregado por este FIX.
-- Si la facultad ya fue asignada a roles/usuarios, se conserva su registro
-- referencial y se desactiva para no violar las FK RESTRICT del catálogo.

START TRANSACTION;

-- 1) Permiso. Borrar solo si nunca fue referenciado por rol_permisos o usuario_permisos.
DELETE psa
FROM perm_subelemento_acciones psa
WHERE psa.codigo_permiso = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO'
  AND NOT EXISTS (
    SELECT 1
    FROM rol_permisos rp
    WHERE rp.id_subelemento_accion = psa.id_subelemento_accion
  )
  AND NOT EXISTS (
    SELECT 1
    FROM usuario_permisos up
    WHERE up.id_subelemento_accion = psa.id_subelemento_accion
  );

-- Si quedó porque ya tiene asignaciones, desactivarlo sin borrar las referencias.
UPDATE perm_subelemento_acciones
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_permiso = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';

-- 2) Catálogo padre: solo se elimina si ya no existe ninguna acción hija.
DELETE pse
FROM perm_subelementos pse
WHERE pse.codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO'
  AND NOT EXISTS (
    SELECT 1
    FROM perm_subelemento_acciones psa
    WHERE psa.id_subelemento = pse.id_subelemento
  );

DELETE pe
FROM perm_elementos pe
WHERE pe.codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES'
  AND NOT EXISTS (
    SELECT 1
    FROM perm_subelementos pse
    WHERE pse.id_elemento = pe.id_elemento
  );

-- 3) Evento. Si ya produjo notificaciones, se conserva la definición para no
-- dejar registros históricos sin catálogo y simplemente se desactiva.
DELETE FROM notificacion_eventos
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION'
  AND NOT EXISTS (
    SELECT 1
    FROM sup_notificaciones sn
    WHERE sn.tipo_notificacion = 'PORTAFOLIO_INTERES_ACTUALIZACION'
  );

UPDATE notificacion_eventos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION';

COMMIT;
