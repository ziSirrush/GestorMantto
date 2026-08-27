-- [Aster | 2026-08-27 | ASTER-MG | FIX_CRITICOS_DESTINO_TICKET_V001]
--
-- OBJETIVO
-- Alinear el destino de catalogo de los tres eventos criticos base con el
-- emisor productivo vigente: todos abren el Ticket exacto que origino el evento.
--
-- CAMBIO UNICO
--   notificacion_eventos.accion_destino:
--     ABRIR_MODULO -> ABRIR_TICKET
--
-- NO MODIFICA
-- - sup_notificaciones historicas
-- - matriz Evento <-> Rol
-- - preferencias
-- - prioridades / iconos / textos
-- - rutas default
-- - alcance UNITED
-- - frontend / router / Service Worker
--
-- SEGURIDAD
-- El UPDATE solo se habilita si existen exactamente los 3 eventos activos y
-- sus acciones actuales son exclusivamente ABRIR_MODULO o ABRIR_TICKET.
-- Si encuentra una accion distinta, falla cerrado: no actualiza ninguna fila.

START TRANSACTION;

-- ============================================================
-- 1. PRECHECK
-- ============================================================
SELECT
  COUNT(*),
  COALESCE(SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN accion_destino = 'ABRIR_MODULO' THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN accion_destino = 'ABRIR_TICKET' THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN accion_destino NOT IN ('ABRIR_MODULO', 'ABRIR_TICKET') THEN 1 ELSE 0 END), 0)
INTO
  @fix3_total_eventos,
  @fix3_eventos_activos,
  @fix3_pendientes_alinear,
  @fix3_ya_alineados,
  @fix3_acciones_inesperadas
FROM notificacion_eventos
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
);

SELECT
  @fix3_total_eventos AS total_eventos,
  @fix3_eventos_activos AS eventos_activos,
  @fix3_pendientes_alinear AS pendientes_alinear,
  @fix3_ya_alineados AS ya_alineados,
  @fix3_acciones_inesperadas AS acciones_inesperadas,
  CASE
    WHEN @fix3_total_eventos <> 3 THEN 'DETENER_EVENTO_FALTANTE'
    WHEN @fix3_eventos_activos <> 3 THEN 'DETENER_EVENTO_INACTIVO'
    WHEN @fix3_acciones_inesperadas > 0 THEN 'DETENER_ACCION_INESPERADA'
    WHEN @fix3_pendientes_alinear = 0 THEN 'YA_APLICADO'
    ELSE 'LISTO_PARA_APLICAR'
  END AS estado_precheck;

SELECT
  codigo_evento,
  modulo,
  accion,
  accion_destino,
  ruta_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
)
ORDER BY codigo_evento;

-- ============================================================
-- 2. UPDATE IDPOTENTE Y FAIL-CLOSED
-- ============================================================
UPDATE notificacion_eventos
SET accion_destino = 'ABRIR_TICKET'
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
)
  AND activo = 1
  AND accion_destino = 'ABRIR_MODULO'
  AND @fix3_total_eventos = 3
  AND @fix3_eventos_activos = 3
  AND @fix3_acciones_inesperadas = 0;

SELECT ROW_COUNT() AS registros_actualizados;

-- ============================================================
-- 3. POSTCHECK
-- Esperado: 3 filas, las 3 con ABRIR_TICKET.
-- ruta_default se conserva sin cambios.
-- ============================================================
SELECT
  codigo_evento,
  modulo,
  accion,
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
  'PERSONA_ATRAPADA'
)
ORDER BY codigo_evento;

COMMIT;
