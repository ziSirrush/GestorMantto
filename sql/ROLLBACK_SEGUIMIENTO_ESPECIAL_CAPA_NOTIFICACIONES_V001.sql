-- Rollback operativo de solo catalogo para ejecutar UNICAMENTE con autorizacion.
-- Antes de ejecutarlo se debe desplegar codigo que ya no escriba/lea la metadata.
-- No borra notificaciones historicas, auditoria ni portafolio_interes.
USE mydb;

UPDATE notificacion_eventos
SET activo = 0,
    updated_at = NOW()
WHERE codigo_evento IN (
  'PORTAFOLIO_EQUIPO_INGRESO',
  'PORTAFOLIO_EQUIPO_SALIDA',
  'PORTAFOLIO_EQUIPO_CAMBIO',
  'TICKET_CREADO',
  'TICKET_ESTATUS_CAMBIADO',
  'TICKET_PRIORIDAD_CAMBIADA',
  'TICKET_ASIGNACION_CAMBIADA',
  'TICKET_RESPONSABILIDAD_CAMBIADA'
);

-- La columna codigos_visuales_json NO se elimina aqui. Su eliminacion debe ser
-- una operacion separada y autorizada, despues de confirmar que el codigo ya no
-- la consume y que las notificaciones nativas siguen funcionando.
