'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const JOB_PATH = path.join(ROOT, 'backend/src/jobs/equiposCriticosSalidaU35.job.js');

function loadJob() {
  const original = Module._load;
  const dbStub = { async query() { throw new Error('DB real no debe usarse en prueba dirigida.'); } };
  const loggerStub = { info() {}, warn() {}, error() {} };
  Module._load = function patched(request, parent, isMain) {
    if (request === '../config/db') return dbStub;
    if (request === '../shared/logger') return loggerStub;
    if (request === '../services/notifications/notification-business-emitter.service') {
      return { async emitBusinessEventSafe_gnral() { return { created: 0, skipped: 0 }; } };
    }
    if (request === '../services/notifications/notification-site-label.service') {
      return {
        siteLabel_gnral(row) {
          const p = String(row?.proyecto || '').trim();
          const r = String(row?.identificacion_sitio || '').trim();
          return p && r ? `${p} - ${r}` : (p || r || 'Sitio sin referencia');
        }
      };
    }
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(JOB_PATH)];
    return require(JOB_PATH);
  } finally {
    Module._load = original;
    delete require.cache[require.resolve(JOB_PATH)];
  }
}

const job = loadJob();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('conserva regla 3 fallas BLT / 35 dias y codigo del evento', () => {
  assert.equal(job.EVENT_CODE, 'EQUIPO_SALE_DE_CRITICO');
  assert.equal(job.CRITICOS_DIAS, 35);
  assert.equal(job.CRITICOS_MIN_FALLAS, 3);
});

test('previousYmd cruza correctamente mes y anio', () => {
  assert.equal(job.previousYmd('2026-09-01'), '2026-08-31');
  assert.equal(job.previousYmd('2026-01-01'), '2025-12-31');
});

test('antes de las 00:10 CDMX recupera el dia anterior', () => {
  const due = job.latestDueDate(new Date('2026-09-29T06:05:00.000Z'));
  assert.equal(due.date, '2026-09-28');
  assert.equal(due.previous_date, '2026-09-27');
  assert.equal(due.recovery, true);
});

test('despues de las 00:10 CDMX procesa el dia actual', () => {
  const due = job.latestDueDate(new Date('2026-09-29T06:15:00.000Z'));
  assert.equal(due.date, '2026-09-29');
  assert.equal(due.previous_date, '2026-09-28');
  assert.equal(due.recovery, false);
});

test('consulta reconstruye ayer vs hoy sin tabla nueva', async () => {
  let sql = '';
  let params = null;
  const fakeDb = {
    async query(query, values) {
      sql = String(query);
      params = values;
      return [[{
        id_portafolio: 55,
        numero_equipo: 'EQ-55',
        proyecto: 'Proyecto 55',
        identificacion_sitio: 'Lobby',
        zona_id: 7,
        fallas_blt_antes: 3,
        fallas_blt_despues: 2
      }]];
    }
  };

  const rows = await job.listTimeExpiredTransitions('2026-09-29', fakeDb);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].transicion, 'CRITICO_A_NO_CRITICO_POR_U35');
  assert.equal(rows[0].fallas_blt_antes, 3);
  assert.equal(rows[0].fallas_blt_despues, 2);
  assert.deepEqual(params, [
    '2026-09-28', '2026-09-28',
    '2026-09-29', '2026-09-29',
    '2026-09-29', '2026-09-29'
  ]);
  assert.match(sql, /INTERVAL 35 DAY/);
  assert.match(sql, /INTERVAL 36 DAY/);
  assert.match(sql, /UPPER\(COALESCE\(t\.responsabilidad, ''\)\) LIKE '%BLT%'/);
  assert.match(sql, /p\.estado_registro\s*=\s*1/i);
  assert.match(sql, /NO EN SERVICIO/i);
  assert.match(sql, /HAVING fallas_blt_antes >= 3[\s\S]*fallas_blt_despues < 3/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i);
});

test('clave de deduplicacion es estable por equipo y fecha', () => {
  const row = { numero_equipo: 'EQ-55', fallas_blt_antes: 3, fallas_blt_despues: 2 };
  assert.equal(job.eventInstanceKey(row, '2026-09-29'), job.eventInstanceKey(row, '2026-09-29'));
  assert.notEqual(job.eventInstanceKey(row, '2026-09-29'), job.eventInstanceKey(row, '2026-09-30'));
});

