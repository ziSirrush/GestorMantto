'use strict';
// Alcance cerrado de diagnostico: solo ns_tickets_pruebas y usuario 4.
const NS_TICKETS_NOTIFY_USER_ID=4;
const EVENTS=Object.freeze({
  CREADO:'NS_TICKET_CREADO',
  ESTATUS:'NS_TICKET_ESTATUS_CAMBIADO',
  PRIORIDAD:'NS_TICKET_PRIORIDAD_CAMBIADA',
  ASIGNACION:'NS_TICKET_ASIGNACION_CAMBIADA',
  RESPONSABILIDAD:'NS_TICKET_RESPONSABILIDAD_CAMBIADA'
});
const EVENT_CODES=Object.freeze(Object.values(EVENTS));
const EVENT_CODE_SET=new Set(EVENT_CODES);
const isNsTicketNotificationEvent_gnral=(code)=>EVENT_CODE_SET.has(String(code||'').trim());
module.exports={NS_TICKETS_NOTIFY_USER_ID,EVENTS,EVENT_CODES,isNsTicketNotificationEvent_gnral};
