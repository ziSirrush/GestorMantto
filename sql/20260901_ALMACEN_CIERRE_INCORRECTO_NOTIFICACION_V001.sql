-- Mantto Gestor · Alerta de cierre incorrecto de Almacen después de 4 horas
-- Fecha: 2026-09-01
-- Idempotente. El job resuelve destinatarios por el permiso efectivo
-- ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL.

START TRANSACTION;

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria,
  campana_default, push_default, correo_default,
  titulo_default, mensaje_default, icono_default,
  accion_destino, ruta_default, orden, activo
) VALUES (
  'ALMACEN_CIERRE_INCORRECTO_4H',
  'Operacion',
  'Almacen',
  'CORREGIR_CIERRE_ACTIVO',
  'Archivo incorrecto de Almacen en uso',
  'Se emite cuando un cierre distinto al mes anterior permanece activo por cuatro horas y el Excel correcto ya esta disponible en el historico.',
  'ALTA',
  0,
  1,
  1,
  1,
  0,
  'Archivo de Almacen incorrecto en uso',
  'El cierre activo no corresponde al mes anterior. Selecciona el archivo correcto en Carga de Informacion.',
  '⚠️',
  'ABRIR_MODULO',
  'almacen-carga',
  70,
  1
)
ON DUPLICATE KEY UPDATE
  agrupacion=VALUES(agrupacion),
  modulo=VALUES(modulo),
  accion=VALUES(accion),
  nombre_evento=VALUES(nombre_evento),
  descripcion=VALUES(descripcion),
  prioridad_default=VALUES(prioridad_default),
  configurable=VALUES(configurable),
  obligatoria=VALUES(obligatoria),
  campana_default=VALUES(campana_default),
  push_default=VALUES(push_default),
  correo_default=VALUES(correo_default),
  titulo_default=VALUES(titulo_default),
  mensaje_default=VALUES(mensaje_default),
  icono_default=VALUES(icono_default),
  accion_destino=VALUES(accion_destino),
  ruta_default=VALUES(ruta_default),
  orden=VALUES(orden),
  activo=1;

COMMIT;

SELECT codigo_evento, prioridad_default, obligatoria, campana_default,
       push_default, ruta_default, activo
FROM notificacion_eventos
WHERE codigo_evento='ALMACEN_CIERRE_INCORRECTO_4H';