test('emision automatica usa matriz normal, ZOP y destino Equipos Criticos', async () => {
  let payload = null;
  let context = null;
  const row = {
    id_portafolio: 55,
    numero_equipo: 'EQ-55',
    proyecto: 'Proyecto 55',
    identificacion_sitio: 'Lobby',
    zona_id: 7,
    fallas_blt_antes: 3,
    fallas_blt_despues: 2
  };
  const result = await job.emitTransition(row, '2026-09-29', [10, 20], {
    async emit(input, ctx) {
      payload = input;
      context = ctx;
      return { ok: true, created: 2, skipped: 0, trace_id: 'trace-test' };
    }
  });

  assert.equal(result.created, 2);
  assert.equal(payload.codigoEvento, 'EQUIPO_SALE_DE_CRITICO');
  assert.deepEqual(payload.destinatarios, [10, 20]);
  assert.equal(payload.zonaOperativaId, 7);
  assert.equal(payload.requireRoleMatrix, true);
  assert.equal(payload.allowMissingEvent, true);
  assert.equal(payload.accion, 'ABRIR_MODULO');
  assert.equal(payload.ruta, 'criticos');
  assert.equal(payload.contextoSeguimiento.dominio, 'UNITED');
  assert.equal(payload.contextoSeguimiento.tipo, 'EQUIPO');
  assert.equal(payload.contextoSeguimiento.id_portafolio, 55);
  assert.equal(payload.contextoSeguimiento.numero_equipo, 'EQ-55');
  assert.match(payload.mensaje, /Proyecto 55 - Lobby/);
  assert.match(payload.mensaje, /2 fallas BLT/);
  assert.match(payload.eventInstanceKey, /critical-exit-u35:EQ-55:date:2026-09-29/);
  assert.equal(context.label, 'critical-exit-u35:EQUIPO_SALE_DE_CRITICO');
});

test('transicion sin equipo o ZOP falla cerrado sin emitir', async () => {
  let calls = 0;
  const result = await job.emitTransition({ numero_equipo: 'EQ-X', zona_id: null }, '2026-09-29', [10], {
    async emit() { calls += 1; return {}; }
  });
  assert.equal(calls, 0);
  assert.equal(result.reason, 'EQUIPO_O_ZONA_NO_RESUELTOS');
});

test('run sin transiciones no consulta usuarios ni emite', async () => {
  let usersCalls = 0;
  let emitCalls = 0;
  const result = await job.runCriticalExitU35('2026-09-29', {
    db: {},
    async listTransitions() { return []; },
    async listUsers() { usersCalls += 1; return [10]; },
    async emit() { emitCalls += 1; return {}; }
  });
  assert.equal(result.transiciones, 0);
  assert.equal(usersCalls, 0);
  assert.equal(emitCalls, 0);
});

test('run procesa cada equipo una sola vez y resume resultados', async () => {
  const emitted = [];
  const result = await job.runCriticalExitU35('2026-09-29', {
    db: {},
    async listTransitions() {
      return [
        { id_portafolio: 1, numero_equipo: 'EQ-1', proyecto: 'P1', identificacion_sitio: 'A', zona_id: 7, fallas_blt_antes: 3, fallas_blt_despues: 2 },
        { id_portafolio: 2, numero_equipo: 'EQ-2', proyecto: 'P2', identificacion_sitio: 'B', zona_id: 8, fallas_blt_antes: 4, fallas_blt_despues: 2 }
      ];
    },
    async listUsers() { return [10, 20]; },
    async emit(input) {
      emitted.push(input);
      return { created: 1, skipped: 1, trace_id: `trace-${emitted.length}` };
    }
  });
  assert.equal(emitted.length, 2);
  assert.equal(result.transiciones, 2);
  assert.equal(result.notificaciones_creadas, 2);
  assert.equal(result.notificaciones_omitidas, 2);
  assert.equal(result.eventos.length, 2);
  assert.equal(result.eventos[0].codigo_evento, 'EQUIPO_SALE_DE_CRITICO');
});

test('job no crea ni escribe tabla de snapshots', () => {
  const source = read('backend/src/jobs/equiposCriticosSalidaU35.job.js');
  assert.doesNotMatch(source, /CREATE\s+TABLE|INSERT\s+INTO\s+.*crit|UPDATE\s+.*crit|DELETE\s+FROM/i);
  assert.doesNotMatch(source, /snapshot/i);
  assert.match(source, /listTimeExpiredTransitions/);
});

test('bootstrap inicia y detiene el job nuevo', () => {
  const source = read('backend/src/bootstrap.js');
  assert.match(source, /startEquiposCriticosSalidaU35Job/);
  assert.match(source, /stopEquiposCriticosSalidaU35Job/);
  assert.match(source, /startScheduledJobs/);
  assert.match(source, /stopEquiposCriticosSalidaU35Job\(\)/);
});

test('fase 2 convive con la logica del sync de Fase 1 sin reemplazarla', () => {
  const phase1Path = path.join(ROOT, 'backend/src/services/notifications/ticket-critical-notifications_uni.service.js');
  assert.equal(fs.existsSync(phase1Path), true);

  const phase1 = read('backend/src/services/notifications/ticket-critical-notifications_uni.service.js');
  const phase2 = read('backend/src/jobs/equiposCriticosSalidaU35.job.js');

  assert.match(phase1, /EVENT_EQUIPO_SALE_DE_CRITICO_UNI\s*=\s*'EQUIPO_SALE_DE_CRITICO'/);
  assert.match(phase1, /processAfterSync_uni/);
  assert.match(phase2, /listTimeExpiredTransitions/);
  assert.doesNotMatch(phase2, /processAfterSync_uni/);
});
