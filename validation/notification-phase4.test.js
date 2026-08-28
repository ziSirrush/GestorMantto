'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const serviceSource = read('backend/src/services/notifications/ticket-critical-notifications_uni.service.js');
const sqlSource = read('backend/sql/20260825_VERIFICAR_NOTIFICACIONES_FASE_4_CRITICOS.sql');

const state = {
  insertedRows: [],
  beforeRows: [],
  periodIds: [],
  criticalCounts: {},
  activeUsers: [11, 12],
  zoneId: 7,
  emissions: []
};

const dbStub = {
  async query(sql, params) {
    const text = String(sql);

    if (/SELECT \*\s+FROM tickets\s+WHERE id IN/i.test(text)) {
      const requested = new Set((params || []).map(Number));
      return [state.insertedRows.filter((row) => requested.has(Number(row.id)))];
    }

    if (/AS calificaba_blt_periodo/i.test(text)) {
      const requested = new Set((params || []).map(Number));
      return [state.beforeRows.filter((row) => requested.has(Number(row.id)))];
    }

    if (/COUNT\(DISTINCT t\.id\) AS fallas_blt_periodo/i.test(text)) {
      return [(params || []).map((equipment) => ({
        numero_equipo: equipment,
        fallas_blt_periodo: Number(state.criticalCounts[equipment] || 0)
      }))];
    }

    if (/SELECT u\.id_SB\s+FROM usuarios u/i.test(text)) {
      return [state.activeUsers.map((id) => ({ id_SB: id }))];
    }

    if (/SELECT t\.id\s+FROM tickets t\s+WHERE t\.id IN/i.test(text)) {
      return [state.periodIds.map((id) => ({ id }))];
    }

    if (/COUNT\(DISTINCT p\.zona_id\) AS zonas_distintas/i.test(text)) {
      return [[{
        total: 1,
        zonas_nulas: 0,
        zonas_distintas: 1,
        zona_id: state.zoneId
      }]];
    }

    throw new Error(`Consulta no simulada en prueba Fase 4: ${text.slice(0, 120)}`);
  }
};

const loggerStub = {
  info() {},
  warn() {},
  error() {}
};

