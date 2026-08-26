'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const businessEmitter = read('backend/src/services/notifications/notification-business-emitter.service.js');
const ticketWrites = read('backend/src/modules/tickets/tickets-notification-writes.service.js');
const ticketRepository = read('backend/src/modules/tickets/tickets.repository.js');
const tasks = read('backend/src/modules/pendientes/pendientes.service.js');
const support = read('backend/src/services/support-solicitudes.service.js');
const sql = read('backend/sql/20260825_VERIFICAR_NOTIFICACIONES_FASE_2_EMISORES.sql');

const legacyPatterns = [
  /['"]TAREA_ASIGNADA['"]/, /['"]TAREA_COMENTARIO['"]/,
  /['"]TICKET_VALIDACION['"]/, /['"]TICKET_VALIDACION_PENDIENTE['"]/,
  /['"]SOPORTE_ARCHIVO['"]/, /['"]SOPORTE_ESTADO['"]/, /['"]SOPORTE_PRIORIDAD['"]/,
  /['"]SOPORTE_ASIGNACION['"]/, /['"]SOPORTE_REASIGNACION['"]/,
  /['"]SOPORTE_SOLICITUD_ACTUALIZADA['"]/, /['"]SOLICITUD_SOPORTE['"]/
];

test('Fase 2 usa exactamente los cinco codigos oficiales previstos', () => {
  assert.match(tasks, /'tareas\.asignada'/);
  assert.match(tasks, /'tareas\.comentario\.creado'/);
  assert.match(ticketWrites, /'tickets\.comentario\.creado'/);
  assert.match(ticketWrites, /'tickets\.vobo\.actualizado'/);
  assert.match(support, /'soporte\.solicitud\.actualizada'/);
});

test('Tareas no emite codigos legacy ni COMENTARIO generico', () => {
  for (const pattern of legacyPatterns) assert.doesNotMatch(tasks, pattern);
  assert.doesNotMatch(tasks, /codigoEvento\s*:\s*['"]COMENTARIO['"]/);
  assert.doesNotMatch(tasks, /insertLegacyCommentNotification_gnral\s*\(/);
  assert.doesNotMatch(tasks, /insertTaskAssignmentNotification_gnral\s*\(/);
});

test('Tickets no emite validaciones legacy ni COMENTARIO generico', () => {
  for (const pattern of legacyPatterns) assert.doesNotMatch(ticketWrites, pattern);
  assert.doesNotMatch(ticketWrites, /codigoEvento\s*:\s*['"]COMENTARIO['"]/);
  assert.doesNotMatch(ticketWrites, /INSERT\s+INTO\s+sup_notificaciones/i);
});

test('Soporte deja de escribir directamente sup_notificaciones', () => {
  for (const pattern of legacyPatterns) assert.doesNotMatch(support, pattern);
  assert.doesNotMatch(support, /codigoEvento\s*:\s*['"]COMENTARIO['"]/);
  assert.doesNotMatch(support, /INSERT\s+INTO\s+sup_notificaciones/i);
});

test('Tareas emite asignacion despues del commit de negocio', () => {
  const createStart = tasks.indexOf('async function createPendiente(req)');
  const updateStart = tasks.indexOf('async function updatePendiente(req)');
  const createBody = tasks.slice(createStart, updateStart);
  assert.ok(createBody.indexOf('await conn.commit();') < createBody.indexOf('createTaskAssignmentNotifications_gnral(\n    db'));

  const priorityStart = tasks.indexOf('async function updatePendientePrioridad(req)');
  const updateBody = tasks.slice(updateStart, priorityStart);
  assert.ok(updateBody.indexOf('await conn.commit();') < updateBody.indexOf('createTaskAssignmentNotifications_gnral(\n    db'));
});

test('Comentario de Tarea se confirma antes de emitir su notificacion', () => {
  const start = tasks.indexOf('async function createPendienteComentario(req)');
  const end = tasks.indexOf('async function updatePendienteSubtarea(req)');
  const body = tasks.slice(start, end);
  assert.ok(body.indexOf('await conn.commit();') < body.indexOf('createPendienteCommentNotifications_gnral(db'));
});

test('Tareas usa identidad persistente por relacion y por comentario', () => {
  assert.match(tasks, /id_pendiente_usuario/);
  assert.match(tasks, /eventInstanceKey:\s*`tarea-asignacion:\$\{idPendiente\}:\$\{relationId\}`/);
  assert.match(tasks, /eventInstanceKey:\s*`tarea-comentario:\$\{idComentario\}`/);
});

test('Tickets enruta comentario y VoBo al nuevo modulo sin tocar otros handlers', () => {
  assert.match(ticketRepository, /createTicketComentario:\s*ticketNotificationWrites\.createTicketComentario/);
  assert.match(ticketRepository, /saveTicketValidacion:\s*ticketNotificationWrites\.saveTicketValidacion/);
  assert.match(ticketRepository, /saveTicketVobo:\s*ticketNotificationWrites\.saveTicketVobo/);
  assert.match(ticketRepository, /getTicketInteracciones:\s*legacyController\.getTicketInteracciones/);
  assert.match(ticketRepository, /syncTickets:\s*legacyController\.syncTickets/);
});

test('Tickets confirma comentario y VoBo antes de notificar', () => {
  const commentStart = ticketWrites.indexOf('async function createTicketComentario');
  const voboStart = ticketWrites.indexOf('async function saveTicketValidacion');
  const commentBody = ticketWrites.slice(commentStart, voboStart);
  assert.ok(commentBody.indexOf('await conn.commit();') < commentBody.indexOf('emitTicketEvent_gnral({'));

  const voboEnd = ticketWrites.indexOf('async function saveTicketVobo');
  const voboBody = ticketWrites.slice(voboStart, voboEnd);
  assert.ok(voboBody.indexOf('await conn.commit();') < voboBody.indexOf('emitTicketEvent_gnral({'));
});

test('Tickets mantiene reglas actuales de validacion y reversa', () => {
  assert.match(ticketWrites, /role\.includes\('supervisor'\)/);
  assert.match(ticketWrites, /role\.includes\('superintendente'\)/);
  assert.match(ticketWrites, /role\.includes\('director general'\)/);
  assert.match(ticketWrites, /role\.includes\('programador'\)/);
  assert.match(ticketWrites, /reverting\s*&&\s*!ticketCanRevert_gnral/);
});

test('Tickets usa identidad persistente de id_comentario e id_validacion', () => {
  assert.match(ticketWrites, /eventInstanceKey:\s*`ticket-comentario:\$\{row\.id\}:\$\{commentId\}`/);
  assert.match(ticketWrites, /eventInstanceKey:\s*`ticket-vobo:\$\{row\.id\}:\$\{validationId\}`/);
});

test('Alcance de Ticket no usa tickets.zona para conceder acceso', () => {
  const zoneStart = ticketWrites.indexOf('async function resolveTicketZoneId_gnral');
  const zoneEnd = ticketWrites.indexOf('async function emitTicketEvent_gnral');
  const zoneBody = ticketWrites.slice(zoneStart, zoneEnd);
  assert.match(zoneBody, /zona_id/);
  assert.doesNotMatch(zoneBody, /ticketRow\.zona/);
  assert.match(zoneBody, /codigo_equipo/);
  assert.match(zoneBody, /proyecto_padre/);
});

test('Soporte consolida cambios de una accion en una sola emision logica', () => {
  const start = support.indexOf('async function notifyTicketChanges');
  const end = support.indexOf('async function notifyRequesterUpdate');
  const body = support.slice(start, end);
  const emissions = (body.match(/emitSupportEvent_gnral\s*\(/g) || []).length;
  assert.equal(emissions, 1);
  assert.match(body, /const recipients = new Set\(\)/);
  assert.match(body, /const changes = \[\]/);
});

test('Soporte obtiene identidad estable desde historial real', () => {
  assert.match(support, /latestSupportActionIdentity_gnral/);
  assert.match(support, /last\s*&&\s*last\.accion/);
  assert.match(support, /last\s*&&\s*last\.fecha/);
  assert.match(support, /last\s*&&\s*last\.id_adjunto/);
  assert.match(support, /soporte-solicitud-creada:\$\{ticketId\}/);
});

test('Emisor de negocio exige codigo e identidad y nunca propaga fallo de Notificaciones', () => {
  assert.match(businessEmitter, /CODIGO_EVENTO_NO_DECLARADO/);
  assert.match(businessEmitter, /IDENTIDAD_EVENTO_NO_DECLARADA/);
  assert.match(businessEmitter, /ERROR_EMISION_NOTIFICACION/);
  assert.match(businessEmitter, /try\s*\{[\s\S]*notificationService\.emit/);
  assert.match(businessEmitter, /catch\s*\(error\)/);
});

test('SQL de verificacion cubre catalogo, matriz activa y prerrequisitos de Fase 1', () => {
  for (const code of [
    'tareas.asignada',
    'tareas.comentario.creado',
    'tickets.comentario.creado',
    'tickets.vobo.actualizado',
    'soporte.solicitud.actualizada'
  ]) assert.match(sql, new RegExp(code.replaceAll('.', '\\.')));
  assert.match(sql, /ner\.activo\s*=\s*1/);
  assert.match(sql, /clave_deduplicacion/);
  assert.match(sql, /trace_id/);
});
