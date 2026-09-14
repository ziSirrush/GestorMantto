'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function loadWithStubs(moduleRelativePath, stubs) {
  const modulePath = require.resolve(path.join(__dirname, '..', moduleRelativePath));
  delete require.cache[modulePath];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
}

const loggerStub = { info() {}, warn() {}, error() {} };

function loadTicketNotifications() {
  return loadWithStubs('backend/src/services/notifications/ticket-critical-notifications_uni.service.js', {
    '../../config/db': {},
    '../../shared/logger': loggerStub,
    '../../utils/temporal': { sqlMexicoCityToday() { return 'CURRENT_DATE()'; } },
    './notification-business-emitter.service': { async emitBusinessEventSafe_gnral() { return { created: 0 }; } }
  });
}

function loadTicketProducerHarness() {
  const emitted = [];
  const database = {
    async query(sql) {
      if (/FROM portafolio p/i.test(String(sql))) {
        return [[{
          total: 1,
          zonas_nulas: 0,
          zonas_distintas: 1,
          zona_id: 7
        }]];
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
  const service = loadWithStubs('backend/src/services/notifications/ticket-critical-notifications_uni.service.js', {
    '../../config/db': database,
    '../../shared/logger': loggerStub,
    '../../utils/temporal': { sqlMexicoCityToday() { return 'CURRENT_DATE()'; } },
    './notification-business-emitter.service': {
      async emitBusinessEventSafe_gnral(input) {
        emitted.push(input);
        return { ok: true, created: 0, skipped: 0, recipients: [] };
      }
    }
  });
  return { service, emitted };
}

function loadPortafolioNotifications() {
  return loadWithStubs('backend/src/services/notifications/portafolio-native-notifications_uni.service.js', {
    '../../config/db': {},
    '../../shared/logger': loggerStub,
    './notification-business-emitter.service': { async emitBusinessEventSafe_gnral() { return { created: 0 }; } },
    './portafolio-seguimiento-especial-notifications_uni.service': { async resolveSeguimientoRecipients_uni() { return { followers: [] }; } }
  });
}

test('Ticket INSERT conserva evento TICKET_CREADO y presenta Proyecto - Ref en sitio', () => {
  const service = loadTicketNotifications();
  const after = {
    id: 901,
    ticket: '254027',
    codigo_equipo: '11061-MEX-ELE-BLT',
    proyecto: 'Neuchatel',
    referencia_en_zona_operativa: 'Equipo',
    estado_ticket: 'Abierto'
  };

  const transition = service.nativeTicketTransition_uni(null, after);
  const presentation = service.ticketTransitionPresentation_uni(transition, null, after);

  assert.equal(transition.eventCode, 'TICKET_CREADO');
  assert.equal(presentation.title, 'Ticket generado');
  assert.equal(presentation.icon, '🎫');
  assert.equal(presentation.message, 'Se generó ticket 254027 · Neuchatel - Equipo.');
  assert.doesNotMatch(presentation.title + ' ' + presentation.message, /11061-MEX-ELE-BLT/);
});

test('Ticket entra a Cerrado una sola vez y el evento incluye Estatus Final del Equipo', () => {
  const service = loadTicketNotifications();
  const before = {
    id: 901,
    ticket: '254027',
    proyecto: 'Neuchatel',
    referencia_en_zona_operativa: 'Equipo',
    estado_ticket: 'En Proceso',
    estatus_equipo_final: 'No Funcionando'
  };
  const after = {
    ...before,
    estado_ticket: 'Cerrado',
    estatus_equipo_final: 'Funcionando',
    fecha_cierre: '2026-09-14'
  };

  const transition = service.nativeTicketTransition_uni(before, after);
  const presentation = service.ticketTransitionPresentation_uni(transition, before, after);

  assert.equal(transition.eventCode, 'TICKET_ESTATUS_CAMBIADO');
  assert.equal(service.isClosedTicketStatus_uni(before.estado_ticket), false);
  assert.equal(service.isClosedTicketStatus_uni(after.estado_ticket), true);
  assert.equal(presentation.title, 'Ticket cerrado');
  assert.equal(presentation.icon, '✅');
  assert.equal(
    presentation.message,
    'Se generó cierre del ticket 254027 · Neuchatel - Equipo. Estatus Final del Equipo: Funcionando.'
  );
});

test('Update posterior de Ticket ya Cerrado no vuelve a anunciar Ticket cerrado', () => {
  const service = loadTicketNotifications();
  const before = {
    id: 901,
    ticket: '254027',
    proyecto: 'Neuchatel',
    referencia_en_zona_operativa: 'Equipo',
    estado_ticket: 'Cerrado',
    estatus_equipo_final: 'No Funcionando'
  };
  const after = { ...before, estatus_equipo_final: 'Funcionando' };
  const transition = service.nativeTicketTransition_uni(before, after);
  const presentation = service.ticketTransitionPresentation_uni(transition, before, after);

  assert.equal(transition.eventCode, 'TICKET_ESTATUS_CAMBIADO');
  assert.doesNotMatch(presentation.title, /^Ticket cerrado/i);
  assert.match(presentation.title, /Estatus Final del Equipo/i);
  assert.equal(presentation.icon, '🔄');
  assert.match(presentation.message, /No Funcionando a Funcionando/);
});

test('Portafolio En Servicio -> No en Servicio genera PORTAFOLIO_EQUIPO_CAMBIO explicito', () => {
  const service = loadPortafolioNotifications();
  const before = {
    id_portafolio: 55,
    numero_equipo: 'EQ-55',
    proyecto: 'Proyecto Norte',
    identificacion_sitio: 'Lobby',
    zona_id: 7,
    estado_registro: 1,
    inactivo: null,
    estatus_servicio: 'En Servicio'
  };
  const after = { ...before, estatus_servicio: 'No en Servicio' };
  const fields = service.changedFields(before, after);
  const transition = service.classifyTransition(before, after);
  const presentation = service.eventPresentation(transition, before, after, fields);

  assert.equal(transition, 'CHANGE');
  assert.deepEqual(fields, ['estatus_servicio']);
  assert.equal(presentation.eventCode, 'PORTAFOLIO_EQUIPO_CAMBIO');
  assert.equal(presentation.title, 'Equipo No en Servicio');
  assert.equal(presentation.icon, '⛔');
  assert.equal(presentation.message, 'Se generó cambio de estatus de servicio de En Servicio a No en Servicio · Proyecto Norte - Lobby.');
  assert.doesNotMatch(presentation.title + ' ' + presentation.message, /EQ-55/);
});

test('Portafolio No en Servicio -> En Servicio genera el mismo evento nativo y mensaje inverso', () => {
  const service = loadPortafolioNotifications();
  const before = {
    id_portafolio: 55,
    numero_equipo: 'EQ-55',
    proyecto: 'Proyecto Norte',
    identificacion_sitio: 'Lobby',
    zona_id: 7,
    estado_registro: 1,
    inactivo: null,
    estatus_servicio: 'No en Servicio'
  };
  const after = { ...before, estatus_servicio: 'En Servicio' };
  const fields = service.changedFields(before, after);
  const presentation = service.eventPresentation('CHANGE', before, after, fields);

  assert.equal(presentation.eventCode, 'PORTAFOLIO_EQUIPO_CAMBIO');
  assert.equal(presentation.title, 'Equipo en Servicio');
  assert.equal(presentation.icon, '✅');
  assert.equal(presentation.message, 'Se generó cambio de estatus de servicio de No en Servicio a En Servicio · Proyecto Norte - Lobby.');
});

test('Comentario y Vo.Bo. de Ticket conservan eventos nativos y contexto UNITED de Seguimiento', () => {
  const writes = read('backend/src/modules/tickets/tickets-notification-writes.service.js');

  assert.match(writes, /const EVENT_TICKET_COMMENT = 'tickets\.comentario\.creado'/);
  assert.match(writes, /const EVENT_TICKET_VOBO = 'tickets\.vobo\.actualizado'/);
  assert.match(writes, /contextoSeguimiento:\s*\{/);
  assert.match(writes, /dominio:\s*'UNITED'/);
  assert.match(writes, /tipo:\s*'TICKET'/);
  assert.match(writes, /numero_equipo:/);
  assert.match(writes, /proyecto:/);
  assert.match(writes, /zona_id:\s*zoneId/);
  assert.match(writes, /eventInstanceKey:\s*`ticket-comentario:/);
  assert.match(writes, /eventInstanceKey:\s*`ticket-vobo:/);
  assert.match(writes, /title:\s*'Comentario en Ticket'/);
  assert.match(writes, /Se generó comentario en ticket/);
  assert.match(writes, /title:\s*'Vo\.Bo\. de Ticket actualizado'/);
  assert.match(writes, /Se generó actualización de Vo\.Bo\. del ticket/);
  assert.match(writes, /destinatarios:\s*candidateIds/);
});

test('productor de Tickets envia cero candidatos nativos para los cinco eventos follow-only', async () => {
  const { service, emitted } = loadTicketProducerHarness();
  const activeUserIds = [10, 20, 30];
  const ticketRow = {
    id: 901,
    ticket: '254013',
    codigo_equipo: '13198-CMX-ELE-KON',
    proyecto: 'Neuchatel 7'
  };

  for (const eventCode of service.FOLLOW_ONLY_TICKET_EVENTS_UNI) {
    await service.emitTicketEvent_uni({
      eventCode,
      ticketRow,
      actorUserId: 10,
      title: 'Prueba follow-only',
      message: 'Prueba follow-only',
      icon: '⭐',
      activeUserIds,
      eventInstanceKey: `test-follow-only:${eventCode}:901`
    });
  }

  assert.equal(emitted.length, 5);
  assert.equal(emitted.every((item) => item.destinatarios.length === 0), true);
  assert.equal(emitted.every((item) => item.requireRoleMatrix === true), true);
});

test('productor conserva candidatos nativos para criticos y Persona Atrapada', async () => {
  const { service, emitted } = loadTicketProducerHarness();
  const activeUserIds = [10, 20, 30];
  const ticketRow = {
    id: 902,
    ticket: '254014',
    codigo_equipo: '13198-CMX-ELE-KON',
    proyecto: 'Neuchatel 7'
  };
  const nativeEvents = [
    'FALLA_EQUIPO_CRITICO',
    'NUEVO_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA',
    'PERSONA_ATRAPADA_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
  ];

  for (const eventCode of nativeEvents) {
    await service.emitTicketEvent_uni({
      eventCode,
      ticketRow,
      actorUserId: 10,
      title: 'Prueba evento nativo',
      message: 'Prueba evento nativo',
      icon: '🚨',
      activeUserIds,
      eventInstanceKey: `test-native:${eventCode}:902`
    });
  }

  assert.equal(emitted.length, nativeEvents.length);
  assert.equal(
    emitted.every((item) => JSON.stringify(item.destinatarios) === JSON.stringify(activeUserIds)),
    true
  );
});

test('Todos los productores UNITED actuales Proyecto/Equipo entregan contexto Seguimiento', () => {
  const tickets = read('backend/src/services/notifications/ticket-critical-notifications_uni.service.js');
  const portafolio = read('backend/src/services/notifications/portafolio-native-notifications_uni.service.js');
  const writes = read('backend/src/modules/tickets/tickets-notification-writes.service.js');

  for (const code of [
    'TICKET_CREADO',
    'TICKET_ESTATUS_CAMBIADO',
    'TICKET_PRIORIDAD_CAMBIADA',
    'TICKET_ASIGNACION_CAMBIADA',
    'TICKET_RESPONSABILIDAD_CAMBIADA',
    'FALLA_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA',
    'NUEVO_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
  ]) {
    assert.match(tickets, new RegExp(`['\"]${code}['\"]`));
  }
  assert.match(tickets, /contextoSeguimiento:\s*\{/);

  for (const code of [
    'PORTAFOLIO_EQUIPO_INGRESO',
    'PORTAFOLIO_EQUIPO_SALIDA',
    'PORTAFOLIO_EQUIPO_CAMBIO'
  ]) {
    assert.match(portafolio, new RegExp(`['\"]${code}['\"]`));
  }
  assert.match(portafolio, /contextoSeguimiento:\s*context/);
  assert.match(writes, /contextoSeguimiento:\s*\{/);
});

test('Campana y Push reconocen metadata SEGUIMIENTO_ESPECIAL sin exigir rol nativo', () => {
  const policy = require('../backend/src/services/notifications/notification-policy');
  const bell = policy.bellVisibilitySql_gnral('n', 'e', 'p');
  const push = policy.pushVisibilitySql_gnral('n', 'e', 'p');

  for (const sql of [bell, push]) {
    assert.match(sql, /codigos_visuales_json/);
    assert.match(sql, /SEGUIMIENTO_ESPECIAL/);
    assert.match(sql, /JSON_CONTAINS/);
  }
  assert.doesNotMatch(bell + push, /⭐/);
  assert.equal(policy.SEGUIMIENTO_VISUAL_CODE_GNRAL, 'SEGUIMIENTO_ESPECIAL');
});

test('Push UNITED presenta Emoji + Evento y deja Seguimiento Especial como estrella semantica', () => {
  const job = loadWithStubs('backend/src/jobs/pushNotifications.job.js', {
    '../modules/push-notifications/push-notifications.repository': {},
    '../modules/push-notifications/push-notifications.sender': {
      getVapidConfig() { return {}; },
      validateVapidConfig() { return { ok: false, reason: 'test' }; },
      async sendPush() { return { ok: true }; }
    },
    '../shared/logger': loggerStub
  });
  const catalog = new Map([['SEGUIMIENTO_ESPECIAL', { emoji: '⭐' }]]);
  const payload = job.payloadFor({
    id_notificacion: 901,
    tipo_notificacion: 'TICKET_CREADO',
    titulo_notificacion: 'Ticket generado',
    mensaje_notificacion: 'Se generó ticket 254013 · Neuchatel 7 - Elevador 4 EE-04.',
    icono_notificacion: '🎫',
    prioridad_notificacion: 'MEDIA',
    codigos_visuales_json: '["SEGUIMIENTO_ESPECIAL"]'
  }, catalog);

  assert.equal(payload.title, '🎫 Ticket generado ⭐');
  assert.equal(payload.body, 'Se generó ticket 254013 · Neuchatel 7 - Elevador 4 EE-04.');
  assert.doesNotMatch(payload.title, /🟡|ti ti-ticket/);

  const cssIconPayload = job.payloadFor({
    id_notificacion: 902,
    tipo_notificacion: 'TICKET_CREADO',
    titulo_notificacion: 'Ticket generado',
    mensaje_notificacion: 'Prueba',
    icono_notificacion: 'ti ti-ticket',
    prioridad_notificacion: 'MEDIA',
    codigos_visuales_json: '["SEGUIMIENTO_ESPECIAL"]'
  }, catalog);
  assert.equal(cssIconPayload.title, 'Ticket generado ⭐');
});

test('La metadata semantica de Seguimiento se persiste aunque el lookup visual falle temporalmente', () => {
  const engine = read('backend/src/services/notifications/notification.service.js');
  assert.match(engine, /const decoratedIds = new Set\(followerIds\)/);
  assert.match(engine, /catalog_lookup_status/);
  assert.doesNotMatch(engine, /if \(visual\) followerIds\.forEach/);
});
