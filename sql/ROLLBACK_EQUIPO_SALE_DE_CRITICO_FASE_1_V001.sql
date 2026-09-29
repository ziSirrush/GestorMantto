-- Mantto Gestor · ROLLBACK seguro · EQUIPO_SALE_DE_CRITICO · Fase 1 V001
-- Conserva historial: desactiva el evento y sus relaciones activas, no borra filas.

START TRANSACTION;

UPDATE notificacion_evento_roles
SET activo = 0
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO'
  AND activo = 1;

UPDATE notificacion_eventos
SET activo = 0,
    updated_at = NOW()
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';

COMMIT;

SELECT codigo_evento, activo, updated_at
FROM notificacion_eventos
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';
