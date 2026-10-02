'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const repositoryPath = path.join(ROOT, 'backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js');
const servicePath = path.join(ROOT, 'backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js');

const originalLoad = Module._load;
Module._load = function phaseFixLoad(request, parent, isMain) {
  if (request === '../../config/db' && parent && /cobranza-cor-pagos-modulo\.repository\.js$/.test(parent.filename)) {
    return { getConnection() { throw new Error('DB real no disponible en prueba aislada.'); } };
  }
  if (request === './cobranza-cor-pagos.repository' && parent && /cobranza-cor-pagos-modulo\.repository\.js$/.test(parent.filename)) {
    return {
      TABLE_PAGOS_COR: 'cobranza_pagos_cor',
      async listRelacionesPagoForUpdate_cor() { return []; }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const repository = require(repositoryPath);
Module._load = originalLoad;

const fullScope = { dominio: 'CORELLIAN', acceso_dominio_completo: true };

test('catalogo usa exclusivamente Fuente y agrupa por id_proyecto_origen', () => {
  const source = read('backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js');
  assert.match(source, /const TABLE_FUENTE_COR = 'cobranza_fuente_cor'/);
  assert.match(source, /FROM \$\{TABLE_FUENTE_COR\} f/);
  assert.match(source, /GROUP BY UPPER\(TRIM\(f\.id_proyecto_origen\)\)/);
  assert.doesNotMatch(source, /FROM ins_fl fl/);
});

test('listado agrupado de proyectos no aplica limite artificial', async () => {
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [[{ ppns: 'P100', proyecto: 'Proyecto Uno', cliente: 'Cliente Uno' }]];
    }
  };
  const rows = await repository.listProyectosPagos_cor(connection, null);
  assert.equal(rows.length, 1);
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0].sql, /\bLIMIT\b/i);
  assert.deepEqual(queries[0].params, []);
});

test('servicio devuelve toda la agrupacion e ignora el limit heredado', async () => {
  const repositoryStub = {
    TABLE_PAGOS_COR: 'cobranza_pagos_cor',
    TABLE_FUENTE_COR: 'cobranza_fuente_cor',
    async getConnection_cor() {
      return { release() {} };
    },
    async listProyectosPagos_cor(_connection, buscar) {
      assert.equal(buscar, null);
      return [
        { ppns: 'P100', proyecto: 'Proyecto Uno', cliente: 'Cliente Uno' },
        { ppns: 'P200', proyecto: 'Proyecto Dos', cliente: 'Cliente Dos' }
      ];
    }
  };

  const saved = require.cache[repositoryPath];
  require.cache[repositoryPath] = { id: repositoryPath, filename: repositoryPath, loaded: true, exports: repositoryStub };
  delete require.cache[servicePath];
  const service = require(servicePath);

  try {
    const out = await service.listarProyectos_cor({ limit: '2000' }, fullScope);
    assert.equal(out.ok, true);
    assert.equal(out.source_table, 'cobranza_fuente_cor');
    assert.equal(out.grouped_by, 'id_proyecto_origen');
    assert.equal(out.total_proyectos, 2);
    assert.equal(out.data.length, 2);
  } finally {
    delete require.cache[servicePath];
    if (saved) require.cache[repositoryPath] = saved;
    else delete require.cache[repositoryPath];
  }
});

test('frontend solicita el catalogo agrupado sin parametro limit', () => {
  const frontend = read('modules/cobranza-cor/cobranza-cor-pagos.js');
  assert.match(frontend, /apiGet_cor\(API_PATH\+'\/proyectos'\)/);
  assert.doesNotMatch(frontend, /proyectos\?limit=/);
});
