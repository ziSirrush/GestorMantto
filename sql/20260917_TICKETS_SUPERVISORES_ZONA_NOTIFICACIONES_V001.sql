-- Mantto Gestor | Tickets: alta y cierre para Supervisores de Zona V001
-- Fecha: 2026-09-17
-- Idempotente. No modifica los eventos FOLLOW-ONLY de Seguimiento Especial.

USE mydb;

START TRANSACTION;

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria,
  campana_default, push_default, correo_default,
  titulo_default, mensaje_default, icono_default,
  accion_destino, ruta_default, orden, activo
) VALUES
(
  'TICKET_INSERTADO', 'Operacion', 'Tickets',
  'INSERTAR_TICKET', 'Ticket insertado',
  'Se genero un nuevo Ticket. La audiencia se limita a Supervisores asignados a su Zona Operativa oficial.',
  'MEDIA', 0, 1, 1, 1, 0,
  'Nuevo ticket', 'Se genero un nuevo ticket.', '🎫',
  'ABRIR_TICKET', NULL, 115, 1
),
(
  'TICKET_CERRADO', 'Operacion', 'Tickets',
  'CERRAR_TICKET', 'Ticket cerrado',
  'Un Ticket cambio de un estado no cerrado a Cerrado. La audiencia se limita a Supervisores asignados a su Zona Operativa oficial.',
  'MEDIA', 0, 1, 1, 1, 0,
  'Ticket cerrado', 'Se cerro un ticket.', '✅',
  'ABRIR_TICKET', NULL, 116, 1
)
ON DUPLICATE KEY UPDATE
  agrupacion = VALUES(agrupacion),
  modulo = VALUES(modulo),
  accion = VALUES(accion),
  nombre_evento = VALUES(nombre_evento),
  descripcion = VALUES(descripcion),
  prioridad_default = VALUES(prioridad_default),
  configurable = VALUES(configurable),
  obligatoria = VALUES(obligatoria),
  campana_default = VALUES(campana_default),
  push_default = VALUES(push_default),
  correo_default = VALUES(correo_default),
  titulo_default = VALUES(titulo_default),
  mensaje_default = VALUES(mensaje_default),
  icono_default = VALUES(icono_default),
  accion_destino = VALUES(accion_destino),
  ruta_default = VALUES(ruta_default),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Los dos eventos solo admiten roles activos de Supervisor Mantenimiento Zona.
-- La audiencia runtime exige ademas usuario_zop activa para la zona del Ticket.
INSERT INTO notificacion_evento_roles (codigo_evento, id_rol, politica, activo)
SELECT event_codes.codigo_evento, r.id_rol, 'OBLIGATORIA', 1
FROM (
  SELECT 'TICKET_INSERTADO' AS codigo_evento
  UNION ALL
  SELECT 'TICKET_CERRADO'
) event_codes
INNER JOIN roles r
  ON r.estado = 1
 AND UPPER(TRIM(r.rol)) LIKE 'SUPERVISOR MANTENIMIENTO ZONA%'
ON DUPLICATE KEY UPDATE
  politica = 'OBLIGATORIA',
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Falla cerrada de configuracion: cualquier relacion historica con otro rol
-- queda inactiva. El resolver runtime tampoco la aceptaria como candidato.
UPDATE notificacion_evento_roles ner
INNER JOIN roles r ON r.id_rol = ner.id_rol
SET ner.activo = 0,
    ner.updated_at = CURRENT_TIMESTAMP
WHERE ner.codigo_evento IN ('TICKET_INSERTADO', 'TICKET_CERRADO')
  AND UPPER(TRIM(r.rol)) NOT LIKE 'SUPERVISOR MANTENIMIENTO ZONA%'
  AND ner.activo <> 0;

COMMIT;

-- Verificacion: solo deben aparecer relaciones OBLIGATORIA con Supervisores.
SELECT
  e.codigo_evento,
  e.nombre_evento,
  e.configurable,
  e.obligatoria,
  e.campana_default,
  e.push_default,
  e.correo_default,
  r.id_rol,
  r.rol,
  ner.politica,
  ner.activo
FROM notificacion_eventos e
LEFT JOIN notificacion_evento_roles ner
  ON ner.codigo_evento = e.codigo_evento
LEFT JOIN roles r
  ON r.id_rol = ner.id_rol
WHERE e.codigo_evento IN ('TICKET_INSERTADO', 'TICKET_CERRADO')
ORDER BY e.codigo_evento, r.rol;

-- Debe devolver cero filas.
SELECT ner.codigo_evento, r.id_rol, r.rol, ner.politica, ner.activo
FROM notificacion_evento_roles ner
INNER JOIN roles r ON r.id_rol = ner.id_rol
WHERE ner.codigo_evento IN ('TICKET_INSERTADO', 'TICKET_CERRADO')
  AND ner.activo = 1
  AND (
    ner.politica <> 'OBLIGATORIA'
    OR UPPER(TRIM(r.rol)) NOT LIKE 'SUPERVISOR MANTENIMIENTO ZONA%'
  );
