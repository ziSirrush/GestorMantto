'use strict';
// Dif del UPSERT efectivo de ns_tickets_pruebas: NULL entrante no borra el valor previo.
const {EVENTS}=require('./netsuite-tickets-notification.contract');
const GROUPS=Object.freeze([
  Object.freeze({eventCode:EVENTS.ESTATUS,fields:Object.freeze(['estado_ticket','estado','estatus_equipo_final','fecha_cierre'])}),
  Object.freeze({eventCode:EVENTS.PRIORIDAD,fields:Object.freeze(['prioridad'])}),
  Object.freeze({eventCode:EVENTS.RESPONSABILIDAD,fields:Object.freeze(['responsabilidad'])}),
  Object.freeze({eventCode:EVENTS.ASIGNACION,fields:Object.freeze(['tecnico','persona_que_atiende','blt_empleado','ejecutivo_call'])})
]);
const OBSERVED_FIELDS=Object.freeze([...new Set(GROUPS.flatMap(group=>group.fields))]);

function comparable_ns(value) {
  if (value==null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime())
    ? '' : value.toISOString().slice(0,19).replace('T',' ');
  return String(value).trim();
}
function classifyTicketChange_ns(before,incoming) {
  if (!incoming || !incoming.ticket || !incoming.id_interno) return null;
  const ticket=String(incoming.ticket).trim();
  const idInterno=String(incoming.id_interno).trim();
  if (!before) return {eventCode:EVENTS.CREADO,ticket,idInterno,fields:['ticket'],before:{},after:{ticket}};
  // El receptor escribe COALESCE(VALUES(columna), columna), nunca sobreescribe con NULL.
  const valueAfter=field => incoming[field]==null ? before[field] : incoming[field];
  for (const group of GROUPS) {
    const fields=group.fields.filter(field=>comparable_ns(before[field])!==comparable_ns(valueAfter(field)));
    if (!fields.length) continue;
    const previous={}, current={};
    for (const field of fields) {
      previous[field]=comparable_ns(before[field]);
      current[field]=comparable_ns(valueAfter(field));
    }
    return {eventCode:group.eventCode,ticket,idInterno,fields,before:previous,after:current};
  }
  return null;
}

module.exports={OBSERVED_FIELDS,GROUPS,comparable_ns,classifyTicketChange_ns};
