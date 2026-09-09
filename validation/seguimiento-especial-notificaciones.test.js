'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const state = {
  followers: [],
  followerError: null,
  visual: { codigo: 'SEGUIMIENTO_ESPECIAL', emoji: 'catalog-value' },
  inserted: []
};

const repositoryStub = {
  async withTransaction(work) { return work(repositoryStub); },
  async findEvent() {
    return {
      codigo_evento: 'EVENTO_NATIVO',
      nombre_evento: 'Evento nativo',
      titulo_default: 'Evento nativo',
      mensaje_default: 'Mensaje nativo',
      prioridad_default: 'ALTA',
      campana_default: 1,
      push_default: 1,
      matriz_roles_configurada: 1
    };
  },
  async findActiveVisualState() { return state.visual; },
  async listRecipientPolicyContext(_connection, { idUsuarios }) {
    return idUsuarios.map((id) => ({
      id_usuario: id,
      id_rol: 2,
      politica: 'OBLIGATORIA',
      configuracion_activa: 1,
      campana: 1,
      push: 1,
      silenciada: 0,
      zona_autorizada: 1,
      united_dominio_completo: 0
    }));
  },
  async insertNotifications(_connection, notifications) {
    state.inserted = notifications;
    return {
      affectedRows: notifications.length,
      insertedNotifications: notifications,
      duplicateNotifications: [],
      outcomes: notifications.map((notification, index) => ({
        notification,
        inserted: true,
        duplicate: false,
        insertId: index + 1
      }))
    };
  }
};

const followerStub = {
  VISUAL_CODE: 'SEGUIMIENTO_ESPECIAL',
  async resolveSeguimientoRecipients_uni() {
    if (state.followerError) throw state.followerError;
    return {
      applicable: true,
      context: { tipo: 'TICKET', ticket: '123456', numero_equipo: 'EQ-1', proyecto: 'P-1', zona_id: 7 },
      followers: state.followers,
      visual_codes: ['SEGUIMIENTO_ESPECIAL']
    };
  }
};

const loggerStub = { info() {}, warn() {}, error() {} };
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './notification.repository') return repositoryStub;
  if (request === './portafolio-seguimiento-especial-notifications_uni.service') return followerStub;
  if (request === '../../shared/logger') return loggerStub;
  return originalLoad.call(this, request, parent, isMain);
};

let notificationService;
try {
  notificationService = require('../backend/src/services/notifications/notification.service');
} finally {
  Module._load = originalLoad;
}

function reset() {
  state.followers = [];
  state.followerError = null;
  state.visual = { codigo: 'SEGUIMIENTO_ESPECIAL', emoji: 'catalog-value' };
  state.inserted = [];
}

function nativeInput(recipients) {
  return {
    codigoEvento: 'EVENTO_NATIVO',
    destinatarios: recipients,
    zonaOperativaId: 7,
    eventInstanceKey: 'evento-nativo:123456',
    titulo: 'Titulo nativo',
    mensaje: 'Mensaje nativo',
    contextoSeguimiento: {
      dominio: 'UNITED',
      tipo: 'TICKET',
      ticket: '123456',
      numero_equipo: 'EQ-1',
      proyecto: 'P-1',
      zona_id: 7
    }
  };
}

test('native + follow y follow-only se unen en una sola entrega por usuario', async () => {
  reset();
  state.followers = [
    { id_usuario: 10, origen_seguimiento: 'EQUIPO', autorizado: true },
    { id_usuario: 20, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }
  ];

  const result = await notificationService.emit(nativeInput([10, 30, 30]));
  assert.deepEqual(result.recipients.sort((a, b) => a - b), [10, 20, 30]);
  assert.equal(state.inserted.length, 3);
  assert.deepEqual(state.inserted.find((row) => row.id_usuario === 10).codigos_visuales, ['SEGUIMIENTO_ESPECIAL']);
  assert.deepEqual(state.inserted.find((row) => row.id_usuario === 20).codigos_visuales, ['SEGUIMIENTO_ESPECIAL']);
  assert.deepEqual(state.inserted.find((row) => row.id_usuario === 30).codigos_visuales, []);
  assert.equal(new Set(state.inserted.map((row) => row.clave_deduplicacion)).size, 1);
  assert.equal(result.seguimiento_especial.deduped_count, 1);
});

test('follow-only puede producir el mismo evento nativo sin destinatario normal', async () => {
  reset();
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }];
  const result = await notificationService.emit(nativeInput([]));
  assert.deepEqual(result.recipients, [20]);
  assert.equal(state.inserted[0].tipo_notificacion, 'EVENTO_NATIVO');
  assert.deepEqual(state.inserted[0].codigos_visuales, ['SEGUIMIENTO_ESPECIAL']);
});

