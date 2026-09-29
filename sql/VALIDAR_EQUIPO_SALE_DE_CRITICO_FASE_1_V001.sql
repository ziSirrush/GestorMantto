-- Mantto Gestor · VALIDAR · EQUIPO_SALE_DE_CRITICO · Fase 1 V001
-- Solo lectura.

SELECT
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  nombre_evento,
  descripcion,
  prioridad_default,
  configurable,
  obligatoria,
  campana_default,
  push_default,
  correo_default,
  titulo_default,
  mensaje_default,
  icono_default,
  accion_destino,
  ruta_default,
  orden,
  activo
FROM notificacion_eventos
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';

-- La ausencia de filas aqui significa que el evento aun no tiene destinatarios
-- por Rol Principal. Eso NO es error de instalacion: debe configurarse desde
-- Panel de Control > Notificaciones antes de la prueba funcional real.
SELECT
  ner.codigo_evento,
  ner.id_rol,
  r.rol,
  ner.politica,
  ner.activo
FROM notificacion_evento_roles ner
LEFT JOIN roles r ON r.id_rol = ner.id_rol
WHERE ner.codigo_evento = 'EQUIPO_SALE_DE_CRITICO'
ORDER BY ner.id_rol;

SELECT COUNT(*) AS relaciones_activas_validas
FROM notificacion_evento_roles ner
INNER JOIN roles r
  ON r.id_rol = ner.id_rol
 AND r.estado = 1
WHERE ner.codigo_evento = 'EQUIPO_SALE_DE_CRITICO'
  AND ner.activo = 1
  AND ner.politica IN ('OBLIGATORIA','OPCIONAL');
