-- Mantto Gestor · APLICAR · EQUIPO_SALE_DE_CRITICO · Fase 1 V001
-- Registra SOLO el evento general. NO crea ni asigna relaciones Evento -> Rol.
-- La matriz se administra desde Panel de Control > Notificaciones.

START TRANSACTION;

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
  'EQUIPO_SALE_DE_CRITICO',
  'Operacion',
  'Equipos Criticos',
  'SALIDA_CRITICO',
  'Equipo deja de ser Critico',
  'Equipo que transiciona de critico a no critico al quedar por debajo de 3 fallas BLT en 35 dias como resultado de un cambio de Ticket.',
  'ALTA',
  1,
  0,
  1,
  1,
  0,
  'Equipo dejo de ser critico',
  'Un equipo dejo de cumplir la condicion critica de 3 fallas BLT en 35 dias.',
  '✅',
  'ABRIR_TICKET',
  NULL,
  50,
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
  updated_at = NOW();

COMMIT;

SELECT
  codigo_evento,
  agrupacion,
  modulo,
  nombre_evento,
  prioridad_default,
  campana_default,
  push_default,
  accion_destino,
  activo
FROM notificacion_eventos
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';
