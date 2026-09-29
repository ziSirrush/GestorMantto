'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const servicePath = require.resolve('../backend/src/modules/seguimiento-especial/seguimiento-especial.service');
const repositoryPath = require.resolve('../backend/src/modules/seguimiento-especial/seguimiento-especial.repository');

function ticketFixture() {
  return {
    id_ticket: 18472,
    ticket: '254013',
    id_interno: 'INT-254013',
    folio: 'F-254013',
    estado_ticket: 'Abierto',
    estado: 'CDMX',
    ciudad: 'Ciudad de Mexico',
    proyecto: 'PROYECTO DEMO',
    proyecto_padre: null,
    equipo: 'Elevador 1',
    codigo_equipo: '13747-CMX-ELE-BLT',
    referencia_en_zona_operativa: 'P15408',
    prioridad: 'ALTA',
    responsabilidad: 'BLT',
    fecha_reporte: '2026-09-29',
    fecha_cierre: null,
    estatus_equipo_final: null,
    actualizado_en: '2026-09-29 10:30:00'
  };
}

const state = {
  ticket: ticketFixture(),
  subscription: null,
  upserts: [],
  listRows: [],
  listError: null
};

function resetState() {
  state.ticket = ticketFixture();
  state.subscription = null;
  state.upserts = [];
  state.listRows = [];
  state.listError = null;
}

const connection = {
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {}
};

const dbStub = {
  async getConnection() { return connection; },
  async query() { throw new Error('El test de servicio no debe consultar DB real.'); }
};

const repositoryStub = {
  ORIGIN_UNITED: 'UNITED',
  ENTITY_TICKET: 'TICKET',
  async findTicketScoped() { return state.ticket; },
  async getSubscription(_executor, identity) {
    if (!state.subscription) return null;
    if (Number(state.subscription.id_usuario) !== Number(identity.userId)) return null;
    if (String(state.subscription.origen) !== String(identity.origin)) return null;
    if (String(state.subscription.entidad_tipo) !== String(identity.entityType)) return null;
    if (Number(state.subscription.entidad_id) !== Number(identity.entityId)) return null;
    return state.subscription;
  },
  async upsertSubscription(_executor, input) {
    state.upserts.push(input);
    state.subscription = {
      id_seguimiento: 91,
      id_usuario: Number(input.userId),
      origen: String(input.origin),
      entidad_tipo: String(input.entityType),
      entidad_id: Number(input.entityId),
      entidad_clave: input.entityKey,
      activo: input.active ? 1 : 0,
      created_at: '2026-09-29 10:00:00',
      updated_at: '2026-09-29 10:30:00'
    };
    return { affectedRows: 1 };
  },
  async listActiveTicketSubscriptions() {
    if (state.listError) throw state.listError;
    return state.listRows;
  }
};

function loadWithStubs(modulePath, stubs) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[modulePath];
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

// Carga unica previa: evita parches globales durante la ejecucion de tests.
const repository = loadWithStubs(repositoryPath, {
  '../../config/db': dbStub
});

const service = loadWithStubs(servicePath, {
  '../../config/db': dbStub,
  './seguimiento-especial.repository': repositoryStub,
  '../../services/information-record-scope-gnral.service': {
    buildTicketScopeSql_gnral() {
      return { sql: 't.zona_scope = ?', params: [7] };
    }
  }
});

