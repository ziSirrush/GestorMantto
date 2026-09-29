'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const SERVICE_PATH = path.join(ROOT, 'backend/src/services/notifications/ticket-critical-notifications_uni.service.js');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadService(options = {}) {
  delete require.cache[require.resolve(SERVICE_PATH)];
  const emitted = [];
  const queries = [];
  const db = options.db || {
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      if (/COUNT\(\*\) AS total[\s\S]*FROM portafolio/i.test(String(sql))) {
        return [[{ total: 1, zonas_nulas: 0, zonas_distintas: 1, zona_id: 7 }]];
      }
      throw new Error(`Consulta no preparada: ${sql}`);
    }
  };
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return db;
    if (request === '../../utils/temporal') return { sqlMexicoCityToday: () => 'CURRENT_DATE()' };
    if (request === '../../shared/logger') return { info() {}, warn() {}, error() {} };
    if (request === './notification-site-label.service') {
      return { siteLabel_gnral: () => 'Proyecto Uno - Lobby' };
    }
    if (request === './notification-business-emitter.service') {
      return {
        async emitBusinessEventSafe_gnral(input) {
          emitted.push(input);
          return { ok: true, created: 1, skipped: 0, trace_id: 'trace-test' };
        }
      };
    }
    return original.call(this, request, parent, isMain);
  };

  try {
    return { service: require(SERVICE_PATH), emitted, queries };
  } finally {
    Module._load = original;
  }
}

test('declara EQUIPO_SALE_DE_CRITICO como evento nativo general', () => {
  const { service } = loadService();
  assert.equal(service.EVENT_EQUIPO_SALE_DE_CRITICO_UNI, 'EQUIPO_SALE_DE_CRITICO');
  assert.equal(service.isFollowOnlyTicketEvent_uni('EQUIPO_SALE_DE_CRITICO'), false);
});

test('detecta exactamente la transicion 3 -> 2', () => {
  const { service } = loadService();
  const result = service.detectCriticalExitTransitions_uni(
    new Map([['EQ-1', { fallas: 3 }]]),
    new Map([['EQ-1', { fallas: 2 }]])
  );
  assert.deepEqual(result, [{
    equipment: 'EQ-1',
    beforeCount: 3,
    afterCount: 2,
    transition: 'CRITICO_A_NO_CRITICO'
  }]);
});

test('4 -> 3 no dispara porque el equipo sigue critico', () => {
  const { service } = loadService();
  assert.deepEqual(service.detectCriticalExitTransitions_uni(
    new Map([['EQ-1', { fallas: 4 }]]),
    new Map([['EQ-1', { fallas: 3 }]])
  ), []);
});

test('2 -> 1 no dispara porque el equipo ya no era critico', () => {
  const { service } = loadService();
  assert.deepEqual(service.detectCriticalExitTransitions_uni(
    new Map([['EQ-1', { fallas: 2 }]]),
    new Map([['EQ-1', { fallas: 1 }]])
  ), []);
});

test('la ausencia del equipo en estado posterior equivale a cero fallas', () => {
  const { service } = loadService();
  const result = service.detectCriticalExitTransitions_uni(
    new Map([['EQ-1', { fallas: 3 }]]),
    new Map()
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].afterCount, 0);
});

test('selecciona como disparador un Ticket que dejo de contar como BLT', () => {
  const { service } = loadService();
  const before = {
    id: 11,
    ticket: '254013',
    codigo_equipo: 'EQ-1',
    responsabilidad: 'BLT',
    calificaba_blt_periodo: 1
  };
  const after = { ...before, responsabilidad: 'CLIENTE' };
  const trigger = service.criticalExitTrigger_uni(
    { equipment: 'EQ-1' },
    [after],
    new Map([[11, before]]),
    new Set()
  );
  assert.equal(trigger.row.id, 11);
  assert.equal(trigger.beforeRow.responsabilidad, 'BLT');
});

test('cambio de equipo puede sacar de critico al equipo anterior', () => {
  const { service } = loadService();
  const before = {
    id: 12,
    ticket: '254014',
    codigo_equipo: 'EQ-OLD',
    responsabilidad: 'BLT',
    calificaba_blt_periodo: 1
  };
  const after = { ...before, codigo_equipo: 'EQ-NEW' };
  const trigger = service.criticalExitTrigger_uni(
    { equipment: 'EQ-OLD' },
    [after],
    new Map([[12, before]]),
    new Set([12])
  );
  assert.equal(trigger.beforeRow.codigo_equipo, 'EQ-OLD');
  assert.equal(trigger.row.codigo_equipo, 'EQ-NEW');
});

test('Ticket que sigue contando BLT en el mismo equipo no es disparador de salida', () => {
  const { service } = loadService();
  const before = {
    id: 13,
    ticket: '254015',
    codigo_equipo: 'EQ-1',
    responsabilidad: 'BLT',
    calificaba_blt_periodo: 1
  };
  const after = { ...before, prioridad: 'ALTA' };
  assert.equal(service.criticalExitTrigger_uni(
    { equipment: 'EQ-1' },
    [after],
    new Map([[13, before]]),
    new Set([13])
  ), null);
});

