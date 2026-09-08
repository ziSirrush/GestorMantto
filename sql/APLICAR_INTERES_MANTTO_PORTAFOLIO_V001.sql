USE mydb;

-- [Aster | 2026-09-08 | ASTER-MG | APLICAR INTERES MANTTO PORTAFOLIO V001]
-- PRERREQUISITO: portafolio_interes ya existe con FK a usuarios.id_SB y portafolio.id_portafolio.
-- Este script NO crea ni modifica portafolio_interes.
-- Este script NO asigna el permiso a roles ni usuarios.

START TRANSACTION;

-- ============================================================
-- 1. FACULTAD EN CATALOGO DE PERMISOS
-- ============================================================

INSERT INTO perm_elementos
  (id_modulo, codigo, nombre, tipo, orden, activo)
SELECT
  pm.id_modulo,
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES',
  'Seguimiento de interés',
  'CONTROL',
  90,
  1
FROM perm_modulos pm
WHERE pm.codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO'
  AND pm.activo = 1
ON DUPLICATE KEY UPDATE
  id_modulo = VALUES(id_modulo),
  nombre = VALUES(nombre),
  tipo = VALUES(tipo),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelementos
  (id_elemento, codigo, nombre, orden, activo)
SELECT
  pe.id_elemento,
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO',
  'Proyecto / Equipo de interés',
  10,
  1
FROM perm_elementos pe
WHERE pe.codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES'
  AND pe.activo = 1
ON DUPLICATE KEY UPDATE
  id_elemento = VALUES(id_elemento),
  nombre = VALUES(nombre),
  orden = VALUES(orden),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO perm_subelemento_acciones
  (id_subelemento, id_accion, codigo_permiso, activo)
SELECT
  pse.id_subelemento,
  pa.id_accion,
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO',
  1
FROM perm_subelementos pse
INNER JOIN perm_acciones pa
        ON pa.codigo = 'GESTIONAR_SEGUIMIENTO'
       AND pa.activo = 1
WHERE pse.codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO'
  AND pse.activo = 1
ON DUPLICATE KEY UPDATE
  id_subelemento = VALUES(id_subelemento),
  id_accion = VALUES(id_accion),
  codigo_permiso = VALUES(codigo_permiso),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================================
-- 2. EVENTO DE NOTIFICACION PERSONAL POR INTERES
-- ============================================================
-- No se liga a notificacion_evento_roles: los destinatarios salen exclusivamente
-- de portafolio_interes y se revalidan contra permiso + alcance UNITED actual.
-- obligatoria=1: mientras el usuario mantenga activo su seguimiento, la campana
-- no depende de preferencias opcionales. Para dejar de recibir, desmarca interés.

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
  'PORTAFOLIO_INTERES_ACTUALIZACION',
  'Portafolio',
  'Proyectos de Mantenimiento',
  'SEGUIMIENTO_INTERES',
  'Actualización en seguimiento de interés',
  'Notificación personal para usuarios que siguen un proyecto o equipo de Mantenimiento.',
  'MEDIA',
  0,
  1,
  1,
  0,
  0,
  'Actividad en seguimiento de interés',
  'Se registró actividad relacionada con un proyecto o equipo que sigues.',
  '🔔',
  'ABRIR_MODULO',
  'proyectos',
  35,
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

-- IMPORTANTE:
-- La nueva facultad queda disponible en Panel de Control, pero NO se asigna
-- automáticamente a ningún rol o usuario desde este script.
