'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const resolverPath = require.resolve(
  '../backend/src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service'
);

const state = {
  directTicketId: 18472,
  ticketFollowers: [],
  equipmentFollowers: [],
  projectFollowers: [],
  permitted: [],
  queries: [],
  ticketRow: {
    id_ticket: 18472,
    ticket: '254013',
    numero_equipo: null,
    proyecto: 'PROYECTO DEMO'
  }
};

function reset() {
  state.directTicketId = 18472;
  state.ticketFollowers = [];
  state.equipmentFollowers = [];
  state.projectFollowers = [];
  state.permitted = [];
  state.queries = [];
  state.ticketRow = {
    id_ticket: 18472,
    ticket: '254013',
    numero_equipo: null,
    proyecto: 'PROYECTO DEMO'
  };
}

const permissionStub = {
  async listUsersWithEffectivePermission() {
    return state.permitted;
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../permissions/effective-permission.service') return permissionStub;
  return originalLoad.call(this, request, parent, isMain);
};

let resolver;
try {
  resolver = require(resolverPath);
} finally {
  Module._load = originalLoad;
}

const executor = {
  async query(sql, params = []) {
    state.queries.push({ sql, params });

    if (/FROM\s+tickets\s+t/i.test(sql)) {
      return [[state.ticketRow]];
    }

    if (/FROM\s+seguimiento_especial\s+se/i.test(sql)) {
      const requestedId = Number(params[2]);
      return [requestedId === Number(state.directTicketId) ? state.ticketFollowers : []];
    }

    if (/FROM\s+portafolio_interes\s+direct_follow/i.test(sql)) {
      return [state.equipmentFollowers];
    }

    if (/FROM\s+portafolio_interes\s+pi/i.test(sql)) {
      return [state.projectFollowers];
    }

    if (/FROM\s+portafolio\s+p/i.test(sql)) {
      return [[{
        id_portafolio: 55,
        numero_equipo: 'EQ-55',
        proyecto: 'PROYECTO DEMO',
        zona_id: 7,
        estado_registro: 1
      }]];
    }

    throw new Error(`Query no contemplada por el test: ${sql}`);
  }
};

function ticketContext(overrides = {}) {
  return {
    dominio: 'UNITED',
    tipo: 'TICKET',
    id_ticket: 18472,
    ticket: '254013',
    proyecto: 'PROYECTO DEMO',
    zona_id: 7,
    ...overrides
  };
}

async function resolve(context = ticketContext(), eventCode = 'TICKET_ESTATUS_CAMBIADO') {
  return resolver.resolveSeguimientoRecipients_uni({
    executor,
    contextoNegocio: context,
    codigoEventoNativo: eventCode
  });
}

test('suscripcion directa TICKET recibe el evento sin requerir portafolio_interes', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20];

  const result = await resolve();

  assert.equal(result.applicable, true);
  assert.deepEqual(result.followers, [
    { id_usuario: 20, origen_seguimiento: 'TICKET', autorizado: true }
  ]);
  assert.equal(result.follow_candidate_count, 1);
  assert.equal(result.follow_authorized_count, 1);
  assert.deepEqual(result.visual_codes, ['SEGUIMIENTO_ESPECIAL']);
});

test('seguimiento directo es exclusivo del id del Ticket y no se hereda a otro Ticket', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20];

  const result = await resolve(ticketContext({ id_ticket: 18473, ticket: '254014' }));

  assert.deepEqual(result.followers, []);
  assert.equal(result.follow_candidate_count, 0);
});

test('Ticket directo se suma a seguidores existentes de Proyecto/Equipo sin reemplazarlos', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.projectFollowers = [{ id_usuario: 30, origen_seguimiento: 'PROYECTO' }];
  state.permitted = [20, 30];

  const result = await resolve();

  assert.deepEqual(result.followers, [
    { id_usuario: 20, origen_seguimiento: 'TICKET', autorizado: true },
    { id_usuario: 30, origen_seguimiento: 'PROYECTO', autorizado: true }
  ]);
});

test('usuario que llega por Ticket y Portafolio se deduplica y conserva TICKET como origen prioritario', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.projectFollowers = [{ id_usuario: 20, origen_seguimiento: 'PROYECTO' }];
  state.permitted = [20];

  const result = await resolve();

  assert.deepEqual(result.followers, [
    { id_usuario: 20, origen_seguimiento: 'TICKET', autorizado: true }
  ]);
  assert.equal(result.follow_candidate_count, 1);
});

test('snapshot previo de Portafolio no suprime al seguidor directo del Ticket', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20, 30];

  const result = await resolve(ticketContext({
    followers_snapshot: [
      { id_usuario: 30, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }
    ]
  }));

  assert.deepEqual(result.followers, [
    { id_usuario: 20, origen_seguimiento: 'TICKET', autorizado: true },
    { id_usuario: 30, origen_seguimiento: 'PROYECTO_HEREDADO', autorizado: true }
  ]);
});

