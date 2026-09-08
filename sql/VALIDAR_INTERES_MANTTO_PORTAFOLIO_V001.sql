USE mydb;

-- [Aster | 2026-09-08 | ASTER-MG | VALIDAR INTERES MANTTO PORTAFOLIO V001]

-- Tabla operativa y sus dos FK.
SELECT
  COUNT(*) AS tabla_portafolio_interes_existe
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes';

SELECT
  CONSTRAINT_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY CONSTRAINT_NAME;

-- Debe devolver exactamente una fila activa con el código de facultad.
SELECT
  psa.id_subelemento_accion,
  pm.codigo AS modulo,
  pe.codigo AS elemento,
  pse.codigo AS subelemento,
  pa.codigo AS accion,
  psa.codigo_permiso,
  psa.activo
FROM perm_subelemento_acciones psa
INNER JOIN perm_subelementos pse ON pse.id_subelemento = psa.id_subelemento
INNER JOIN perm_elementos pe ON pe.id_elemento = pse.id_elemento
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_acciones pa ON pa.id_accion = psa.id_accion
WHERE psa.codigo_permiso = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';

-- Debe devolver una fila activa. No debe requerir matriz Evento-Rol.
SELECT
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  nombre_evento,
  prioridad_default,
  configurable,
  obligatoria,
  campana_default,
  push_default,
  correo_default,
  accion_destino,
  ruta_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION';

-- Debe devolver 0 filas: los destinatarios son personales desde portafolio_interes.
SELECT *
FROM notificacion_evento_roles
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION';

-- El FIX no otorga la nueva facultad automáticamente.
-- Asígnala después desde Panel de Control al rol/usuario que corresponda.
