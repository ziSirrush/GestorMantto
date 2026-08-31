-- Mantto Gestor · FIX Notificaciones criticas · 3 eventos
-- Fecha: 2026-08-17
-- Alcance: SOLO catalogo de las tres interacciones criticas ya existentes.
-- NO modifica notificacion_evento_roles ni define OBLIGATORIA/OPCIONAL por rol.
-- La politica por Rol Principal se administra desde Panel de Control > Notificaciones.

START TRANSACTION;

UPDATE notificacion_eventos
SET agrupacion = 'Operacion',
    modulo = 'Tickets',
    accion = 'NUEVA_FALLA_CRITICO',
    nombre_evento = 'Falla en Equipo Critico',
    descripcion = 'Nuevo ticket con responsabilidad BLT sobre un equipo que ya era critico antes del nuevo ticket.',
    prioridad_default = 'CRITICA',
    configurable = 1,
    obligatoria = 0,
    campana_default = 1,
    push_default = 1,
    correo_default = 0,
    titulo_default = 'Nueva falla en equipo critico',
    mensaje_default = 'Se genero una nueva falla BLT en un equipo critico.',
    icono_default = '💥',
    accion_destino = 'ABRIR_TICKET',
    ruta_default = NULL,
    orden = 20,
    activo = 1
WHERE codigo_evento = 'FALLA_EQUIPO_CRITICO';

UPDATE notificacion_eventos
SET agrupacion = 'Operacion',
    modulo = 'Tickets',
    accion = 'PERSONA_ATRAPADA',
    nombre_evento = 'Persona Atrapada',
    descripcion = 'Nuevo ticket clasificado por la regla vigente de persona atrapada.',
    prioridad_default = 'CRITICA',
    configurable = 1,
    obligatoria = 0,
    campana_default = 1,
    push_default = 1,
    correo_default = 0,
    titulo_default = 'Ticket de persona atrapada',
    mensaje_default = 'Se genero un ticket relacionado con una persona atrapada.',
    icono_default = '🚨',
    accion_destino = 'ABRIR_TICKET',
    ruta_default = NULL,
    orden = 30,
    activo = 1
WHERE codigo_evento = 'PERSONA_ATRAPADA';

UPDATE notificacion_eventos
SET agrupacion = 'Operacion',
    modulo = 'Equipos Criticos',
    accion = 'TRANSICION_CRITICO',
    nombre_evento = 'Nuevo Equipo Critico',
    descripcion = 'Equipo que transiciona a critico bajo la regla vigente de 3 fallas BLT en 35 dias.',
    prioridad_default = 'CRITICA',
    configurable = 1,
    obligatoria = 0,
    campana_default = 1,
    push_default = 1,
    correo_default = 0,
    titulo_default = 'Nuevo equipo critico',
    mensaje_default = 'Un equipo paso a condicion critica.',
    icono_default = '💥',
    accion_destino = 'ABRIR_TICKET',
    ruta_default = NULL,
    orden = 40,
    activo = 1
WHERE codigo_evento = 'NUEVO_EQUIPO_CRITICO';

COMMIT;

-- Verificacion de catalogo. Deben regresar exactamente estas tres interacciones.
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
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'NUEVO_EQUIPO_CRITICO'
)
ORDER BY orden, codigo_evento;

-- Solo lectura: confirma la configuracion que se haya realizado desde el modulo.
-- Este FIX NO inserta ni modifica filas aqui.
SELECT codigo_evento, id_rol, politica, activo
FROM notificacion_evento_roles
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA',
  'NUEVO_EQUIPO_CRITICO'
)
ORDER BY codigo_evento, id_rol;