test('emision usa la zona y contexto del equipo que salio, aunque el Ticket se haya movido', async () => {
  const { service, emitted, queries } = loadService();
  const before = {
    id: 14,
    ticket: '254016',
    codigo_equipo: 'EQ-OLD',
    proyecto: 'Proyecto Uno',
    referencia_en_zona_operativa: 'Lobby',
    responsabilidad: 'BLT',
    fecha_reporte: '2026-09-10',
    calificaba_blt_periodo: 1
  };
  const after = {
    ...before,
    codigo_equipo: 'EQ-NEW',
    responsabilidad: 'CLIENTE'
  };
  const result = await service.emitCriticalExitEvent_uni({
    transition: { equipment: 'EQ-OLD', beforeCount: 3, afterCount: 2 },
    trigger: { row: after, beforeRow: before },
    actorUserId: 99,
    activeUserIds: [10, 20]
  });

  assert.equal(result.created, 1);
  assert.equal(queries[0].params[0], 'EQ-OLD');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].codigoEvento, 'EQUIPO_SALE_DE_CRITICO');
  assert.deepEqual(emitted[0].destinatarios, [10, 20]);
  assert.equal(emitted[0].requireRoleMatrix, true);
  assert.equal(emitted[0].accion, 'ABRIR_TICKET');
  assert.equal(emitted[0].ruta, 'detalle:ticket:254016');
  assert.equal(emitted[0].contextoSeguimiento.numero_equipo, 'EQ-OLD');
  assert.equal(emitted[0].contextoSeguimiento.id_ticket, 14);
  assert.equal(emitted[0].contextoSeguimiento.zona_id, 7);
  assert.match(emitted[0].mensaje, /2 fallas BLT en los últimos 35 días/);
});

test('processAfterSync emite una sola salida 3 -> 2 y no duplica con evento nativo inferior', async () => {
  const before = {
    id: 21,
    ticket: '254021',
    codigo_equipo: 'EQ-21',
    proyecto: 'Proyecto Uno',
    referencia_en_zona_operativa: 'Lobby',
    responsabilidad: 'BLT',
    fecha_reporte: '2026-09-10',
    calificaba_blt_periodo: 1
  };
  const after = { ...before, responsabilidad: 'CLIENTE' };
  const db = {
    async query(sql, params) {
      const text = String(sql);
      if (/SELECT \*\s+FROM tickets\s+WHERE id IN/i.test(text)) return [[after]];
      if (/SELECT u\.id_SB\s+FROM usuarios/i.test(text)) return [[{ id_SB: 10 }, { id_SB: 20 }]];
      if (/SELECT t\.id\s+FROM tickets/i.test(text) && /LIKE '%BLT%'/i.test(text)) return [[]];
      if (/COUNT\(DISTINCT t\.id\) AS fallas_blt_periodo/i.test(text)) {
        return [[{ numero_equipo: 'EQ-21', fallas_blt_periodo: 2 }]];
      }
      if (/COUNT\(\*\) AS total[\s\S]*FROM portafolio/i.test(text)) {
        assert.equal(params[0], 'EQ-21');
        return [[{ total: 1, zonas_nulas: 0, zonas_distintas: 1, zona_id: 7 }]];
      }
      throw new Error(`Consulta no preparada: ${text}`);
    }
  };
  const { service, emitted } = loadService({ db });
  const summary = await service.processAfterSync_uni({
    candidateIds: [21],
    receivedCandidateIds: [21],
    candidateOrder: new Map([[21, 0]]),
    beforeTickets: new Map([[21, before]]),
    criticalBefore: new Map([['EQ-21', { fallas: 3 }]])
  }, { id_SB: 99 });

  assert.equal(summary.equipo_sale_de_critico, 1);
  assert.equal(summary.eventos.length, 1);
  assert.equal(summary.eventos[0].codigo_evento, 'EQUIPO_SALE_DE_CRITICO');
  assert.equal(summary.eventos[0].fallas_blt_35d_antes, 3);
  assert.equal(summary.eventos[0].fallas_blt_35d_despues, 2);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].codigoEvento, 'EQUIPO_SALE_DE_CRITICO');
});

test('el proceso compara estado critico posterior y reserva el Ticket disparador como ganador nativo', () => {
  const source = read('backend/src/services/notifications/ticket-critical-notifications_uni.service.js');
  assert.match(source, /criticalAfter\s*=\s*await listCriticalState_uni/);
  assert.match(source, /detectCriticalExitTransitions_uni\(criticalBefore, criticalAfter\)/);
  assert.match(source, /nativeWinnerTicketIds\.add\(triggerTicketId\)/);
  assert.match(source, /equipo_sale_de_critico:\s*0/);
});

test('SQL de aplicacion registra el evento pero no inventa matriz Evento-Rol', () => {
  const sql = read('sql/APLICAR_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql');
  assert.match(sql, /EQUIPO_SALE_DE_CRITICO/);
  assert.match(sql, /Equipos Criticos/);
  assert.match(sql, /SALIDA_CRITICO/);
  assert.match(sql, /ABRIR_TICKET/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+notificacion_evento_roles/i);
});

test('rollback conserva historial y desactiva evento/matriz sin borrar', () => {
  const sql = read('sql/ROLLBACK_EQUIPO_SALE_DE_CRITICO_FASE_1_V001.sql');
  assert.match(sql, /UPDATE\s+notificacion_evento_roles[\s\S]*activo\s*=\s*0/i);
  assert.match(sql, /UPDATE\s+notificacion_eventos[\s\S]*activo\s*=\s*0/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM/i);
});

test('Fase 1 no introduce scheduler ni resuelve vencimiento por paso del tiempo', () => {
  const source = read('backend/src/services/notifications/ticket-critical-notifications_uni.service.js');
  assert.doesNotMatch(source, /require\(['"](?:node-cron|node-schedule|agenda)['"]\)|setInterval\s*\(/i);
});
