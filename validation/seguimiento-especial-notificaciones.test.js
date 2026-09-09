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

test('actor que entra solo por Follow sigue excluido cuando la politica nativa excluye actor', async () => {
  reset();
  state.followers = [{ id_usuario: 10, origen_seguimiento: 'EQUIPO', autorizado: true }];
  const result = await notificationService.emit({ ...nativeInput([]), actorUserId: 10 });
  assert.equal(result.created, 0);
  assert.equal(result.reason, 'ACTOR_EXCLUIDO');
  assert.equal(state.inserted.length, 0);
  assert.equal(result.seguimiento_especial.follow_native_excluded_count, 1);
});

test('Seguimiento no excluye al actor cuando el evento nativo no lo marco como excluido', async () => {
  reset();
  state.followers = [{ id_usuario: 10, origen_seguimiento: 'EQUIPO', autorizado: true }];
  const prepared = {
    input: nativeInput([]),
    codigoEvento: 'EVENTO_NATIVO',
    actorId: 10,
    candidateRecipients: [],
    recipients: [],
    normalRecipients: [],
    actorExcluded: false,
    nativeExcludedRecipientIds: new Set(),
    followRecipientIds: new Set(),
    decoratedFollowRecipientIds: new Set(),
    traceId: 'trace-actor-permitido',
    dedupKey: 'evento-nativo:123456'
  };

  await notificationService.applySeguimientoLayer_gnral(repositoryStub, prepared);
  assert.deepEqual(prepared.recipients, [10]);
  assert.equal(prepared.actorExcluded, false);
  assert.equal(prepared.seguimientoTrace.follow_native_excluded_count, 0);
  assert.equal(prepared.seguimientoTrace.follow_recipient_count, 1);
});

function loadActualResolverWithPermissions(permittedIds) {
  const modulePath = require.resolve('../backend/src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service');
  delete require.cache[modulePath];
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../permissions/effective-permission.service') {
      return {
        async listUsersWithEffectivePermission() {
          return permittedIds.slice();
        }
      };
    }
    return original.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = original;
    delete require.cache[modulePath];
  }
}

test('resolver conserva follower autorizado por permiso y no aplica exclusion propia del actor', async () => {
  const resolver = loadActualResolverWithPermissions([20]);
  const executor = {
    async query() {
      throw new Error('No debe consultar BD cuando existe snapshot completo de followers y contexto verificable.');
    }
  };

  const result = await resolver.resolveSeguimientoRecipients_uni({
    executor,
    contextoNegocio: {
      dominio: 'UNITED',
      tipo: 'PORTAFOLIO',
      proyecto: 'P-1',
      zona_id: 7,
      followers_snapshot: [
        { id_usuario: 20, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true },
        { id_usuario: 30, origen_seguimiento: 'EQUIPO', autorizado: true }
      ]
    },
    actorUserId: 20,
    codigoEventoNativo: 'PORTAFOLIO_EQUIPO_SALIDA'
  });

  assert.equal(result.applicable, true);
  assert.deepEqual(result.followers, [
    { id_usuario: 20, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }
  ]);
  assert.deepEqual(result.visual_codes, ['SEGUIMIENTO_ESPECIAL']);
  assert.equal(result.follow_candidate_count, 2);
  assert.equal(result.follow_authorized_count, 1);
});

test('permiso efectivo revocado elimina candidatos de Seguimiento', async () => {
  const resolver = loadActualResolverWithPermissions([]);
  const executor = {
    async query() {
      throw new Error('No debe consultar BD cuando existe snapshot completo.');
    }
  };

  const result = await resolver.resolveSeguimientoRecipients_uni({
    executor,
    contextoNegocio: {
      dominio: 'UNITED',
      tipo: 'PORTAFOLIO',
      proyecto: 'P-1',
      zona_id: 7,
      followers_snapshot: [{ id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }]
    },
    codigoEventoNativo: 'PORTAFOLIO_EQUIPO_CAMBIO'
  });

  assert.deepEqual(result.followers, []);
  assert.deepEqual(result.visual_codes, []);
  assert.equal(result.follow_candidate_count, 1);
  assert.equal(result.follow_authorized_count, 0);
});

test('resolver falla cerrado fuera de UNITED o sin zona verificable', async () => {
  const resolver = loadActualResolverWithPermissions([20]);
  let queryCount = 0;
  const executor = {
    async query() {
      queryCount += 1;
      return [[]];
    }
  };

  const otherDomain = await resolver.resolveSeguimientoRecipients_uni({
    executor,
    contextoNegocio: { dominio: 'CORELLIAN', tipo: 'PORTAFOLIO', proyecto: 'P-1', zona_id: 7 },
    codigoEventoNativo: 'EVENTO_OTRO_DOMINIO'
  });
  const noZone = await resolver.resolveSeguimientoRecipients_uni({
    executor,
    contextoNegocio: { dominio: 'UNITED', tipo: 'PORTAFOLIO', proyecto: 'P-1' },
    codigoEventoNativo: 'PORTAFOLIO_EQUIPO_CAMBIO'
  });

  assert.equal(otherDomain.applicable, false);
  assert.equal(noZone.applicable, false);
  assert.deepEqual(otherDomain.followers, []);
  assert.deepEqual(noZone.followers, []);
  assert.equal(queryCount, 0);
});

