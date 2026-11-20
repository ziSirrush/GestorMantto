'use strict';

// Verifica ambas versiones de consulta sin tocar Aiven/Azure.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '../src');
const dbPath = require.resolve(path.join(root, 'config/db.js'));
const scopePath = require.resolve(path.join(root, 'services/information-record-scope-gnral.service.js'));
const repoPath = require.resolve(path.join(root, 'modules/dashboard-callcenter/dashboard-callcenter.repository.js'));
const originalDb = require.cache[dbPath];
const originalScope = require.cache[scopePath];
const originalRepo = require.cache[repoPath];
const oldFlag = process.env.BLT_OPT_CC_U365_WINDOW_COUNT;
const calls = [];
let fixture = [];
const db = {
  query: async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('COUNT(*) OVER()')) return [fixture];
    if (sql.startsWith('SELECT COUNT(*) AS total')) return [[{ total: 4 }]];
    if (sql.startsWith('SELECT * FROM (')) return [[{ numero_equipo: 'EQ-1', proyecto: 'P-1', llamadas_365: 2 }]];
    throw new Error('SQL inesperado: ' + sql);
  }
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
require.cache[scopePath] = { id: scopePath, filename: scopePath, loaded: true,
  exports: {
    buildPortafolioScopeSql_gnral: () => ({ sql: 'p.zona_id IN (?)', params: [[1, 2]] }),
    buildPortafolioScopeSqlInline_gnral: () => ({ sql: '1=1', params: [] }),
    buildTicketScopeSql_gnral: () => ({ sql: '1=1', params: [] })
  }
};
delete require.cache[repoPath];
const repository = require(repoPath);
const req = { user: { criticos_fallas: 3, criticos_periodo: 35 }, query: { page: '1', page_size: '50' } };
const reset = () => { calls.length = 0; fixture = []; };

test('U365 equipos: optimizacion entrega total exacto con una sola consulta y no expone columna auxiliar', async () => {
  reset();
  process.env.BLT_OPT_CC_U365_WINDOW_COUNT = '1';
  fixture = [{numero_equipo:'EQ-1', proyecto:'P-1',llamadas_365:2,__blt_total:'4'}];
  const result = await repository.getCallCenterU365Equipos(req);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /COUNT\(\*\) OVER\(\)/);
  assert.match(calls[0].sql, /p\.zona_id IN \(\?\)/);
  assert.deepEqual(calls[0].params.find(Array.isArray), [1, 2]);
  assert.deepEqual(result.pagination, { page:1, page_size:50, total:4 });
  assert.deepEqual(result.rows, [{numero_equipo:'EQ-1',proyecto:'P-1',llamadas_365:2}]);
});

test('U365 proyectos: pagina fuera de rango preserva el total con conteo de respaldo', async () => {
  reset();
  process.env.BLT_OPT_CC_U365_WINDOW_COUNT = '1';
  const result = await repository.getCallCenterU365Proyectos({...req,query:{page:'100',page_size:'50'}});
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /COUNT\(\*\) OVER\(\)/);
  assert.match(calls[1].sql, /SELECT COUNT\(\*\) AS total/);
  assert.equal(result.pagination.total, 4);
  assert.deepEqual(result.rows, []);
});

test('U365 mantiene ruta legacy con la bandera desactivada', async () => {
  reset();
  process.env.BLT_OPT_CC_U365_WINDOW_COUNT = '0';
  const result = await repository.getCallCenterU365Equipos(req);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({sql}) => !sql.includes('OVER()')));
  assert.equal(result.pagination.total, 4);
});

test.after(() => {
  if (oldFlag === undefined) delete process.env.BLT_OPT_CC_U365_WINDOW_COUNT;
  else process.env.BLT_OPT_CC_U365_WINDOW_COUNT = oldFlag;
  if (originalDb) require.cache[dbPath] = originalDb; else delete require.cache[dbPath];
  if (originalScope) require.cache[scopePath] = originalScope; else delete require.cache[scopePath];
  if (originalRepo) require.cache[repoPath] = originalRepo; else delete require.cache[repoPath];
});
