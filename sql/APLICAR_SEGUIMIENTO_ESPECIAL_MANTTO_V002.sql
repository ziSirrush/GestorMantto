USE mydb;

-- ============================================================
-- APLICAR | SEGUIMIENTO ESPECIAL MANTTO V002
--
-- NO crea ni altera portafolio_interes: el usuario confirmó que
-- esa tabla ya fue creada con sus FK.
--
-- Sustituye lógicamente el catálogo V001 y crea/reactiva el catálogo V002.
-- NO asigna permisos a roles ni usuarios.
-- ============================================================

START TRANSACTION;

-- 0) V002 sustituye el catálogo funcional V001 ya integrado en GitHub.
-- Se desactiva solo la acción/evento legacy; no se borra historial ni datos.
UPDATE perm_subelemento_acciones
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_permiso =
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';

UPDATE notificacion_eventos
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION';

-- 1) Módulo Portafolio -> Seguimiento Especial.
INSERT INTO perm_modulos (
  id_agrupacion, codigo, nombre, ruta_frontend, orden, activo
)
SELECT
  pa.id_agrupacion,
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL',
  'Seguimiento Especial',
  'seguimiento-especial',
  12,
  1
FROM perm_agrupaciones pa
WHERE pa.codigo = 'PORTAFOLIO'
  AND pa.activo = 1
ON DUPLICATE KEY UPDATE
  id_agrupacion = VALUES(id_agrupacion),
  nombre = VALUES(nombre),
  ruta_frontend = VALUES(ruta_frontend),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @se_id_modulo := (
  SELECT id_modulo
  FROM perm_modulos
  WHERE codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL'
  LIMIT 1
);

-- 2) Elemento de acceso visual.
INSERT INTO perm_elementos (
  id_modulo, codigo, nombre, tipo, orden, activo
)
SELECT
  @se_id_modulo,
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL',
  'Acceso visual',
  'VISUAL',
  0,
  1
WHERE @se_id_modulo IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @se_id_elemento_acceso := (
  SELECT id_elemento
  FROM perm_elementos
  WHERE codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL'
  LIMIT 1
);

INSERT INTO perm_subelementos (
  id_elemento, codigo, nombre, orden, activo
)
SELECT
  @se_id_elemento_acceso,
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO',
  'Mostrar módulo',
  0,
  1
WHERE @se_id_elemento_acceso IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @se_id_subelemento_acceso := (
  SELECT id_subelemento
  FROM perm_subelementos
  WHERE codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO'
  LIMIT 1
);
SET @se_id_accion_acceso := (
  SELECT id_accion
  FROM perm_acciones
  WHERE codigo = 'ACCESO_VISUAL'
    AND activo = 1
  LIMIT 1
);

INSERT INTO perm_subelemento_acciones (
  id_subelemento, id_accion, codigo_permiso, activo
)
SELECT
  @se_id_subelemento_acceso,
  @se_id_accion_acceso,
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  1
WHERE @se_id_subelemento_acceso IS NOT NULL
  AND @se_id_accion_acceso IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  codigo_permiso = VALUES(codigo_permiso),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- 3) Facultad para marcar/desmarcar Proyecto/Equipo.
INSERT INTO perm_elementos (
  id_modulo, codigo, nombre, tipo, orden, activo
)
SELECT
  @se_id_modulo,
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO',
  'Seguimiento Especial',
  'SEGUIMIENTO',
  10,
  1
WHERE @se_id_modulo IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @se_id_elemento_gestion := (
  SELECT id_elemento
  FROM perm_elementos
  WHERE codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO'
  LIMIT 1
);

INSERT INTO perm_subelementos (
  id_elemento, codigo, nombre, orden, activo
)
SELECT
  @se_id_elemento_gestion,
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO',
  'Proyecto / Equipo',
  10,
  1
WHERE @se_id_elemento_gestion IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SET @se_id_subelemento_gestion := (
  SELECT id_subelemento
  FROM perm_subelementos
  WHERE codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO'
  LIMIT 1
);
SET @se_id_accion_gestion := (
  SELECT id_accion
  FROM perm_acciones
  WHERE codigo = 'GESTIONAR_SEGUIMIENTO'
    AND activo = 1
  LIMIT 1
);

INSERT INTO perm_subelemento_acciones (
  id_subelemento, id_accion, codigo_permiso, activo
)
SELECT
  @se_id_subelemento_gestion,
  @se_id_accion_gestion,
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO',
  1
WHERE @se_id_subelemento_gestion IS NOT NULL
  AND @se_id_accion_gestion IS NOT NULL
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  codigo_permiso = VALUES(codigo_permiso),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;


-- 4) Indicador visual oficial. Sin colores/fondo/borde: solo la estrella.
INSERT INTO estados_visuales (
  codigo,
  nombre,
  descripcion,
  categoria,
  emoji,
  icono,
  color_texto,
  color_fondo,
  color_borde,
  prioridad,
  activo
) VALUES (
  'SEGUIMIENTO_ESPECIAL',
  'Seguimiento Especial',
  'Proyecto o equipo incluido por el usuario en su Seguimiento Especial personal.',
  'INFORMATIVO',
  '⭐',
  'ti ti-star-filled',
  NULL,
  NULL,
  NULL,
  5,
  1
)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  categoria = VALUES(categoria),
  emoji = VALUES(emoji),
  icono = VALUES(icono),
  color_texto = NULL,
  color_fondo = NULL,
  color_borde = NULL,
  prioridad = VALUES(prioridad),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- 5) Evento personal de notificación.
INSERT INTO notificacion_eventos (
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
) VALUES (
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACTUALIZACION',
  'Portafolio',
  'Seguimiento Especial',
  'ACTUALIZACION',
  'Actividad en Seguimiento Especial',
  'Actividad relevante relacionada con un proyecto o equipo que el usuario tiene en Seguimiento Especial.',
  'MEDIA',
  1,
  0,
  1,
  1,
  0,
  '⭐ Seguimiento Especial',
  'Hay nueva actividad en un proyecto o equipo de tu Seguimiento Especial.',
  '⭐',
  'ABRIR_MODULO',
  'seguimiento-especial',
  60,
  1
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

COMMIT;