test('consulta de Equipo exige usuario activo y alcance UNITED maestro o PORTAFOLIO + ZOP', async () => {
  const resolver = loadActualResolverWithPermissions([]);
  let capturedSql = '';
  let capturedParams = null;
  const executor = {
    async query(sql, params) {
      capturedSql = String(sql);
      capturedParams = params;
      return [[]];
    }
  };

  const result = await resolver.recipientsForEquipment(executor, {
    id_portafolio: 55,
    numero_equipo: 'EQ-55',
    proyecto: 'Proyecto 55',
    zona_id: 7
  });

  assert.deepEqual(result, []);
  assert.deepEqual(capturedParams, [55, 'Proyecto 55', 55, 7, 7]);
  assert.match(capturedSql, /direct_follow\.id_portafolio\s*=\s*\?/i);
  assert.match(capturedSql, /direct_follow\.activo\s*=\s*1/i);
  assert.match(capturedSql, /project_follow\.origen\s*=\s*'PROYECTO'/i);
  assert.match(capturedSql, /u_interest\.estado\s*=\s*1/i);
  assert.match(capturedSql, /tipo_alcance\s*=\s*'DOMINIO_COMPLETO'/i);
  assert.match(capturedSql, /UPPER\(TRIM\(uai_se_master\.dominio\)\)\s*=\s*'UNITED'/i);
  assert.match(capturedSql, /pa_se\.codigo\s*=\s*'PORTAFOLIO'/i);
  assert.match(capturedSql, /FROM usuario_zop uz_se/i);
  assert.match(capturedSql, /uz_se\.estado\s*=\s*1/i);
});

test('Equipo sin zona no intenta ampliar alcance ni consultar seguidores', async () => {
  const resolver = loadActualResolverWithPermissions([20]);
  let queryCount = 0;
  const result = await resolver.recipientsForEquipment({
    async query() {
      queryCount += 1;
      return [[]];
    }
  }, {
    id_portafolio: 55,
    proyecto: 'P-1',
    zona_id: null
  });

  assert.deepEqual(result, []);
  assert.equal(queryCount, 0);
});

function loadPortafolioNativeHarness() {
  const modulePath = require.resolve('../backend/src/services/notifications/portafolio-native-notifications_uni.service');
  delete require.cache[modulePath];
  const emitted = [];
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return {};
    if (request === '../../shared/logger') return loggerStub;
    if (request === './notification-business-emitter.service') {
      return {
        async emitBusinessEventSafe_gnral(input) {
          emitted.push(input);
          return { ok: true, created: 1, skipped: 0, trace_id: 'trace-portafolio-test' };
        }
      };
    }
    if (request === './portafolio-seguimiento-especial-notifications_uni.service') {
      return {
        async resolveSeguimientoRecipients_uni() {
          return { followers: [] };
        }
      };
    }
    return original.call(this, request, parent, isMain);
  };

  try {
    return { service: require(modulePath), emitted };
  } finally {
    Module._load = original;
    delete require.cache[modulePath];
  }
}

test('salida de Portafolio conserva snapshot pre-mutation y followers previos', async () => {
  const { service, emitted } = loadPortafolioNativeHarness();
  const before = {
    id_portafolio: 55,
    numero_equipo: 'EQ-55',
    proyecto: 'Proyecto previo',
    zona_id: 7,
    estado_registro: 1,
    inactivo: null,
    estatus_servicio: 'ACTIVO'
  };
  const after = { ...before, estado_registro: 0 };
  const previousFollowers = [
    { id_usuario: 20, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }
  ];
  const beforeContext = {
    operationId: 'operacion-prueba-55',
    beforeByEquipment: new Map([
      ['EQ-55', { row: before, followers: previousFollowers }]
    ])
  };
  const executor = {
    async query(sql) {
      if (/FROM\s+portafolio/i.test(String(sql))) return [[after]];
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };

  const summary = await service.processAfterSync_uni(
    beforeContext,
    { rows: [{ numero_equipo: 'EQ-55' }] },
    null,
    executor
  );

  assert.equal(summary.events.length, 1);
  assert.equal(summary.events[0].codigo_evento, 'PORTAFOLIO_EQUIPO_SALIDA');
  assert.equal(summary.events[0].snapshot_pre_mutacion, true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].codigoEvento, 'PORTAFOLIO_EQUIPO_SALIDA');
  assert.deepEqual(emitted[0].destinatarios, []);
  assert.equal(emitted[0].contextoSeguimiento.proyecto, 'Proyecto previo');
  assert.equal(emitted[0].contextoSeguimiento.snapshot_pre_mutacion.proyecto, 'Proyecto previo');
  assert.deepEqual(emitted[0].contextoSeguimiento.followers_snapshot, previousFollowers);
});

