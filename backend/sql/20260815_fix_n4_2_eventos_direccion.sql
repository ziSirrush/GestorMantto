-- FIX N4.2 · Catalogo de notificaciones solicitadas por Direccion
-- Fecha: 2026-08-15
-- Objetivo:
--   Garantizar que las 3 interacciones nuevas solicitadas por Direccion
--   existan ACTIVAS en notificacion_eventos para que N2/N4 las muestre.
--
-- Este script:
--   - NO altera el esquema.
--   - NO crea ni modifica asignaciones Evento-Rol.
--   - NO modifica notificacion_evento_roles.
--   - Es idempotente: puede ejecutarse nuevamente sin duplicar eventos.

START TRANSACTION;

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria,
  campana_default, push_default, correo_default,
  titulo_default, mensaje_default, icono_default,
  accion_destino, ruta_default, orden, activo
) VALUES
(
  'FALLA_EQUIPO_CRITICO', 'Operacion', 'Tickets', 'NUEVA_FALLA_CRITICO', 'Falla en Equipo Critico',
  'Nuevo ticket con responsabilidad BLT sobre un equipo que ya era critico antes del nuevo ticket.',
  'CRITICA', 1, 0, 1, 1, 0,
  'Nueva falla en equipo critico', 'Se genero una nueva falla BLT en un equipo critico.', '💥',
  'ABRIR_TICKET', NULL, 20, 1
),
(
  'PERSONA_ATRAPADA', 'Operacion', 'Tickets', 'PERSONA_ATRAPADA', 'Persona Atrapada',
  'Nuevo ticket clasificado por la regla vigente de persona atrapada.',
  'CRITICA', 1, 0, 1, 1, 0,
  'Ticket de persona atrapada', 'Se genero un ticket relacionado con una persona atrapada.', '🚨',
  'ABRIR_TICKET', NULL, 30, 1
),
(
  'NUEVO_EQUIPO_CRITICO', 'Operacion', 'Equipos Criticos', 'TRANSICION_CRITICO', 'Nuevo Equipo Critico',
  'Equipo que transiciona a critico bajo la regla general vigente de 3 fallas BLT en 35 dias.',
  'CRITICA', 1, 0, 1, 1, 0,
  'Nuevo equipo critico', 'Un equipo paso a condicion critica.', '💥',
  'ABRIR_TICKET', NULL, 40, 1
)
ON DUPLICATE KEY UPDATE
  agrupacion = VALUES(agrupacion),
  modulo = VALUES(modulo),
  accion = VALUES(accion),
  nombre_evento = VALUES(nombre_evento),
  descripcion = VALUES(descripcion),
  prioridad_default = VALUES(prioridad_default),
  configurable = VALUES(configurable),
  campana_default = VALUES(campana_default),
  push_default = VALUES(push_default),
  correo_default = VALUES(correo_default),
  titulo_default = VALUES(titulo_default),
  mensaje_default = VALUES(mensaje_default),
  icono_default = VALUES(icono_default),
  accion_destino = VALUES(accion_destino),
  orden = VALUES(orden),
  activo = 1;

COMMIT;

-- Verificacion: deben devolverse exactamente estas 3 filas con activo = 1.
SELECT
  codigo_evento,
  agrupacion,
  modulo,
  nombre_evento,
  prioridad_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'NUEVO_EQUIPO_CRITICO'
)
ORDER BY nombre_evento ASC;
