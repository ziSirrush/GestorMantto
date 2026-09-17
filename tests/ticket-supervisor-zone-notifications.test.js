'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(
  root,
  'backend/src/services/notifications/ticket-supervisor-zone-notifications_uni.service.js'
);

const state = {
  rows: [],
  supervisorIds: [],
  zoneId: 7,
  emissions: []
};

const dbStub = {
  async query(sql, params) {
    const text = String(sql);
    if (/SELECT \*\s+FROM tickets\s+WHERE id IN/i.test(text)) {
      const ids = new Set((params || []).map(Number));
      return [state.rows.filter((row) => ids.has(Number(row.id)))];
    }
    if (/SELECT DISTINCT u\.id_SB/i.test(text) && /usuario_zop/i.test(text)) {
      assert.deepEqual(params, [state.zoneId]);
      return [state.supervisorIds.map((id) => ({ id_SB: id }))];
    }
    throw new Error(`Consulta no simulada: ${text.slice(0, 140)}`);
  }
};

const emitterStub = {
  async emitBusinessEventSafe_gnral(input) {
    state.emissions.push({ ...input });
    return {
      ok: true,
      created: input.destinatarios.length,
      skipped: 0,
      recipients: input.destinatarios.slice(),
      bell_recipients: input.destinatarios.slice(),
      push_recipients: input.destinatarios.slice(),
      decisions: input.destinatarios.map((id) => ({
        id_usuario: id,
        status: 'CREADA',
        reason: null
      })),
      trace_id: `trace-${state.emissions.length}`
    };
  }
};