test('TICKET prevalece sobre EQUIPO aunque ambos caminos pertenezcan al mismo usuario', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20];

  const result = await resolve(ticketContext({
    followers_snapshot: [
      { id_usuario: 20, origen_seguimiento: 'EQUIPO', autorizado: true }
    ]
  }));

  assert.deepEqual(result.followers, [
    { id_usuario: 20, origen_seguimiento: 'TICKET', autorizado: true }
  ]);
});

test('permiso efectivo revocado elimina tambien al suscriptor directo del Ticket', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [];

  const result = await resolve();

  assert.equal(result.follow_candidate_count, 1);
  assert.equal(result.follow_authorized_count, 0);
  assert.deepEqual(result.followers, []);
  assert.deepEqual(result.visual_codes, []);
});

test('resolver completa id_ticket desde la referencia visible antes de consultar seguimiento general', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20];

  const result = await resolve({
    dominio: 'UNITED',
    tipo: 'TICKET',
    ticket: '254013',
    proyecto: 'PROYECTO DEMO',
    zona_id: 7
  });

  assert.equal(result.context.id_ticket, 18472);
  assert.equal(result.followers[0].id_usuario, 20);
  assert.equal(state.queries.some((item) => /FROM\s+tickets\s+t/i.test(item.sql)), true);
});

test('otros tipos de entidad no consultan seguimiento_especial como TICKET', async () => {
  reset();
  state.projectFollowers = [{ id_usuario: 30, origen_seguimiento: 'PROYECTO' }];
  state.permitted = [30];

  const result = await resolve({
    dominio: 'UNITED',
    tipo: 'EQUIPO',
    proyecto: 'PROYECTO DEMO',
    zona_id: 7
  }, 'PORTAFOLIO_EQUIPO_CAMBIO');

  assert.deepEqual(result.followers, [
    { id_usuario: 30, origen_seguimiento: 'PROYECTO', autorizado: true }
  ]);
  assert.equal(
    state.queries.some((item) => /FROM\s+seguimiento_especial\s+se/i.test(item.sql)),
    false
  );
});

test('Ticket directo participa en estatus/cierre-reapertura, comentario, VoBo y evento critico', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20];

  const eventCodes = [
    'TICKET_ESTATUS_CAMBIADO',
    'tickets.comentario.creado',
    'tickets.vobo.actualizado',
    'FALLA_EQUIPO_CRITICO'
  ];

  for (const eventCode of eventCodes) {
    state.queries = [];
    const result = await resolve(ticketContext(), eventCode);
    assert.equal(result.codigo_evento_nativo, eventCode);
    assert.deepEqual(result.followers, [
      { id_usuario: 20, origen_seguimiento: 'TICKET', autorizado: true }
    ], eventCode);
  }
});

test('consulta TICKET exige suscripcion activa y revalida alcance UNITED/ZOP actual', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20];

  await resolve();

  const query = state.queries.find((item) => /FROM\s+seguimiento_especial\s+se/i.test(item.sql));
  assert.ok(query);
  assert.match(query.sql, /se\.origen = \?/);
  assert.match(query.sql, /se\.entidad_tipo = \?/);
  assert.match(query.sql, /se\.entidad_id = \?/);
  assert.match(query.sql, /se\.activo = 1/);
  assert.match(query.sql, /usuarios_alcance_informacion/);
  assert.match(query.sql, /usuario_zop/);
  assert.deepEqual(query.params, ['UNITED', 'TICKET', 18472, 7, 7]);
});

test('fuera de UNITED falla cerrado y no consulta seguidores', async () => {
  reset();
  state.ticketFollowers = [{ id_usuario: 20, origen_seguimiento: 'TICKET' }];
  state.permitted = [20];

  const result = await resolve({
    dominio: 'CORELLIAN',
    tipo: 'TICKET',
    id_ticket: 18472,
    ticket: '254013',
    proyecto: 'PROYECTO DEMO',
    zona_id: 7
  });

  assert.equal(result.applicable, false);
  assert.deepEqual(result.followers, []);
  assert.equal(state.queries.length, 0);
});

test('archivo modificado no altera portafolio_interes y agrega solo la capa general TICKET', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../backend/src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service.js'),
    'utf8'
  );

  assert.match(source, /FROM seguimiento_especial se/);
  assert.match(source, /GENERAL_ENTITY_TICKET = 'TICKET'/);
  assert.match(source, /recipientsForTicket/);
  assert.match(source, /FROM portafolio_interes direct_follow/);
  assert.match(source, /FROM portafolio_interes pi/);
  assert.doesNotMatch(source, /UPDATE\s+portafolio_interes/i);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+portafolio_interes/i);
});
