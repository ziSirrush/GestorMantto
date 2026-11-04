'use strict';
// Observabilidad para el usuario 4, posterior al COMMIT de ns_tickets_pruebas.
// El motor central conserva deduplicacion, preferencias y canales.
const logger=require('../../shared/logger');
const {NS_TICKETS_NOTIFY_USER_ID,EVENTS,isNsTicketNotificationEvent_gnral}=
  require('./netsuite-tickets-notification.contract');

const LABELS=Object.freeze({
  estado_ticket:'Estado Ticket',estado:'Estado',estatus_equipo_final:'Estatus final del equipo',
  fecha_cierre:'Fecha de cierre',prioridad:'Prioridad',responsabilidad:'Responsabilidad',
  tecnico:'Tecnico',persona_que_atiende:'Persona que atiende',
  blt_empleado:'Empleado cierre',ejecutivo_call:'Ejecutivo Call Center'
});
const PRESENTATION=Object.freeze({
  [EVENTS.CREADO]:['Ticket NS creado','Se registro un ticket nuevo desde NetSuite.','ti ti-ticket'],
  [EVENTS.ESTATUS]:['Ticket NS: estatus cambiado','Cambio de estatus en NetSuite.','ti ti-refresh'],
  [EVENTS.PRIORIDAD]:['Ticket NS: prioridad cambiada','Cambio de prioridad en NetSuite.','ti ti-alert-circle'],
  [EVENTS.ASIGNACION]:['Ticket NS: asignacion cambiada','Cambio de asignacion en NetSuite.','ti ti-user'],
  [EVENTS.RESPONSABILIDAD]:['Ticket NS: responsabilidad cambiada','Cambio de responsabilidad en NetSuite.','ti ti-arrows-exchange']
});
function presentation_ns(change) {
  const [title,base,icon]=PRESENTATION[change.eventCode]||[];
  if (!title) return null;
  const ticket=String(change.ticket||'').slice(0,70);
  const details=(Array.isArray(change.fields)?change.fields:[])
    .filter(field=>field!=='ticket')
    .map(field=>{
      const old=String(change.before?.[field]||'Sin dato').slice(0,75);
      const now=String(change.after?.[field]||'Sin dato').slice(0,75);
      return `${LABELS[field]||field}: ${old} -> ${now}`;
    }).slice(0,3).join(' | ');
  return {title,message:`Ticket ${ticket}. ${base}${details?' '+details:''}`,icon};
}
async function publishTicketEvents_ns({loteId,eventos}={}) {
  const summary={evaluados:0,creados:0,omitidos:0,fallidos:0};
  for (const change of Array.isArray(eventos)?eventos:[]) {
    if (!isNsTicketNotificationEvent_gnral(change?.eventCode)) continue;
    const view=presentation_ns(change);
    if (!view) continue;
    summary.evaluados++;
    try {
      // Carga diferida: no inicializar Aiven durante require() del receptor NS.
      // Se requiere el motor central solo al emitir un evento real, post-COMMIT.
      const {emitBusinessEventSafe_gnral}=
        require('../../services/notifications/notification-business-emitter.service');
      const result=await emitBusinessEventSafe_gnral({
        codigoEvento:change.eventCode,
        destinatarios:[NS_TICKETS_NOTIFY_USER_ID],
        excludeActor:false,
        zonaOperativaNoAplica:true,
        titulo:view.title,
        mensaje:view.message,
        icono:view.icon,
        accion:'ABRIR_MODULO',
        ruta:'notifications',
        eventInstanceKey:`ns-tickets:${loteId}:${change.eventCode}:${change.idInterno}`,
        allowMissingEvent:true
      },{label:'NS_TICKETS_PRUEBAS_USER4'});
      if (!result?.ok) summary.fallidos++;
      else if (Number(result.created)>0) summary.creados+=Number(result.created);
      else summary.omitidos++;
    } catch (error) {
      summary.fallidos++;
      logger.error('[NS_TICKETS_NOTIFICATION_FAILED]',{
        loteId,ticket:change.ticket,codigo_evento:change.eventCode,
        error_code:error?.code||null,error:String(error?.message||error)
      });
    }
  }
  logger.info('[NS_TICKETS_NOTIFICATIONS]',{loteId,destinatario:NS_TICKETS_NOTIFY_USER_ID,...summary});
  return summary;
}
module.exports={publishTicketEvents_ns,presentation_ns};
