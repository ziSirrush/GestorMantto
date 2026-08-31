-- FASE N6 · Catalogo de interacciones reales de Notificaciones
-- Fecha: 2026-08-15
-- IMPORTANTE:
-- 1) Este script NO altera el esquema.
-- 2) NO crea relaciones Evento-Rol. La matriz se configura desde Panel de Control > Notificaciones.
-- 3) El backend N6 usa requireRoleMatrix=true: sin al menos una relacion configurada,
--    el evento queda fail-closed y no se envia por el flujo legacy.

START TRANSACTION;

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria,
  campana_default, push_default, correo_default,
  titulo_default, mensaje_default, icono_default,
  accion_destino, ruta_default, orden, activo
) VALUES
(
  'COMENTARIO', 'General', 'Interacciones', 'COMENTAR', 'Comentario',
  'Se genera un comentario en un registro con el que el usuario esta relacionado.',
  'MEDIA', 1, 0, 1, 1, 0,
  'Nuevo comentario', 'Tienes un nuevo comentario relacionado.', '💬',
  'ABRIR_MODULO', NULL, 10, 1
),
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
  -- Si el codigo ya existe, N6 NO sobreescribe su catalogo actual.
  codigo_evento = VALUES(codigo_evento);

COMMIT;

-- Verificacion. Deben aparecer 4 filas de catalogo.
SELECT
  codigo_evento, agrupacion, modulo, nombre_evento,
  prioridad_default, campana_default, push_default, activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'COMENTARIO',
  'FALLA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'NUEVO_EQUIPO_CRITICO'
)
ORDER BY orden, codigo_evento;

-- La matriz puede permanecer vacia hasta configurarla en Panel de Control.
SELECT codigo_evento, id_rol, politica, activo
FROM notificacion_evento_roles
WHERE codigo_evento IN (
  'COMENTARIO',
  'FALLA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'NUEVO_EQUIPO_CRITICO'
)
ORDER BY codigo_evento, id_rol;
