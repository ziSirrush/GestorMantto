-- Mantto Gestor | Fotografías: aviso exclusivo a Dirección General V001
-- Fecha: 2026-10-08
-- Idempotente. Un único evento cubre carga y eliminación de fotografías.

USE mydb;

START TRANSACTION;

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria,
  campana_default, push_default, correo_default,
  titulo_default, mensaje_default, icono_default,
  accion_destino, ruta_default, orden, activo
) VALUES (
  'FOTOGRAFIA_PROYECTO_ACTUALIZADA', 'Fotografias', 'Proyectos',
  'ADMINISTRAR_FOTOGRAFIA', 'Fotografía de proyecto cargada o eliminada',
  'Un usuario con rol Gestor de Fotografías cargó o eliminó una fotografía de proyecto. Aviso exclusivo para Dirección General.',
  'MEDIA', 0, 1, 1, 1, 0,
  'Fotografía de proyecto actualizada',
  'Un Gestor de Fotografías actualizó las fotografías de un proyecto.',
  '📷', 'ABRIR_MODULO', NULL, 117, 1
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

-- La política obligatoria garantiza campana y push. El JOIN nominal evita
-- depender de un id_rol particular entre ambientes.
INSERT INTO notificacion_evento_roles (codigo_evento, id_rol, politica, activo)
SELECT 'FOTOGRAFIA_PROYECTO_ACTUALIZADA', r.id_rol, 'OBLIGATORIA', 1
FROM roles r
WHERE r.estado = 1
  AND (
    UPPER(TRIM(COALESCE(r.rol, ''))) = 'DIRECTOR GENERAL'
    OR UPPER(TRIM(COALESCE(r.codigo, ''))) IN ('DIRECTOR GENERAL', 'DIRECTOR_GENERAL')
  )
ON DUPLICATE KEY UPDATE
  politica = 'OBLIGATORIA',
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Falla cerrada: ninguna relación histórica con otro rol puede ampliar la
-- audiencia de este evento.
UPDATE notificacion_evento_roles ner
INNER JOIN roles r ON r.id_rol = ner.id_rol
SET ner.activo = 0,
    ner.updated_at = CURRENT_TIMESTAMP
WHERE ner.codigo_evento = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
  AND NOT (
    UPPER(TRIM(COALESCE(r.rol, ''))) = 'DIRECTOR GENERAL'
    OR UPPER(TRIM(COALESCE(r.codigo, ''))) IN ('DIRECTOR GENERAL', 'DIRECTOR_GENERAL')
  )
  AND ner.activo <> 0;

COMMIT;

-- Verificación: las relaciones activas deben ser únicamente OBLIGATORIA para
-- Director General.
SELECT
  e.codigo_evento,
  e.nombre_evento,
  e.configurable,
  e.obligatoria,
  r.id_rol,
  r.rol,
  r.codigo,
  ner.politica,
  ner.activo
FROM notificacion_eventos e
LEFT JOIN notificacion_evento_roles ner
  ON ner.codigo_evento = e.codigo_evento
LEFT JOIN roles r
  ON r.id_rol = ner.id_rol
WHERE e.codigo_evento = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
ORDER BY r.rol;

-- Debe devolver cero filas.
SELECT ner.codigo_evento, r.id_rol, r.rol, r.codigo, ner.politica, ner.activo
FROM notificacion_evento_roles ner
INNER JOIN roles r ON r.id_rol = ner.id_rol
WHERE ner.codigo_evento = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
  AND ner.activo = 1
  AND (
    ner.politica <> 'OBLIGATORIA'
    OR NOT (
      UPPER(TRIM(COALESCE(r.rol, ''))) = 'DIRECTOR GENERAL'
      OR UPPER(TRIM(COALESCE(r.codigo, ''))) IN ('DIRECTOR GENERAL', 'DIRECTOR_GENERAL')
    )
  );
