-- Mantto Gestor · ROLLBACK · EQUIPO_SALE_DE_CRITICO · Fase 2 V001
-- Restaura SOLO los defaults de catalogo que tenia Fase 1.
-- No borra historial, no desactiva el evento y no modifica Evento -> Rol.

START TRANSACTION;

UPDATE notificacion_eventos
SET descripcion = 'Equipo que transiciona de critico a no critico al quedar por debajo de 3 fallas BLT en 35 dias como resultado de un cambio de Ticket.',
    titulo_default = 'Equipo dejo de ser critico',
    mensaje_default = 'Un equipo dejo de cumplir la condicion critica de 3 fallas BLT en 35 dias.',
    icono_default = '✅',
    accion_destino = 'ABRIR_TICKET',
    ruta_default = NULL,
    updated_at = NOW()
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';

COMMIT;
