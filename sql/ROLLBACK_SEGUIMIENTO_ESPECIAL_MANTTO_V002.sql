USE mydb;

-- ============================================================
-- ROLLBACK LÓGICO | SEGUIMIENTO ESPECIAL MANTTO V002
--
-- NO elimina portafolio_interes ni sus datos personales.
-- NO toca asignaciones ajenas al catálogo V002.
-- Desactiva el módulo, sus dos permisos y el evento para permitir
-- una reversión segura aun si ya existen referencias de rol/usuario.
-- ============================================================

START TRANSACTION;

UPDATE perm_subelemento_acciones
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_permiso IN (
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO'
);

UPDATE perm_subelementos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo IN (
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO',
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO'
);

UPDATE perm_elementos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo IN (
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL',
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO'
);

UPDATE perm_modulos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL';

UPDATE estados_visuales
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo = 'SEGUIMIENTO_ESPECIAL';

UPDATE notificacion_eventos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_evento = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACTUALIZACION';

COMMIT;
