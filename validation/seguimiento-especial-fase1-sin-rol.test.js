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
  async resolveSeguimientoRecipients_uni() {
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