test('GET de Ticket no seguido devuelve estado inactivo sin crear relacion', async () => {
  resetState();
  const result = await service.getTicket({
    user: { id_SB: 25 },
    params: { ticket: '254013' }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.tipo, 'TICKET');
  assert.equal(result.data.origen, 'UNITED');
  assert.equal(result.data.id_ticket, 18472);
  assert.equal(result.data.ticket, '254013');
  assert.equal(result.data.activo, false);
  assert.equal(result.data.id_seguimiento, null);
});

test('PUT activo crea/reactiva exclusivamente la suscripcion del Ticket', async () => {
  resetState();
  const result = await service.setTicket({
    user: { id_SB: 25 },
    params: { ticket: '254013' },
    body: { activo: true }
  });

  assert.equal(state.upserts.length, 1);
  assert.deepEqual(state.upserts[0], {
    userId: 25,
    origin: 'UNITED',
    entityType: 'TICKET',
    entityId: 18472,
    entityKey: '254013',
    active: true
  });
  assert.equal(result.cambio, true);
  assert.equal(result.data.activo, true);
  assert.equal(result.data.tipo, 'TICKET');
  assert.equal(result.data.origen, 'UNITED');
});

test('PUT inactivo sobre Ticket nunca seguido no crea una fila innecesaria', async () => {
  resetState();
  const result = await service.setTicket({
    user: { id_SB: 25 },
    params: { ticket: '254013' },
    body: { activo: false }
  });

  assert.equal(state.upserts.length, 0);
  assert.equal(result.cambio, false);
  assert.equal(result.data.activo, false);
  assert.equal(result.data.id_seguimiento, null);
});

test('PUT con el mismo estado activo es idempotente y no reescribe la suscripcion', async () => {
  resetState();
  state.subscription = {
    id_seguimiento: 91,
    id_usuario: 25,
    origen: 'UNITED',
    entidad_tipo: 'TICKET',
    entidad_id: 18472,
    entidad_clave: '254013',
    activo: 1,
    created_at: '2026-09-29 10:00:00',
    updated_at: '2026-09-29 10:10:00'
  };

  const result = await service.setTicket({
    user: { id_SB: 25 },
    params: { ticket: '254013' },
    body: { activo: true }
  });

  assert.equal(state.upserts.length, 0);
  assert.equal(result.cambio, false);
  assert.equal(result.data.updated_at, '2026-09-29 10:10:00');
});

test('PUT inactivo conserva la fila y cambia activo a 0; no elimina la suscripcion', async () => {
  resetState();
  state.subscription = {
    id_seguimiento: 91,
    id_usuario: 25,
    origen: 'UNITED',
    entidad_tipo: 'TICKET',
    entidad_id: 18472,
    entidad_clave: '254013',
    activo: 1,
    created_at: '2026-09-29 10:00:00',
    updated_at: '2026-09-29 10:00:00'
  };

  const result = await service.setTicket({
    user: { id_SB: 25 },
    params: { ticket: '254013' },
    body: { activo: false }
  });

  assert.equal(state.upserts.length, 1);
  assert.equal(state.upserts[0].active, false);
  assert.equal(state.subscription.id_seguimiento, 91);
  assert.equal(state.subscription.activo, 0);
  assert.equal(result.cambio, true);
  assert.equal(result.data.activo, false);
});

test('listado devuelve Tickets activos del usuario como entidades TICKET', async () => {
  resetState();
  state.listRows = [{
    ...ticketFixture(),
    id_seguimiento: 91,
    id_usuario: 25,
    origen: 'UNITED',
    entidad_tipo: 'TICKET',
    entidad_id: 18472,
    entidad_clave: '254013',
    activo: 1,
    seguimiento_created_at: '2026-09-29 10:00:00',
    seguimiento_updated_at: '2026-09-29 10:30:00'
  }];

  const result = await service.listTickets({ user: { id_SB: 25 } });

  assert.equal(result.ok, true);
  assert.equal(result.data.resumen.tickets, 1);
  assert.equal(result.data.tickets[0].ticket, '254013');
  assert.equal(result.data.tickets[0].activo, true);
  assert.equal(result.data.tickets[0].tipo, 'TICKET');
});

test('Seguimiento Especial TICKET permanece personal y bloquea escritura en modo Visor', async () => {
  resetState();
  await assert.rejects(
    service.setTicket({
      actorUser: { id_SB: 25 },
      contextUser: { id_SB: 40 },
      params: { ticket: '254013' },
      body: { activo: true }
    }),
    (error) => error?.status === 403 && error?.code === 'VIEWER_READ_ONLY'
  );
});

test('tabla seguimiento_especial ausente se traduce a error 503 controlado', async () => {
  const missingRepository = {
    ...repositoryStub,
    async getSubscription() {
      throw Object.assign(
        new Error("Table 'mydb.seguimiento_especial' doesn't exist"),
        { code: 'ER_NO_SUCH_TABLE' }
      );
    }
  };
  const isolatedService = loadWithStubs(servicePath, {
    '../../config/db': dbStub,
    './seguimiento-especial.repository': missingRepository,
    '../../services/information-record-scope-gnral.service': {
      buildTicketScopeSql_gnral() {
        return { sql: 't.zona_scope = ?', params: [7] };
      }
    }
  });

  await assert.rejects(
    isolatedService.getTicket({
      user: { id_SB: 25 },
      params: { ticket: '254013' }
    }),
    (error) => error?.status === 503 && error?.code === 'SEGUIMIENTO_ESPECIAL_SCHEMA_MISSING'
  );
});

test('repository generico persiste UNITED + TICKET sin tocar portafolio_interes', async () => {
  const queries = [];
  const executor = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };

  await repository.upsertSubscription(executor, {
    userId: 25,
    origin: 'UNITED',
    entityType: 'TICKET',
    entityId: 18472,
    entityKey: '254013',
    active: true
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO seguimiento_especial/);
  assert.doesNotMatch(queries[0].sql, /portafolio_interes/);
  assert.match(queries[0].sql, /ON DUPLICATE KEY UPDATE/);
  assert.deepEqual(queries[0].params, [25, 'UNITED', 'TICKET', 18472, '254013', 1]);
});

test('repository lista solo TICKET activos y aplica alcance UNITED al registro fuente', async () => {
  const queries = [];
  const executor = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [[]];
    }
  };

  await repository.listActiveTicketSubscriptions(executor, {
    userId: 25,
    scope: { sql: 't.zona_scope = ?', params: [7] }
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /FROM seguimiento_especial se/);
  assert.match(queries[0].sql, /INNER JOIN tickets t/);
  assert.match(queries[0].sql, /se\.origen = \?/);
  assert.match(queries[0].sql, /se\.entidad_tipo = \?/);
  assert.match(queries[0].sql, /se\.activo = 1/);
  assert.match(queries[0].sql, /t\.zona_scope = \?/);
  assert.deepEqual(queries[0].params, [25, 'UNITED', 'TICKET', 7]);
});

test('rutas publican listado y GET/PUT por Ticket con Guard de Seguimiento Especial', () => {
  const routeFile = fs.readFileSync(
    path.join(__dirname, '../backend/src/modules/seguimiento-especial/seguimiento-especial.routes.js'),
    'utf8'
  );

  assert.match(routeFile, /'\/seguimiento-especial\/tickets'/);
  assert.match(routeFile, /'\/tickets\/:ticket\/seguimiento-especial'/);
  assert.match(routeFile, /router\.put\(/);
  assert.match(routeFile, /SEGUIMIENTO_ESPECIAL_ACCESS_PERMISSION/);
  assert.match(routeFile, /SEGUIMIENTO_ESPECIAL_MANAGE_PERMISSION/);
  assert.match(routeFile, /requireTicketRecordScope_gnral/);

  const routeIndex = fs.readFileSync(
    path.join(__dirname, '../backend/src/routes/index.js'),
    'utf8'
  );
  assert.match(routeIndex, /seguimientoEspecialRoutes/);
  assert.match(routeIndex, /router\.use\(seguimientoEspecialRoutes\)/);
});