test('comentario y VoBo de Ticket usan evento nativo con contexto Seguimiento; adjunto no se inventa', () => {
  const writes = read('backend/src/modules/tickets/tickets-notification-writes.service.js');
  const routes = read('backend/src/modules/tickets/tickets.routes.js');

  assert.match(writes, /const EVENT_TICKET_COMMENT\s*=\s*'tickets\.comentario\.creado'/);
  assert.match(writes, /const EVENT_TICKET_VOBO\s*=\s*'tickets\.vobo\.actualizado'/);
  assert.match(writes, /contextoSeguimiento\s*:\s*\{/);
  assert.match(writes, /dominio\s*:\s*'UNITED'/);
  assert.match(writes, /tipo\s*:\s*'TICKET'/);
  assert.match(writes, /eventCode:\s*EVENT_TICKET_COMMENT/);
  assert.match(writes, /eventCode:\s*EVENT_TICKET_VOBO/);

  assert.match(routes, /\/tickets\/:ticket\/comentarios/);
  assert.match(routes, /\/tickets\/:ticket\/validacion/);
  assert.match(routes, /\/tickets\/:ticket\/vobo/);
  assert.doesNotMatch(routes, /\/tickets\/:ticket\/(adjuntos|attachments|upload)/i);
});

test('frontend Seguimiento Especial usa solo codigo semantico y no suplanta estados_visuales', () => {
  const globalModule = read('modules/seguimiento-especial/seguimiento-especial-global.js');
  const screenModule = read('modules/seguimiento-especial/seguimiento-especial.js');

  assert.match(globalModule, /VISUAL_CODE\s*=\s*'SEGUIMIENTO_ESPECIAL'/);
  assert.match(screenModule, /VISUAL_CODE\s*=\s*'SEGUIMIENTO_ESPECIAL'/);
  assert.doesNotMatch(globalModule, /const\s+STAR\s*=|ti ti-star-filled|⭐/);
  assert.doesNotMatch(screenModule, /ti ti-star-filled|⭐/);
  assert.doesNotMatch(globalModule, /visual\.(get|getMany|emoji|renderMany|renderIdentifier|codesForEquipo|codesForProyecto)\s*=/);
  assert.match(globalModule, /data-estado-visual['\"]?,?\s*VISUAL_CODE|setAttribute\('data-estado-visual',VISUAL_CODE\)/);
  assert.doesNotMatch(globalModule, /querySelectorAll\([^\n]*data-estado-codigo[^\n]*SEGUIMIENTO_ESPECIAL/);
});

test('pantalla Notificaciones renderiza codigos_visuales mediante catalogo central', () => {
  const router = read('core/router.js');
  assert.match(router, /notificationVisualCodes_gnral/);
  assert.match(router, /codigos_visuales/);
  assert.match(router, /EstadosVisuales_gnral/);
  assert.match(router, /renderMany\(codes,\{empty:'',separator:' '\}\)/);
  assert.match(router, /data-estado-visual/);
  assert.match(router, /applyNotificationVisuals_gnral\(list\)/);
});

test('cache bust de cierre apunta a los archivos frontend corregidos', () => {
  const loader = read('core/module-loader.js');
  const index = read('index.html');
  assert.match(loader, /seguimiento-especial-global\.js\?v=20260909-seguimiento-especial-control-unico-v006/);
  assert.match(loader, /seguimiento-especial\.js\?v=20260909-seguimiento-especial-cierre-v003/);
  assert.match(index, /core\/module-loader\.js\?v=20260909-seguimiento-especial-control-unico-v002/);
  assert.match(index, /core\/router\.js\?v=20260909-seguimiento-especial-cierre-v001/);
});

test('detalle Seguimiento Especial invalida montajes async viejos y conserva un solo control', () => {
  const globalModule = read('modules/seguimiento-especial/seguimiento-especial-global.js');

  assert.match(globalModule, /let detailMountGeneration=0/);
  assert.match(globalModule, /function detailTargetKey\(payload\)/);
  assert.match(globalModule, /function currentDetailTargetKey\(\)/);
  assert.match(globalModule, /function cancelDetailMount\(\)/);
  assert.match(globalModule, /const generation=\+\+detailMountGeneration/);
  assert.match(globalModule, /mountDetailControl\(effective,generation\)/);
  assert.match(globalModule, /mountGeneration!==detailMountGeneration\|\|currentDetailTargetKey\(\)!==targetKey/);
  assert.match(globalModule, /querySelectorAll\('\[id="'\+DETAIL_CONTROL_ID\+'"\]'\)/);
  assert.match(globalModule, /controls\.length!==1/);
  assert.match(globalModule, /root\.dataset\.seguimientoTarget=targetKey/);
  assert.match(globalModule, /function handleNavigation\(event\)[\s\S]*?cancelDetailMount\(\)/);
  assert.equal((globalModule.match(/head\.appendChild\(root\)/g)||[]).length,1);
});

test('npm test queda conectado al workflow existente sin modificar el workflow', () => {
  const packageJson = JSON.parse(read('backend/package.json'));
  const workflow = read('.github/workflows/main_mantto-gestor-api.yml');

  assert.equal(
    packageJson.scripts.test,
    'node --test ../validation/seguimiento-especial-notificaciones.test.js'
  );
  assert.match(workflow, /npm run test --if-present/);
});