test('el actor excluido no revive por Seguimiento Especial', async () => {
  reset();
  state.followers = [{ id_usuario: 10, origen_seguimiento: 'EQUIPO', autorizado: true }];
  const result = await notificationService.emit({ ...nativeInput([10]), actorUserId: 10 });
  assert.equal(result.created, 0);
  assert.equal(result.reason, 'ACTOR_EXCLUIDO');
  assert.equal(state.inserted.length, 0);
});

test('falla de catalogo conserva follower y notificacion nativa sin decoracion', async () => {
  reset();
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }];
  state.visual = null;
  const result = await notificationService.emit(nativeInput([]));
  assert.deepEqual(result.recipients, [20]);
  assert.deepEqual(state.inserted[0].codigos_visuales, []);
  assert.equal(result.seguimiento_especial.catalog_lookup_status, 'NO_ENCONTRADO_O_INACTIVO');
});

test('falla del resolver conserva intactos los destinatarios nativos', async () => {
  reset();
  state.followerError = Object.assign(new Error('resolver unavailable'), { code: 'TEST_RESOLVER_ERROR' });
  const result = await notificationService.emit(nativeInput([30]));
  assert.deepEqual(result.recipients, [30]);
  assert.deepEqual(state.inserted[0].codigos_visuales, []);
  assert.equal(result.seguimiento_especial.error_code, 'TEST_RESOLVER_ERROR');
});

test('Inbox expone codigos semanticos y no propiedades visuales duplicadas', () => {
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './notificaciones.repository') return {};
    if (request === '../../services/notifications/notification.service') return {};
    return original.call(this, request, parent, isMain);
  };
  let service;
  try {
    service = require('../backend/src/modules/notificaciones/notificaciones.service');
  } finally {
    Module._load = original;
  }
  const row = service.toInboxNotification_gnral({
    id_notificacion: 1,
    codigos_visuales_json: '["SEGUIMIENTO_ESPECIAL","SEGUIMIENTO_ESPECIAL"]'
  });
  assert.deepEqual(row.codigos_visuales, ['SEGUIMIENTO_ESPECIAL']);
  assert.equal('codigos_visuales_json' in row, false);
  assert.equal('emoji_seguimiento' in row, false);
});

test('Push resuelve la presentacion desde el catalogo recibido por destinatario', () => {
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../modules/push-notifications/push-notifications.repository') return {};
    if (request === '../modules/push-notifications/push-notifications.sender') {
      return {
        getVapidConfig() { return {}; },
        validateVapidConfig() { return { ok: false, reason: 'test' }; },
        async sendPush() { return { ok: true }; }
      };
    }
    if (request === '../shared/logger') return loggerStub;
    return original.call(this, request, parent, isMain);
  };
  let job;
  try {
    job = require('../backend/src/jobs/pushNotifications.job');
  } finally {
    Module._load = original;
  }
  const catalog = new Map([['SEGUIMIENTO_ESPECIAL', { emoji: 'CATALOG' }]]);
  const payload = job.payloadFor({
    id_notificacion: 9,
    titulo_notificacion: 'Titulo nativo',
    mensaje_notificacion: 'Mensaje nativo',
    prioridad_notificacion: 'ALTA',
    codigos_visuales_json: '["SEGUIMIENTO_ESPECIAL"]'
  }, catalog);
  assert.equal(payload.title, '🟠 CATALOG Titulo nativo');
  assert.equal(payload.priority, 'ALTA');
});

test('falla al persistir metadata no revierte la notificacion nativa', async () => {
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return {};
    if (request === '../../shared/logger') return loggerStub;
    return original.call(this, request, parent, isMain);
  };
  let repository;
  try {
    repository = require('../backend/src/services/notifications/notification.repository');
  } finally {
    Module._load = original;
  }
  const connection = {
    async query(sql) {
      if (/INSERT INTO sup_notificaciones/i.test(String(sql)) && /codigos_visuales_json/i.test(String(sql))) {
        throw Object.assign(new Error('column missing'), { code: 'ER_BAD_FIELD_ERROR' });
      }
      if (/INSERT INTO sup_notificaciones/i.test(String(sql))) {
        return [{ affectedRows: 1, insertId: 77 }];
      }
      throw new Error(`consulta inesperada: ${sql}`);
    }
  };
  const result = await repository.insertNotification(connection, {
    id_usuario: 20,
    tipo_notificacion: 'EVENTO_NATIVO',
    titulo_notificacion: 'Titulo',
    mensaje_notificacion: 'Mensaje',
    accion_notificacion: 'ABRIR_TICKET',
    codigos_visuales: ['SEGUIMIENTO_ESPECIAL']
  });
  assert.equal(result.inserted, true);
  assert.equal(result.insertId, 77);
  assert.equal(result.visualMetadataPersisted, false);
  assert.equal(result.visualMetadataError, 'ER_BAD_FIELD_ERROR');
});

