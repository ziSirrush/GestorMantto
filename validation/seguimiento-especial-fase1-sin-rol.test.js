'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const state = {
  followers: [],
  inserted: [],
  matrixConfigured: 1,
  policyRows: [],
  policyQueries: 0,
  preferenceQueries: 0,
  followerError: null,
  lastFollowerInput: null,
  visual: { codigo: 'SEGUIMIENTO_ESPECIAL', emoji: '⭐' }
};

const repositoryStub = {
  async withTransaction(work) { return work(repositoryStub); },
  async findEvent() {
    return {
      codigo_evento: 'EVENTO_UNITED',
      nombre_evento: 'Evento UNITED',
      titulo_default: 'Evento UNITED',
      mensaje_default: 'Actividad UNITED',
      prioridad_default: 'MEDIA',
      obligatoria: 0,
      campana_default: 1,
      push_default: 1,
      matriz_roles_configurada: state.matrixConfigured
    };
  },
  async findActiveVisualState() { return state.visual; },
  async listRecipientPolicyContext(_connection, { idUsuarios }) {
    state.policyQueries += 1;
    return state.policyRows.filter((row) => idUsuarios.includes(Number(row.id_usuario)));
  },
  async listPreferencesForUsers() {
    state.preferenceQueries += 1;
    return [];
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
  async resolveSeguimientoRecipients_uni(input) {
    state.lastFollowerInput = input;
    if (state.followerError) throw state.followerError;
    return {
      applicable: true,
      context: {
        dominio: 'UNITED',
        tipo: 'EQUIPO',
        id_portafolio: 55,
        numero_equipo: 'EQ-55',
        proyecto: 'P-55',
        zona_id: 7
      },
      followers: state.followers,
      visual_codes: state.followers.length ? ['SEGUIMIENTO_ESPECIAL'] : [],
      follow_candidate_count: state.followers.length,
      follow_authorized_count: state.followers.length
    };
  }
};

const loggerStub = { info() {}, warn() {}, error() {} };
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './notification.repository') return repositoryStub;
  if (request === './notification-decision') {
    return {
      resolveMatrixRecipientDecision_gnral({ rows }) {
        if (!Array.isArray(rows) || !rows.length) {
          return {
            eligible: false,
            reason: 'SIN_ROL_ASOCIADO',
            policy: null,
            role_ids: [],
            bell_enabled: false,
            push_enabled: false,
            scope_allowed: false
          };
        }
        return {
          eligible: true,
          reason: null,
          policy: 'OBLIGATORIA',
          role_ids: rows.map((row) => Number(row.id_rol)).filter(Boolean),
          bell_enabled: true,
          push_enabled: true,
          scope_allowed: true,
          scope_via: 'ZONA_OPERATIVA'
        };
      }
    };
  }
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
  state.inserted = [];
  state.matrixConfigured = 1;
  state.policyRows = [];
  state.policyQueries = 0;
  state.preferenceQueries = 0;
  state.followerError = null;
  state.lastFollowerInput = null;
  state.visual = { codigo: 'SEGUIMIENTO_ESPECIAL', emoji: '⭐' };
}

function unitedInput(destinatarios = [], options = {}) {
  const input = {
    codigoEvento: 'EVENTO_UNITED',
    destinatarios,
    eventInstanceKey: options.eventInstanceKey || 'evento-united:55',
    titulo: options.titulo || 'Evento UNITED',
    mensaje: options.mensaje || 'Proyecto 55 - Ref sitio',
    contextoSeguimiento: {
      dominio: 'UNITED',
      tipo: 'EQUIPO',
      id_portafolio: 55,
      numero_equipo: 'EQ-55',
      proyecto: 'P-55',
      zona_id: 7
    }
  };
  if (options.declareZone !== false) input.zonaOperativaId = 7;
  if (options.requireRoleMatrix === true) input.requireRoleMatrix = true;
  return input;
}