const emitterStub = {
  async emitBusinessEventSafe_gnral(input) {
    state.emissions.push({ ...input });
    return {
      ok: true,
      created: 1,
      skipped: 0,
      recipients: [12],
      bell_recipients: [12],
      push_recipients: [12],
      decisions: [{ id_usuario: 12, status: 'CREADA', reason: null }],
      trace_id: `trace-${state.emissions.length}`
    };
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../../config/db') return dbStub;
  if (request === '../../shared/logger') return loggerStub;
  if (request === './notification-business-emitter.service') return emitterStub;
  return originalLoad.call(this, request, parent, isMain);
};

let service;
try {
  service = require('../backend/src/services/notifications/ticket-critical-notifications_uni.service.js');
} finally {
  Module._load = originalLoad;
}

function beforeContext({ ids, existing = [], beforeRows = [], failures = {} }) {
  const rowsById = new Map(beforeRows.map((row) => [Number(row.id), row]));
  return {
    candidateIds: ids,
    candidateOrder: new Map(ids.map((id, index) => [id, index])),
    existingIds: new Set(existing),
    beforeTickets: rowsById,
    criticalBefore: new Map(Object.entries(failures).map(([equipment, count]) => [equipment, { fallas: count }]))
  };
}

function resetRuntime() {
  state.insertedRows = [];
  state.beforeRows = [];
  state.periodIds = [];
  state.criticalCounts = {};
  state.activeUsers = [11, 12];
  state.zoneId = 7;
  state.emissions = [];
}

test('Tickets criticos conserva los tres eventos base y agrega las dos combinaciones oficiales', () => {
  for (const code of [
    'FALLA_EQUIPO_CRITICO',
    'NUEVO_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA',
    'PERSONA_ATRAPADA_EQUIPO_CRITICO',
    'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
  ]) {
    assert.match(serviceSource, new RegExp(code));
  }
});

test('Fase 4 deja de escribir sup_notificaciones y usa el emisor seguro central', () => {
  assert.doesNotMatch(serviceSource, /INSERT\s+INTO\s+sup_notificaciones/i);
  assert.match(serviceSource, /notification-business-emitter\.service/);
  assert.match(serviceSource, /emitBusinessEventSafe_gnral/);
  assert.match(serviceSource, /requireRoleMatrix:\s*true/);
  assert.match(serviceSource, /eventInstanceKey/);
});

test('Fase 4 ya no restringe destinatarios al rol principal', () => {
  assert.doesNotMatch(serviceSource, /ur\.principal\s*=\s*1/);
  assert.doesNotMatch(serviceSource, /notificacion_evento_roles\s+ner/);
  assert.match(serviceSource, /listActiveUserIds_uni/);
  assert.match(serviceSource, /El motor central es la unica capa/);
});

test('Zona del Ticket se resuelve con Portafolio.zona_id y no con tickets.zona', () => {
  assert.match(serviceSource, /p\.zona_id/);
  assert.match(serviceSource, /codigo_equipo/);
  assert.match(serviceSource, /proyecto_padre/);
  assert.doesNotMatch(serviceSource, /ticketRow\?\.zona/);
  assert.match(serviceSource, /zonas_distintas/);
});

test('Criterio de criticidad se conserva en 3 fallas BLT dentro de 35 dias', () => {
  assert.match(serviceSource, /CRITICOS_DIAS_UNI\s*=\s*35/);
  assert.match(serviceSource, /CRITICOS_MIN_FALLAS_BLT_UNI\s*=\s*3/);
  assert.match(serviceSource, /DATE_SUB\(CURDATE\(\), INTERVAL \$\{CRITICOS_DIAS_UNI\} DAY\)/);
  assert.match(serviceSource, /LIKE '%BLT%'/);
  assert.match(serviceSource, /fecha_reporte < DATE_ADD\(CURDATE\(\), INTERVAL 1 DAY\)/);
});

test('Captura previa conserva UPDATE relevantes y descarta resincronizaciones sin cambios criticos', async () => {
  resetRuntime();
  state.beforeRows = [
    {
      id: 601,
      ticket: 'T-601',
      codigo_equipo: 'EQ-6',
      responsabilidad: null,
      fecha_reporte: '2026-08-28',
      descripcion: 'Falla general',
      causa: null,
      accion_en_cierre: null,
      calificaba_blt_periodo: 0
    },
    {
      id: 602,
      ticket: 'T-602',
      codigo_equipo: 'EQ-6',
      responsabilidad: 'BLT',
      fecha_reporte: '2026-08-28',
      descripcion: 'Falla general',
      causa: null,
      accion_en_cierre: null,
      calificaba_blt_periodo: 1
    }
  ];
  state.criticalCounts = { 'EQ-6': 2 };

  const context = await service.captureBeforeSync_uni({
    updates: [
      { ...state.beforeRows[0], responsabilidad: 'BLT' },
      { ...state.beforeRows[1] }
    ]
  });

  assert.deepEqual(context.receivedCandidateIds, [601, 602]);
  assert.deepEqual(context.candidateIds, [601]);
  assert.equal(context.beforeTickets.get(601).responsabilidad, null);
  assert.equal(context.criticalBefore.get('EQ-6').fallas, 2);
});

test('NUEVO_EQUIPO_CRITICO apunta al ticket exacto que cruza el umbral dentro del lote', async () => {
  resetRuntime();
  state.insertedRows = [
    { id: 101, ticket: 'T-101', codigo_equipo: 'EQ-1', responsabilidad: 'BLT' },
    { id: 102, ticket: 'T-102', codigo_equipo: 'EQ-1', responsabilidad: 'BLT' },
    { id: 103, ticket: 'T-103', codigo_equipo: 'EQ-1', responsabilidad: 'BLT' }
  ];
  state.periodIds = [101, 102, 103];

  const result = await service.processAfterSync_uni(
    beforeContext({ ids: [101, 102, 103], failures: { 'EQ-1': 1 } }),
    null
  );

  const newCritical = state.emissions.filter((item) => item.codigoEvento === 'NUEVO_EQUIPO_CRITICO');
  assert.equal(newCritical.length, 1);
  assert.equal(newCritical[0].idReferencia, 102);
  assert.equal(newCritical[0].ruta, 'detalle:ticket:T-102');
  assert.equal(newCritical[0].eventInstanceKey, 'ticket-critical:NUEVO_EQUIPO_CRITICO:ticket-id:102');
  assert.equal(result.eventos.find((item) => item.codigo_evento === 'NUEVO_EQUIPO_CRITICO').ticket_id, 102);
  assert.equal(result.eventos.find((item) => item.codigo_evento === 'NUEVO_EQUIPO_CRITICO').fallas_blt_antes_del_ticket, 2);
  assert.equal(result.eventos.find((item) => item.codigo_evento === 'NUEVO_EQUIPO_CRITICO').fallas_blt_despues_del_ticket, 3);
  assert.equal(state.emissions.filter((item) => item.codigoEvento === 'FALLA_EQUIPO_CRITICO').length, 1);
  assert.equal(state.emissions.find((item) => item.codigoEvento === 'FALLA_EQUIPO_CRITICO').idReferencia, 103);
});

test('FALLA_EQUIPO_CRITICO se emite para un nuevo BLT cuando el equipo ya era critico', async () => {
  resetRuntime();
  state.insertedRows = [
    { id: 201, ticket: 'T-201', codigo_equipo: 'EQ-2', responsabilidad: 'Responsabilidad BLT' }
  ];
  state.periodIds = [201];

  await service.processAfterSync_uni(
    beforeContext({ ids: [201], failures: { 'EQ-2': 3 } }),
    null
  );

  assert.equal(state.emissions.filter((item) => item.codigoEvento === 'FALLA_EQUIPO_CRITICO').length, 1);
  assert.equal(state.emissions.filter((item) => item.codigoEvento === 'NUEVO_EQUIPO_CRITICO').length, 0);
});

test('PERSONA_ATRAPADA conserva deteccion y abre el Ticket causante', async () => {
  resetRuntime();
  state.insertedRows = [
    { id: 301, ticket: 'T-301', codigo_equipo: 'EQ-3', responsabilidad: 'Cliente', descripcion: 'Persona atrapada en cabina' }
  ];
  state.periodIds = [];

  await service.processAfterSync_uni(
    beforeContext({ ids: [301], failures: { 'EQ-3': 0 } }),
    null
  );

  const event = state.emissions.find((item) => item.codigoEvento === 'PERSONA_ATRAPADA');
  assert.ok(event);
  assert.equal(event.idReferencia, 301);
  assert.equal(event.accion, 'ABRIR_TICKET');
  assert.equal(event.ruta, 'detalle:ticket:T-301');
});

test('Persona atrapada en equipo ya critico emite una sola combinacion con maxima precedencia', async () => {
  resetRuntime();
  state.insertedRows = [{
    id: 311,
    ticket: 'T-311',
    codigo_equipo: 'EQ-31',
    responsabilidad: 'BLT',
    descripcion: 'Persona atrapada en cabina'
  }];
  state.periodIds = [311];

  await service.processAfterSync_uni(
    beforeContext({ ids: [311], failures: { 'EQ-31': 4 } }),
    null
  );

  assert.deepEqual(state.emissions.map((item) => item.codigoEvento), [
    'PERSONA_ATRAPADA_EQUIPO_CRITICO'
  ]);
  assert.equal(state.emissions[0].icono, '🚨🆘');
});

test('Persona atrapada que crea un nuevo equipo critico emite una sola combinacion', async () => {
  resetRuntime();
  state.insertedRows = [{
    id: 321,
    ticket: 'T-321',
    codigo_equipo: 'EQ-32',
    responsabilidad: 'BLT',
    descripcion: 'Rescate de persona atrapada'
  }];
  state.periodIds = [321];

  await service.processAfterSync_uni(
    beforeContext({ ids: [321], failures: { 'EQ-32': 2 } }),
    null
  );

  assert.deepEqual(state.emissions.map((item) => item.codigoEvento), [
    'PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO'
  ]);
  assert.equal(state.emissions[0].icono, '🚨💥');
});

test('Una resincronizacion de un Ticket ya existente no vuelve a emitir eventos criticos', async () => {
  resetRuntime();
  state.insertedRows = [
    { id: 401, ticket: 'T-401', codigo_equipo: 'EQ-4', responsabilidad: 'BLT', descripcion: 'Persona atrapada' }
  ];
  state.periodIds = [401];

  const result = await service.processAfterSync_uni(
    beforeContext({
      ids: [401],
      existing: [401],
      beforeRows: [{
        id: 401,
        codigo_equipo: 'EQ-4',
        responsabilidad: 'BLT',
        descripcion: 'Persona atrapada',
        calificaba_blt_periodo: 1
      }],
      failures: { 'EQ-4': 5 }
    }),
    null
  );

  assert.equal(result.affected_tickets, 1);
  assert.equal(result.inserted_tickets, 0);
  assert.equal(result.updated_tickets, 1);
  assert.equal(state.emissions.length, 0);
});

test('UPDATE NULL a BLT genera NUEVO_EQUIPO_CRITICO al cruzar de 2 a 3', async () => {
  resetRuntime();
  state.insertedRows = [{
    id: 501,
    ticket: 'T-501',
    codigo_equipo: 'EQ-5',
    responsabilidad: 'BLT'
  }];
  state.periodIds = [501];

  const result = await service.processAfterSync_uni(
    beforeContext({
      ids: [501],
      existing: [501],
      beforeRows: [{
        id: 501,
        codigo_equipo: 'EQ-5',
        responsabilidad: null,
        calificaba_blt_periodo: 0
      }],
      failures: { 'EQ-5': 2 }
    }),
    null
  );

  assert.deepEqual(state.emissions.map((item) => item.codigoEvento), ['NUEVO_EQUIPO_CRITICO']);
  assert.equal(state.emissions[0].idReferencia, 501);
  assert.equal(result.eventos[0].operacion, 'UPDATE');
  assert.equal(result.eventos[0].calificaba_blt_antes, false);
  assert.equal(result.eventos[0].califica_blt_despues, true);
  assert.equal(result.eventos[0].fallas_blt_35d_antes, 2);
  assert.equal(result.eventos[0].fallas_blt_35d_despues, 3);
});

test('UPDATE Cliente a BLT genera FALLA_EQUIPO_CRITICO si el equipo ya tenia 3 fallas', async () => {
  resetRuntime();
  state.insertedRows = [{
    id: 502,
    ticket: 'T-502',
    codigo_equipo: 'EQ-5',
    responsabilidad: 'Responsabilidad BLT'
  }];
  state.periodIds = [502];

  await service.processAfterSync_uni(
    beforeContext({
      ids: [502],
      existing: [502],
      beforeRows: [{
        id: 502,
        codigo_equipo: 'EQ-5',
        responsabilidad: 'Cliente',
        calificaba_blt_periodo: 0
      }],
      failures: { 'EQ-5': 3 }
    }),
    null
  );

  assert.deepEqual(state.emissions.map((item) => item.codigoEvento), ['FALLA_EQUIPO_CRITICO']);
});

test('UPDATE BLT a BLT no vuelve a emitir aunque el equipo siga critico', async () => {
  resetRuntime();
  state.insertedRows = [{
    id: 503,
    ticket: 'T-503',
    codigo_equipo: 'EQ-5',
    responsabilidad: 'BLT'
  }];
  state.periodIds = [503];

  await service.processAfterSync_uni(
    beforeContext({
      ids: [503],
      existing: [503],
      beforeRows: [{
        id: 503,
        codigo_equipo: 'EQ-5',
        responsabilidad: 'BLT',
        calificaba_blt_periodo: 1
      }],
      failures: { 'EQ-5': 4 }
    }),
    null
  );

  assert.equal(state.emissions.length, 0);
});

test('Un lote de UPDATE conserva secuencia: 1 a 2, 2 a 3 y 3 a 4', async () => {
  resetRuntime();
  state.insertedRows = [
    { id: 511, ticket: 'T-511', codigo_equipo: 'EQ-51', responsabilidad: 'BLT' },
    { id: 512, ticket: 'T-512', codigo_equipo: 'EQ-51', responsabilidad: 'BLT' },
    { id: 513, ticket: 'T-513', codigo_equipo: 'EQ-51', responsabilidad: 'BLT' }
  ];
  state.periodIds = [511, 512, 513];
  const beforeRows = state.insertedRows.map((row) => ({
    ...row,
    responsabilidad: null,
    calificaba_blt_periodo: 0
  }));

  await service.processAfterSync_uni(
    beforeContext({
      ids: [511, 512, 513],
      existing: [511, 512, 513],
      beforeRows,
      failures: { 'EQ-51': 1 }
    }),
    null
  );

  assert.deepEqual(state.emissions.map((item) => [item.codigoEvento, item.idReferencia]), [
    ['NUEVO_EQUIPO_CRITICO', 512],
    ['FALLA_EQUIPO_CRITICO', 513]
  ]);
});

test('Una baja BLT anterior en el lote ajusta el conteo antes de una nueva alta BLT', async () => {
  resetRuntime();
  state.insertedRows = [
    { id: 521, ticket: 'T-521', codigo_equipo: 'EQ-52', responsabilidad: 'Cliente' },
    { id: 522, ticket: 'T-522', codigo_equipo: 'EQ-52', responsabilidad: 'BLT' }
  ];
  state.periodIds = [522];

  await service.processAfterSync_uni(
    beforeContext({
      ids: [521, 522],
      existing: [521, 522],
      beforeRows: [
        { id: 521, codigo_equipo: 'EQ-52', responsabilidad: 'BLT', calificaba_blt_periodo: 1 },
        { id: 522, codigo_equipo: 'EQ-52', responsabilidad: null, calificaba_blt_periodo: 0 }
      ],
      failures: { 'EQ-52': 3 }
    }),
    null
  );

  assert.deepEqual(state.emissions.map((item) => [item.codigoEvento, item.idReferencia]), [
    ['NUEVO_EQUIPO_CRITICO', 522]
  ]);
});

test('El actor y el alcance UNITED se delegan al motor central', () => {
  assert.match(serviceSource, /actorUserId:/);
  assert.match(serviceSource, /zonaOperativaId:\s*zoneId/);
  assert.match(serviceSource, /destinatarios:\s*activeUserIds/);
  assert.match(serviceSource, /accion:\s*'ABRIR_TICKET'/);
});

test('SQL de Fase 4 es solo lectura y verifica eventos, roles, alcance y deduplicacion', () => {
  for (const code of ['FALLA_EQUIPO_CRITICO', 'NUEVO_EQUIPO_CRITICO', 'PERSONA_ATRAPADA']) {
    assert.match(sqlSource, new RegExp(code));
  }
  assert.match(sqlSource, /ner\.activo\s*=\s*1/);
  assert.match(sqlSource, /usuario_roles/);
  assert.match(sqlSource, /usuarios_alcance_informacion/);
  assert.match(sqlSource, /usuario_zop/);
  assert.match(sqlSource, /p\.zona_id/);
  assert.match(sqlSource, /clave_deduplicacion/);
  assert.match(sqlSource, /trace_id/);
  assert.doesNotMatch(sqlSource, /^\s*(ALTER|CREATE|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/im);
});