test('no queda fanout generico desde usuario_interacciones ni visual hardcodeado en notificaciones', () => {
  const interactions = read('backend/src/services/interactions/interactions.repository.js');
  const followResolver = read('backend/src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service.js');
  const notificationEngine = read('backend/src/services/notifications/notification.service.js');
  assert.doesNotMatch(interactions, /processInteraction_uni/);
  assert.doesNotMatch(followResolver, /PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACTUALIZACION/);
  assert.doesNotMatch(notificationEngine, /⭐/);
  assert.doesNotMatch(followResolver, /⭐/);
});

test('sync de Portafolio distingue ingreso, salida y cambio sin alterar prioridades', () => {
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return {};
    if (request === '../../shared/logger') return loggerStub;
    if (request === './notification-business-emitter.service') return { emitBusinessEventSafe_gnral() {} };
    if (request === './portafolio-seguimiento-especial-notifications_uni.service') {
      return { resolveSeguimientoRecipients_uni() {} };
    }
    return original.call(this, request, parent, isMain);
  };
  let service;
  try {
    service = require('../backend/src/services/notifications/portafolio-native-notifications_uni.service');
  } finally {
    Module._load = original;
  }
  const active = { id_portafolio: 1, numero_equipo: 'EQ-1', proyecto: 'P-1', zona_id: 7, estado_registro: 1, inactivo: null };
  assert.equal(service.classifyTransition(null, active), 'ENTRY');
  assert.equal(service.classifyTransition(active, { ...active, estado_registro: 0 }), 'EXIT');
  assert.equal(service.classifyTransition(active, { ...active, proyecto: 'P-2' }), 'CHANGE');
  assert.equal(service.classifyTransition(active, { ...active }), null);
});

test('sync de Tickets clasifica una sola transicion nativa con precedencia estable', () => {
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return {};
    if (request === '../../shared/logger') return loggerStub;
    if (request === './notification-business-emitter.service') {
      return { emitBusinessEventSafe_gnral() {} };
    }
    return original.call(this, request, parent, isMain);
  };
  let service;
  try {
    service = require('../backend/src/services/notifications/ticket-critical-notifications_uni.service');
  } finally {
    Module._load = original;
  }

  const base = {
    id: 11,
    ticket: 'T-11',
    estado_ticket: 'ABIERTO',
    prioridad: 'MEDIA',
    responsabilidad: 'CLIENTE',
    tecnico: 'A'
  };
  assert.equal(service.nativeTicketTransition_uni(null, base).eventCode, 'TICKET_CREADO');
  assert.equal(service.nativeTicketTransition_uni(base, { ...base, estado_ticket: 'CERRADO', prioridad: 'ALTA' }).eventCode, 'TICKET_ESTATUS_CAMBIADO');
  assert.equal(service.nativeTicketTransition_uni(base, { ...base, prioridad: 'ALTA' }).eventCode, 'TICKET_PRIORIDAD_CAMBIADA');
  assert.equal(service.nativeTicketTransition_uni(base, { ...base, responsabilidad: 'BLT' }).eventCode, 'TICKET_RESPONSABILIDAD_CAMBIADA');
  assert.equal(service.nativeTicketTransition_uni(base, { ...base, tecnico: 'B' }).eventCode, 'TICKET_ASIGNACION_CAMBIADA');
  assert.equal(service.nativeTicketTransition_uni(base, { ...base }), null);
  assert.equal(
    service.ticketTransitionIdentity_uni(base, { ...base, prioridad: 'ALTA' }, service.nativeTicketTransition_uni(base, { ...base, prioridad: 'ALTA' })),
    service.ticketTransitionIdentity_uni(base, { ...base, prioridad: 'ALTA' }, service.nativeTicketTransition_uni(base, { ...base, prioridad: 'ALTA' }))
  );
});

test('la herencia de proyecto respeta override directo aunque este inactivo', () => {
  const resolver = read('backend/src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service.js');
  assert.match(resolver, /NOT EXISTS\s*\(\s*SELECT 1\s*FROM portafolio_interes direct_override/is);
  assert.doesNotMatch(resolver, /direct_override[\s\S]{0,180}activo\s*=\s*1/i);
});

test('SQL es condicional y registra eventos nativos sin reactivar el fanout generico', () => {
  const migration = read('sql/20260909_FIX_SEGUIMIENTO_ESPECIAL_CAPA_NOTIFICACIONES_V001.sql');
  assert.match(migration, /INFORMATION_SCHEMA\.COLUMNS/);
  assert.match(migration, /TICKET_CREADO/);
  assert.match(migration, /PORTAFOLIO_EQUIPO_SALIDA/);
  assert.match(migration, /tickets\.comentario\.creado/);
  assert.doesNotMatch(migration, /UPDATE\s+notificacion_eventos[\s\S]*PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACTUALIZACION/i);
});
