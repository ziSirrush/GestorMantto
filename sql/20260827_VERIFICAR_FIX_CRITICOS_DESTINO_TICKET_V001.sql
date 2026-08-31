-- [Aster | 2026-08-27 | ASTER-MG | VERIFICACION_FIX_CRITICOS_DESTINO_TICKET_V001]
-- SOLO LECTURA. No modifica datos ni estructura.

-- 1) Catalogo: los 5 eventos criticos deben abrir Ticket.
SELECT
  codigo_evento,
  modulo,
  accion_destino,
  ruta_default,
  activo,
  CASE
    WHEN activo = 1 AND accion_destino = 'ABRIR_TICKET' THEN 'OK'
    ELSE 'REVISAR'
  END AS validacion
FROM notificacion_eventos
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'PERSONA_ATRAPADA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
)
ORDER BY codigo_evento;

-- 2) Notificaciones reales existentes: este fix NO las reescribe.
-- Sirve para confirmar que el emisor productivo ya materializa ABRIR_TICKET
-- y conserva la referencia/ruta exacta del Ticket causante.
SELECT
  tipo_notificacion,
  COUNT(*) AS total,
  SUM(CASE WHEN accion_notificacion = 'ABRIR_TICKET' THEN 1 ELSE 0 END) AS abrir_ticket,
  SUM(CASE WHEN accion_notificacion <> 'ABRIR_TICKET' THEN 1 ELSE 0 END) AS otro_destino,
  SUM(CASE WHEN id_referencia IS NULL THEN 1 ELSE 0 END) AS sin_referencia,
  SUM(CASE WHEN ruta_destino IS NULL OR TRIM(ruta_destino) = '' THEN 1 ELSE 0 END) AS sin_ruta
FROM sup_notificaciones
WHERE tipo_notificacion IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'PERSONA_ATRAPADA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
)
GROUP BY tipo_notificacion
ORDER BY tipo_notificacion;
