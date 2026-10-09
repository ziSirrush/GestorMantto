'use strict';
// [Aster | 2026-10-09 | ASTER-MG | HOTFIX_INSTALACIONES_ADMINISTRACION_ONLY_FULL_GROUP_BY_V001]
// No external network or database required.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const REPOSITORY_PATH = path.resolve(__dirname, '../backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js');

function loadRepositoryWithMockDb_cor() {
  const calls = [];
  const db = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/SELECT COUNT\(\*\) AS total FROM \(/.test(sql)) return [[{ total: 1 }]];
      return [[{ project_key: 'P:123', id_proyecto: '123', proyecto: 'Proyecto de prueba', equipos: 2 }]];
    }
  };
  const originalLoad = Module._load;
  let repository;
  try {
    delete require.cache[REPOSITORY_PATH];
    Module._load = function(request, parent, isMain) {
      if (parent && parent.filename === REPOSITORY_PATH) {
        if (request === '../../config/db') return db;
        if (request === './instalaciones-administracion.constants') {
          return { ALL_OPERATIONAL_FIELDS_COR: ['proyecto', 'id_proyecto', 'estatus', 'id_sup'] };
        }
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    repository = require(REPOSITORY_PATH);
  } finally {
    Module._load = originalLoad;
    delete require.cache[REPOSITORY_PATH];
  }
  return { repository, calls };
}

test('FIX SQL: SELECT agrupado ordena por una expresion agregada', async () => {
  const { repository, calls } = loadRepositoryWithMockDb_cor();
  const result = await repository.listProjects_cor({
    scope: { mode: 'ALL' }, search: '', estatus: '', supervisor: '',
    visibleFields: ['id_proyecto', 'proyecto'], limit: 20, offset: 0
  });
  assert.equal(result.total, 1);
  assert.equal(result.data[0].equipos, 2);
  assert.equal(calls.length, 2);
  const sql = calls[1].sql;
  assert.match(sql, /GROUP BY project_key/);
  assert.match(sql, /MIN\(NULLIF\(TRIM\(f\.proyecto\), ''\)\) AS proyecto/);
  assert.match(sql, /ORDER BY COALESCE\(MIN\(NULLIF\(TRIM\(f\.proyecto\), ''\)\), ''\) ASC, project_key ASC/);
  assert.doesNotMatch(sql, /ORDER BY COALESCE\(proyecto,/);
  assert.deepEqual(calls[1].values.slice(-2), [20, 0]);
});

test('FIX SQL: filtros parametrizados conservan alcance CORELLIAN', async () => {
  const { repository, calls } = loadRepositoryWithMockDb_cor();
  await repository.listProjects_cor({
    scope: { mode: 'LIMITED', advisorIds: [7] },
    search: 'Proyecto', estatus: 'En proceso', supervisor: '8',
    visibleFields: ['proyecto', 'id_proyecto', 'estatus', 'id_sup'],
    limit: 10, offset: 0
  });
  const query = calls[1];
  assert.match(query.sql, /f\.id_sup IN \(\?\)/);
  assert.match(query.sql, /TRIM\(f\.estatus\) = \?/);
  assert.match(query.sql, /f\.id_sup = \?/);
  assert.match(query.sql, /ORDER BY COALESCE\(MIN\(/);
  assert.doesNotMatch(query.sql, /Proyecto|En proceso/);
  assert.equal(query.values.at(-2), 10);
  assert.equal(query.values.at(-1), 0);
});