function loadService() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return dbStub;
    if (request === '../../shared/logger') return { info() {}, warn() {}, error() {} };
    if (request === './notification-business-emitter.service') return emitterStub;
    if (request === './notification-site-label.service') {
      return { siteLabel_gnral: (row) => `${row.proyecto || 'Proyecto'} - ${row.referencia_en_zona_operativa || 'Sin referencia'}` };
    }
    if (request === './ticket-critical-notifications_uni.service') {
      return {
        isClosedTicketStatus_uni(value) {
          return /\bcerrad[oa]\b/i.test(String(value || ''));
        },
        async resolveTicketZoneId_uni() {
          return state.zoneId;
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(servicePath)];
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

const service = loadService();

function loadNotificationEngine() {
  const notificationServicePath = path.join(
    root,
    'backend/src/services/notifications/notification.service.js'
  );
  const repository = {
    async withTransaction(work) {
      return work({ query() {} });
    },
    async findEvent() {
      return {
        codigo_evento: 'TEST_ACTOR',
        nombre_evento: 'Prueba actor',
        obligatoria: 1,
        campana_default: 1,
        push_default: 1,
        matriz_roles_configurada: 0
      };
    },
    async listPreferencesForUsers() {
      return [];
    },
    async insertNotifications(_connection, notifications) {
      return {
        affectedRows: notifications.length,
        insertedNotifications: notifications,
        duplicateNotifications: [],
        outcomes: notifications.map((notification) => ({
          notification,
          inserted: true,
          duplicate: false
        }))
      };
    }
  };
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './notification.repository') return repository;
    if (request === '../../shared/logger') return { info() {}, warn() {}, error() {} };
    if (request === './notification-decision') {
      return { resolveMatrixRecipientDecision_gnral() { return { eligible: false }; } };
    }
    if (request === './portafolio-seguimiento-especial-notifications_uni.service') {
      return {
        VISUAL_CODE: 'SEGUIMIENTO_ESPECIAL',
        async resolveSeguimientoRecipients_uni() {
          return { applicable: false, followers: [] };
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(notificationServicePath)];
    return require(notificationServicePath);
  } finally {
    Module._load = originalLoad;
  }
}

function reset() {
  state.rows = [];
  state.supervisorIds = [];
  state.zoneId = 7;
  state.emissions = [];
}

function context(ids, beforeRows = []) {
  return {
    receivedCandidateIds: ids,
    candidateIds: ids,
    candidateOrder: new Map(ids.map((id, index) => [id, index])),
    beforeTickets: new Map(beforeRows.map((row) => [Number(row.id), row]))
  };
}

test('INSERT emite TICKET_INSERTADO solo a Supervisores de la zona e incluye al actor Supervisor', async () => {
  reset();
  state.rows = [{
    id: 101,
    ticket: 'T-101',
    proyecto: 'Proyecto A',
    referencia_en_zona_operativa: 'Elevador 1',
    estado_ticket: 'Abierto'
  }];
  state.supervisorIds = [10, 11, 11];

  const result = await service.processAfterSync_uni(context([101]), { id_SB: 10 });

  assert.equal(state.emissions.length, 1);
  assert.equal(state.emissions[0].codigoEvento, 'TICKET_INSERTADO');
  assert.deepEqual(state.emissions[0].destinatarios, [10, 11]);
  assert.equal(state.emissions[0].actorUserId, 10);
  assert.equal(state.emissions[0].excludeActor, false);
  assert.equal(state.emissions[0].requireRoleMatrix, true);
  assert.equal(state.emissions[0].zonaOperativaId, 7);
  assert.equal(state.emissions[0].contextoSeguimiento, undefined);
  assert.equal(state.emissions[0].ruta, 'detalle:ticket:T-101');
  assert.equal(result.ticket_insertado, 2);
  assert.equal(result.ticket_cerrado, 0);
});

test('UPDATE de no cerrado a Cerrado emite TICKET_CERRADO una sola vez', async () => {
  reset();
  const before = {
    id: 202,
    ticket: 'T-202',
    estado_ticket: 'En proceso',
    estatus_equipo_final: 'Detenido'
  };
  state.rows = [{
    ...before,
    proyecto: 'Proyecto B',
    referencia_en_zona_operativa: 'Elevador 2',
    estado_ticket: 'CERRADO',
    fecha_cierre: '2026-09-17',
    h_solucion: '14:20',
    estatus_equipo_final: 'Operando'
  }];
  state.supervisorIds = [20, 21];

  const result = await service.processAfterSync_uni(context([202], [before]), { id_SB: 99 });

  assert.equal(state.emissions.length, 1);
  assert.equal(state.emissions[0].codigoEvento, 'TICKET_CERRADO');
  assert.equal(state.emissions[0].titulo, 'Ticket cerrado');
  assert.match(state.emissions[0].mensaje, /Estatus Final del Equipo: Operando/);
  assert.match(state.emissions[0].eventInstanceKey, /^ticket-supervisor:TICKET_CERRADO:/);
  assert.equal(result.ticket_insertado, 0);
  assert.equal(result.ticket_cerrado, 2);
});

test('UPDATE de ticket ya Cerrado y UPDATE sin cierre no emiten los eventos nuevos', async () => {
  reset();
  state.rows = [
    { id: 301, ticket: 'T-301', estado_ticket: 'Cerrado', prioridad: 'Alta' },
    { id: 302, ticket: 'T-302', estado_ticket: 'En proceso', prioridad: 'Alta' }
  ];
  const beforeRows = [
    { id: 301, ticket: 'T-301', estado_ticket: 'Cerrado', prioridad: 'Media' },
    { id: 302, ticket: 'T-302', estado_ticket: 'Abierto', prioridad: 'Media' }
  ];
  state.supervisorIds = [30];

  const result = await service.processAfterSync_uni(context([301, 302], beforeRows), null);

  assert.equal(state.emissions.length, 0);
  assert.equal(result.ticket_insertado, 0);
  assert.equal(result.ticket_cerrado, 0);
});

test('sin Supervisores directos en usuario_zop no se emite notificacion', async () => {
  reset();
  state.rows = [{ id: 401, ticket: 'T-401', estado_ticket: 'Abierto' }];

  const result = await service.processAfterSync_uni(context([401]), null);

  assert.equal(state.emissions.length, 0);
  assert.equal(result.eventos.length, 1);
  assert.equal(result.eventos[0].reason, 'SIN_SUPERVISORES_ACTIVOS_EN_ZONA');
});

test('zona no resuelta falla cerrado y un INSERT ya Cerrado sigue siendo solo alta', async () => {
  reset();
  state.zoneId = null;
  state.rows = [{ id: 450, ticket: 'T-450', estado_ticket: 'Cerrado' }];
  state.supervisorIds = [40];

  const unresolved = await service.processAfterSync_uni(context([450]), null);

  assert.equal(state.emissions.length, 0);
  assert.equal(unresolved.eventos.length, 1);
  assert.equal(unresolved.eventos[0].codigo_evento, 'TICKET_INSERTADO');
  assert.equal(unresolved.eventos[0].reason, 'ZONA_OPERATIVA_NO_RESUELTA');

  state.zoneId = 7;
  await service.processAfterSync_uni(context([450]), null);
  assert.equal(state.emissions.length, 1);
  assert.equal(state.emissions[0].codigoEvento, 'TICKET_INSERTADO');
});

test('motor central conserva al actor solo cuando el productor declara excludeActor false', async () => {
  const engine = loadNotificationEngine();
  const included = await engine.emit({
    codigoEvento: 'TEST_ACTOR',
    destinatarios: [10, 11],
    actorUserId: 10,
    excludeActor: false,
    eventInstanceKey: 'actor-incluido'
  });
  const excluded = await engine.emit({
    codigoEvento: 'TEST_ACTOR',
    destinatarios: [10, 11],
    actorUserId: 10,
    eventInstanceKey: 'actor-excluido'
  });

  assert.deepEqual(included.recipients, [10, 11]);
  assert.deepEqual(excluded.recipients, [11]);
  assert.equal(excluded.decisions[0].reason, 'ACTOR_EXCLUIDO');
});

test('contrato estatico conserva audiencia directa, actor incluido y catalogo obligatorio', () => {
  const serviceSource = fs.readFileSync(servicePath, 'utf8');
  const notificationSource = fs.readFileSync(
    path.join(root, 'backend/src/services/notifications/notification.service.js'),
    'utf8'
  );
  const migration = fs.readFileSync(
    path.join(root, 'sql/20260917_TICKETS_SUPERVISORES_ZONA_NOTIFICACIONES_V001.sql'),
    'utf8'
  );

  assert.match(serviceSource, /FROM usuarios u[\s\S]*usuario_zop[\s\S]*uz\.zona_id = \?/);
  assert.match(serviceSource, /SUPERVISOR MANTENIMIENTO ZONA%/);
  assert.match(serviceSource, /excludeActor:\s*false/);
  assert.doesNotMatch(serviceSource, /contextoSeguimiento\s*:/);
  assert.match(notificationSource, /input\.excludeActor !== false/);
  assert.match(migration, /'TICKET_INSERTADO'/);
  assert.match(migration, /'TICKET_CERRADO'/);
  assert.match(migration, /'OBLIGATORIA'/);
  assert.match(migration, /correo_default[\s\S]*0/);
});
