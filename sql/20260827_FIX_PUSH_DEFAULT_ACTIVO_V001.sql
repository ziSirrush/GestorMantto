USE mydb;

-- [Aster | 2026-08-27 | ASTER-MG | FIX_PUSH_DEFAULT_ACTIVO_V001]
--
-- OBJETIVO
-- Alinear el valor por defecto del canal Push con las normas cerradas de
-- Notificaciones: las configuraciones nacen activas y, cuando la politica del
-- rol es OPCIONAL, la preferencia explicita del usuario sigue siendo la
-- autoridad para desactivar/silenciar el canal.
--
-- ALCANCE ESTRICTO
-- - Solo modifica notificacion_eventos.push_default.
-- - NO modifica notificacion_preferencias.
-- - NO modifica notificacion_evento_roles.
-- - NO modifica Campana, Correo, prioridad, alcance, emisores o destinatarios.
-- - NO crea tablas, columnas, indices ni relaciones.
-- - Compatible con SQL_SAFE_UPDATES: el UPDATE filtra por codigo_evento (PK).
--
-- EVENTOS OBJETIVO AUDITADOS
-- 1) tareas.comentario.creado
-- 2) tickets.comentario.creado
-- 3) ventas.cotizacion.comentario
-- 4) ventas.cotizacion.estatus
-- 5) ventas.prospeccion.comentario
-- 6) ventas.prospeccion.estatus
-- 7) ventas.redes.comentario
-- 8) ventas.redes.estatus

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT FAIL-CLOSED
-- ---------------------------------------------------------------------------
-- Los ocho eventos deben existir exactamente una vez, permanecer activos,
-- configurables, no ser eventos legacy-globales obligatorios y conservar
-- Campana activa por defecto. Si algo cambio desde la auditoria, el UPDATE
-- queda bloqueado mediante @mg_preflight_ok = 0.

SET @mg_expected_targets = 8;

SET @mg_found_targets = (
  SELECT COUNT(*)
  FROM notificacion_eventos
  WHERE codigo_evento IN (
    'tareas.comentario.creado',
    'tickets.comentario.creado',
    'ventas.cotizacion.comentario',
    'ventas.cotizacion.estatus',
    'ventas.prospeccion.comentario',
    'ventas.prospeccion.estatus',
    'ventas.redes.comentario',
    'ventas.redes.estatus'
  )
);

SET @mg_valid_targets = (
  SELECT COUNT(*)
  FROM notificacion_eventos
  WHERE codigo_evento IN (
    'tareas.comentario.creado',
    'tickets.comentario.creado',
    'ventas.cotizacion.comentario',
    'ventas.cotizacion.estatus',
    'ventas.prospeccion.comentario',
    'ventas.prospeccion.estatus',
    'ventas.redes.comentario',
    'ventas.redes.estatus'
  )
    AND activo = 1
    AND configurable = 1
    AND obligatoria = 0
    AND campana_default = 1
);

SET @mg_preflight_ok = (
  @mg_found_targets = @mg_expected_targets
  AND @mg_valid_targets = @mg_expected_targets
);

SELECT
  @mg_expected_targets AS eventos_esperados,
  @mg_found_targets AS eventos_encontrados,
  @mg_valid_targets AS eventos_validos,
  @mg_preflight_ok AS preflight_ok,
  CASE
    WHEN @mg_preflight_ok = 1 THEN 'OK_PARA_APLICAR'
    ELSE 'ABORTADO_REVISAR_CATALOGO'
  END AS diagnostico;

-- ---------------------------------------------------------------------------
-- 2. CAMBIO TRANSACCIONAL E IDEMPOTENTE
-- ---------------------------------------------------------------------------
START TRANSACTION;

UPDATE notificacion_eventos
SET push_default = 1
WHERE codigo_evento IN (
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
  AND activo = 1
  AND push_default <> 1
  AND @mg_preflight_ok = 1;

SET @mg_rows_changed = ROW_COUNT();

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. POST-FLIGHT
-- ---------------------------------------------------------------------------
SET @mg_post_targets = (
  SELECT COUNT(*)
  FROM notificacion_eventos
  WHERE codigo_evento IN (
    'tareas.comentario.creado',
    'tickets.comentario.creado',
    'ventas.cotizacion.comentario',
    'ventas.cotizacion.estatus',
    'ventas.prospeccion.comentario',
    'ventas.prospeccion.estatus',
    'ventas.redes.comentario',
    'ventas.redes.estatus'
  )
    AND activo = 1
    AND push_default = 1
);

SELECT
  @mg_preflight_ok AS preflight_ok,
  @mg_rows_changed AS filas_modificadas,
  @mg_post_targets AS eventos_push_default_activo,
  CASE
    WHEN @mg_preflight_ok = 1
     AND @mg_post_targets = @mg_expected_targets
      THEN 'OK'
    WHEN @mg_preflight_ok = 0
      THEN 'NO_APLICADO_PRECHECK'
    ELSE 'REVISAR'
  END AS validacion_final;

SELECT
  codigo_evento,
  agrupacion,
  modulo,
  prioridad_default,
  configurable,
  obligatoria,
  campana_default,
  push_default,
  correo_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
ORDER BY codigo_evento;