test('Seguidor autorizado recibe evento UNITED aunque no tenga rol en la matriz nativa', async () => {
  reset();
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }];

  const result = await notificationService.emit(unitedInput([]));

  assert.equal(result.created, 1);
  assert.deepEqual(result.recipients, [20]);
  assert.deepEqual(result.bell_recipients, [20]);
  assert.deepEqual(result.push_recipients, [20]);
  assert.equal(state.policyQueries, 0, 'el follower no debe consultar matriz de rol nativa');
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].id_usuario, 20);
  assert.equal(state.inserted[0].tipo_notificacion, 'EVENTO_UNITED');
  assert.deepEqual(state.inserted[0].codigos_visuales, ['SEGUIMIENTO_ESPECIAL']);
  assert.equal(result.decisions[0].policy, 'SEGUIMIENTO_ESPECIAL');
  assert.equal(result.decisions[0].scope_via, 'SEGUIMIENTO_ESPECIAL');
  assert.equal(result.seguimiento_especial.catalog_lookup_status, 'RESUELTO');
  assert.equal(result.seguimiento_especial.follow_decorated_count, 1);
});

test('Destinatario normal sin rol sigue bloqueado; Seguimiento Especial no amplia la matriz normal', async () => {
  reset();

  const result = await notificationService.emit(unitedInput([30]));

  assert.equal(result.created, 0);
  assert.deepEqual(result.recipients, []);
  assert.equal(state.policyQueries, 1);
  assert.equal(result.decisions[0].id_usuario, 30);
  assert.equal(result.decisions[0].reason, 'SIN_ROL_ASOCIADO');
});

test('Usuario nativo + follower recibe una sola notificacion y conserva estrella', async () => {
  reset();
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }];

  const result = await notificationService.emit(unitedInput([20, 20]));

  assert.equal(result.created, 1);
  assert.deepEqual(result.recipients, [20]);
  assert.equal(state.inserted.length, 1);
  assert.deepEqual(state.inserted[0].codigos_visuales, ['SEGUIMIENTO_ESPECIAL']);
  assert.equal(result.seguimiento_especial.deduped_count, 1);
  assert.equal(state.policyQueries, 0);
});

test('Follower puede recibir con contexto UNITED valido aunque falte zona top-level de la matriz nativa', async () => {
  reset();
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }];

  const result = await notificationService.emit(unitedInput([], { declareZone: false }));

  assert.equal(result.created, 1);
  assert.deepEqual(result.recipients, [20]);
  assert.equal(result.zone_scope, 'NO_DECLARADA');
  assert.equal(state.policyQueries, 0);
});

test('requireRoleMatrix sin matriz bloquea nativos pero no al follower autorizado', async () => {
  reset();
  state.matrixConfigured = 0;
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }];

  const result = await notificationService.emit(unitedInput([30], { requireRoleMatrix: true }));

  assert.equal(result.created, 1);
  assert.deepEqual(result.recipients, [20]);
  assert.deepEqual(result.bell_recipients, [20]);
  assert.deepEqual(result.push_recipients, [20]);
  assert.equal(state.preferenceQueries, 1);
  assert.equal(
    result.decisions.some((decision) => decision.id_usuario === 30 && decision.reason === 'MATRIZ_ROLES_NO_CONFIGURADA'),
    true
  );
  assert.equal(
    result.decisions.some((decision) => decision.id_usuario === 20 && decision.policy === 'SEGUIMIENTO_ESPECIAL' && decision.status === 'CREADA'),
    true
  );
});

test('La exclusion nativa del actor se conserva aunque el actor tenga Seguimiento Especial', async () => {
  reset();
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }];

  const result = await notificationService.emit({
    ...unitedInput([20]),
    actorUserId: 20
  });

  assert.equal(result.created, 0);
  assert.equal(result.reason, 'ACTOR_EXCLUIDO');
  assert.equal(state.inserted.length, 0);
  assert.equal(result.seguimiento_especial.follow_native_excluded_count, 1);
});

test('los cinco eventos exclusivos ignoran la matriz y entregan a Equipo directo y Proyecto heredado', async () => {
  reset();
  state.followers = [
    { id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true },
    { id_usuario: 21, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }
  ];
  state.policyRows = [
    { id_usuario: 20, id_rol: 1 },
    { id_usuario: 30, id_rol: 1 }
  ];

  for (const codigoEvento of notificationService.SEGUIMIENTO_EXCLUSIVE_EVENT_CODES) {
    state.inserted = [];
    state.policyQueries = 0;
    const result = await notificationService.emit({
      ...unitedInput([20, 30]),
      codigoEvento,
      eventInstanceKey: `exclusivo:${codigoEvento}:55`
    });

    assert.deepEqual(result.recipients, [20, 21], codigoEvento);
    assert.deepEqual(result.bell_recipients, [20, 21], codigoEvento);
    assert.deepEqual(result.push_recipients, [20, 21], codigoEvento);
    assert.equal(state.policyQueries, 0, codigoEvento);
    assert.equal(state.inserted.length, 2, codigoEvento);
    assert.deepEqual(state.inserted.map((item) => item.id_usuario), [20, 21], codigoEvento);
    assert.equal(
      state.inserted.every((item) => item.codigos_visuales.includes('SEGUIMIENTO_ESPECIAL')),
      true,
      codigoEvento
    );
    assert.equal(result.seguimiento_especial.exclusive_event, true, codigoEvento);
    assert.equal(result.seguimiento_especial.native_recipients_suppressed_count, 2, codigoEvento);
    assert.equal('modoSeguimiento' in state.lastFollowerInput, false, codigoEvento);
  }
});

