USE mydb;

-- [Aster | 2026-08-27 | ASTER-MG | VERIFICAR_FIX_PUSH_DEFAULT_ACTIVO_V001]
-- SOLO LECTURA. No modifica datos.

-- 1) Los ocho eventos deben estar activos con push_default = 1.
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
  activo,
  CASE
    WHEN activo = 1
     AND configurable = 1
     AND obligatoria = 0
     AND campana_default = 1
     AND push_default = 1
      THEN 'OK'
    ELSE 'REVISAR'
  END AS validacion
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

-- 2) Resultado global esperado: 8 / 8 / 0.
SELECT
  COUNT(*) AS eventos_objetivo,
  SUM(CASE WHEN activo = 1 AND push_default = 1 THEN 1 ELSE 0 END) AS push_default_activo,
  SUM(CASE WHEN activo <> 1 OR push_default <> 1 THEN 1 ELSE 0 END) AS revisar
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
);

-- 3) Las preferencias existentes NO son modificadas por este FIX.
--    Este reporte permite comprobar que las elecciones explicitas siguen ahí.
SELECT
  p.codigo_evento,
  COUNT(*) AS preferencias_explicitas,
  SUM(CASE WHEN p.push = 1 THEN 1 ELSE 0 END) AS push_activado_usuario,
  SUM(CASE WHEN p.push = 0 THEN 1 ELSE 0 END) AS push_desactivado_usuario,
  SUM(CASE WHEN p.silenciada = 1 THEN 1 ELSE 0 END) AS silenciadas_usuario
FROM notificacion_preferencias p
WHERE p.codigo_evento IN (
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
GROUP BY p.codigo_evento
ORDER BY p.codigo_evento;

-- 4) La matriz Evento <-> Rol tampoco es modificada.
SELECT
  ner.codigo_evento,
  SUM(CASE WHEN ner.activo = 1 AND ner.politica = 'OBLIGATORIA' THEN 1 ELSE 0 END) AS roles_obligatorios,
  SUM(CASE WHEN ner.activo = 1 AND ner.politica = 'OPCIONAL' THEN 1 ELSE 0 END) AS roles_opcionales
FROM notificacion_evento_roles ner
WHERE ner.codigo_evento IN (
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
)
GROUP BY ner.codigo_evento
ORDER BY ner.codigo_evento;
