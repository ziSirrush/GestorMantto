-- Mantto Gestor · APLICAR · EQUIPO_SALE_DE_CRITICO · Fase 2 V001
-- NO crea evento nuevo ni relaciones Evento -> Rol.
-- Amplia la descripcion del evento creado en Fase 1 y deja un destino default
-- coherente con un evento de Equipo. La emision de Fase 1 conserva su destino
-- explicito ABRIR_TICKET; la emision automatica de Fase 2 usa ABRIR_MODULO/criticos.

START TRANSACTION;

UPDATE notificacion_eventos
SET descripcion = 'Equipo que transiciona de critico a no critico al quedar por debajo de 3 fallas BLT en 35 dias, ya sea por cambio de Tickets o por vencimiento automatico de la ventana U35.',
    titulo_default = 'Equipo dejo de ser critico',
    mensaje_default = 'Un equipo dejo de cumplir la condicion critica de 3 fallas BLT en 35 dias.',
    icono_default = '✅',
    accion_destino = 'ABRIR_MODULO',
    ruta_default = 'criticos',
    updated_at = NOW()
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';

COMMIT;

SELECT
  codigo_evento,
  descripcion,
  titulo_default,
  icono_default,
  accion_destino,
  ruta_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';