test('destinatario nativo que tambien es follower recibe una sola notificacion con estrella', async () => {
  reset();
  state.followers = [{ id_usuario: 20, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }];
  state.policyRows = [{ id_usuario: 20, id_rol: 1 }];

  const result = await notificationService.emit({
    ...unitedInput([20]),
    codigoEvento: 'TICKET_PRIORIDAD_CAMBIADA',
    eventInstanceKey: 'follow-only-dedup:55'
  });

  assert.equal(result.created, 1);
  assert.deepEqual(result.recipients, [20]);
  assert.equal(state.inserted.length, 1);
  assert.deepEqual(state.inserted[0].codigos_visuales, ['SEGUIMIENTO_ESPECIAL']);
  assert.equal(state.policyQueries, 0);
});

test('evento exclusivo sin seguidor no se abre por rol ni por matriz', async () => {
  reset();
  state.policyRows = [{ id_usuario: 30, id_rol: 1 }];

  const result = await notificationService.emit({
    ...unitedInput([30]),
    codigoEvento: 'TICKET_CREADO',
    eventInstanceKey: 'exclusivo-sin-seguidor:55'
  });

  assert.equal(result.created, 0);
  assert.deepEqual(result.recipients, []);
  assert.equal(state.policyQueries, 0);
  assert.equal(state.inserted.length, 0);
  assert.equal(result.seguimiento_especial.native_recipients_suppressed_count, 1);
});

test('evento exclusivo falla cerrado si el resolver de Seguimiento no esta disponible', async () => {
  reset();
  state.followerError = Object.assign(new Error('resolver no disponible'), { code: 'TEST_RESOLVER_ERROR' });
  state.policyRows = [{ id_usuario: 30, id_rol: 1 }];

  const result = await notificationService.emit({
    ...unitedInput([30]),
    codigoEvento: 'TICKET_ESTATUS_CAMBIADO',
    eventInstanceKey: 'exclusivo-resolver-error:55'
  });

  assert.equal(result.created, 0);
  assert.deepEqual(result.recipients, []);
  assert.equal(state.policyQueries, 0);
  assert.equal(result.seguimiento_especial.fail_closed, true);
  assert.equal(result.seguimiento_especial.error_code, 'TEST_RESOLVER_ERROR');
});

test('evento exclusivo falla cerrado sin contexto de Seguimiento', async () => {
  reset();
  state.policyRows = [{ id_usuario: 30, id_rol: 1 }];

  const result = await notificationService.emit({
    codigoEvento: 'TICKET_ASIGNACION_CAMBIADA',
    destinatarios: [30],
    zonaOperativaId: 7,
    eventInstanceKey: 'exclusivo-sin-contexto:55'
  });

  assert.equal(result.created, 0);
  assert.deepEqual(result.recipients, []);
  assert.equal(state.policyQueries, 0);
  assert.equal(state.inserted.length, 0);
  assert.equal(
    result.seguimiento_especial.exclusion_reason,
    'CONTEXTO_SEGUIMIENTO_NO_DECLARADO'
  );
});

test('actor conserva su exclusion en evento follow-only y no bloquea a otro follower', async () => {
  reset();
  state.followers = [
    { id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true },
    { id_usuario: 21, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }
  ];

  const result = await notificationService.emit({
    ...unitedInput([30]),
    codigoEvento: 'TICKET_RESPONSABILIDAD_CAMBIADA',
    actorUserId: 20,
    eventInstanceKey: 'follow-only-actor:55'
  });

  assert.equal(result.created, 1);
  assert.deepEqual(result.recipients, [21]);
  assert.deepEqual(state.inserted.map((item) => item.id_usuario), [21]);
  assert.equal(result.seguimiento_especial.follow_native_excluded_count, 1);
  assert.equal(state.policyQueries, 0);
});
