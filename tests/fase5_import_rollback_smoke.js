'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const servicePath = path.join(repo, 'backend', 'src', 'modules', 'almacen', 'almacen.service.js');

const sheets = [{
  sheetName:'Inventario',
  rows:[
    ['Codigo','Articulo','Empresa','Almacen','Fisico','Precio Unitario'],
    ['A-1','Motor','Corellian','CENTRAL',10,100],
    ['A-2','Sensor','United','NORTE',4,50]
  ]
}];

let failActivation = true;
let runs = [];

function makeConnection(){
  const events = [];
  const conn = {
    async beginTransaction(){ events.push('BEGIN'); },
    async commit(){ events.push('COMMIT'); },
    async rollback(){ events.push('ROLLBACK'); },
    release(){ events.push('RELEASE'); },
    async query(sql){
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if(/^INSERT INTO /.test(text)) { events.push('INSERT'); return [[], []]; }
      if(/SET activo=0 WHERE activo=1 AND lote_importacion<>\?/.test(text)) { events.push('DEACTIVATE_OLD'); return [[], []]; }
      if(/SET activo=1 WHERE lote_importacion=\?/.test(text)) {
        events.push('ACTIVATE_NEW');
        if(failActivation) throw new Error('Injected activation failure');
        return [[], []];
      }
      throw new Error('Unexpected SQL in rollback smoke: ' + text.slice(0, 180));
    }
  };
  runs.push(events);
  return conn;
}

const fakeDb = {
  async getConnection(){ return makeConnection(); },
  async query(){ return [[]]; }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain){
  if(request === '../../config/db') return fakeDb;
  if(request === './xlsx-lite') return {
    parseXlsxSheets(){ return sheets; },
    parseCsv(){ return sheets[0]; }
  };
  return originalLoad.call(this, request, parent, isMain);
};

(async function(){
  delete require.cache[require.resolve(servicePath)];
  const service = require(servicePath);
  const file = { originalname:'qa.xlsx', buffer:Buffer.from('qa-fixture') };

  let failure = null;
  try { await service.importSpreadsheet(file, '2026-08-30', 123); } catch(error) { failure = error; }
  assert.ok(failure, 'Fallo inyectado debe propagarse');
  const failed = runs[0];
  assert.deepStrictEqual(failed, ['BEGIN','INSERT','DEACTIVATE_OLD','ACTIVATE_NEW','ROLLBACK','RELEASE']);
  assert.ok(!failed.includes('COMMIT'));

  failActivation = false;
  const result = await service.importSpreadsheet(file, '2026-08-30', 123);
  assert.strictEqual(result.ok, true);
  const success = runs[1];
  assert.deepStrictEqual(success, ['BEGIN','INSERT','DEACTIVATE_OLD','ACTIVATE_NEW','COMMIT','RELEASE']);
  assert.ok(!success.includes('ROLLBACK'));

  console.log('PASS fase5_import_rollback_smoke');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
