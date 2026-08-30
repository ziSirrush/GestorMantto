'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const servicePath = path.join(repo, 'backend', 'src', 'modules', 'almacen', 'almacen.service.js');
let currentSheets = [];
let dbTouched = false;

const fakeDb = {
  async query(){ dbTouched = true; throw new Error('DB must not be used by validateImport'); },
  async getConnection(){ dbTouched = true; throw new Error('DB must not be used by validateImport'); }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain){
  if(request === '../../config/db') return fakeDb;
  if(request === './xlsx-lite') return {
    parseXlsxSheets(){ return currentSheets; },
    parseCsv(){ return currentSheets[0] || { sheetName:'CSV', rows:[] }; }
  };
  return originalLoad.call(this, request, parent, isMain);
};

(async function(){
  delete require.cache[require.resolve(servicePath)];
  const service = require(servicePath);
  const file = { originalname:'qa.xlsx', buffer:Buffer.from('qa-fixture') };

  currentSheets = [{ sheetName:'Hoja Rara', rows:[['Foo','Bar','Baz'],['1','2','3']] }];
  let badHeader = null;
  try { await service.validateImport(file, '2026-08-30'); } catch(error) { badHeader = error; }
  assert.ok(badHeader, 'Encabezados invalidos deben fallar');
  assert.strictEqual(badHeader.status, 422);
  assert.deepStrictEqual(badHeader.details.sheets, ['Hoja Rara']);

  currentSheets = [{
    sheetName:'Inventario',
    rows:[
      ['SKU','Descripcion','Subsidiaria','Bodega','Existencia','Costo unitario'],
      ['A-1','Motor','Corellian','CENTRAL','10','25.5']
    ]
  }];
  const ok = await service.validateImport(file, '2026-08-30');
  assert.strictEqual(ok.valid, true);
  assert.strictEqual(ok.inventoryRows, 1);
  assert.strictEqual(ok.mapping.codigo.header, 'SKU');
  assert.strictEqual(ok.mapping.empresa.header, 'Subsidiaria');
  assert.strictEqual(ok.mapping.almacen.header, 'Bodega');
  assert.strictEqual(ok.mapping.fisico.header, 'Existencia');

  currentSheets = [{
    sheetName:'Inventario',
    rows:[
      ['Codigo','Articulo','Empresa','Almacen','Fisico'],
      ['A-2','Sensor','United','NORTE','no-numero']
    ]
  }];
  let badNumber = null;
  try { await service.validateImport(file, '2026-08-30'); } catch(error) { badNumber = error; }
  assert.ok(badNumber, 'Fisico no numerico debe fallar');
  assert.strictEqual(badNumber.status, 422);
  assert.strictEqual(badNumber.details.quality.fisicoNoNumerico, 1);
  assert.ok(Array.isArray(badNumber.details.headers));
  assert.strictEqual(dbTouched, false, 'Validar encabezados no debe tocar Aiven');

  console.log('PASS fase5_headers_smoke');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
