'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const queries = [];
const fakeDb = {
  async query(sql, params) {
    queries.push({ sql:String(sql), params:params || [] });
    if (/SELECT lote_importacion AS loteImportacion/.test(sql)) {
      return [[{
        loteImportacion:'lote-activo-001', archivoOrigen:'inventario.xlsx', fechaCorte:'2026-08-30',
        fechaImportacion:'2026-08-30T20:00:00.000Z', hashArchivo:'abc', filas:8
      }]];
    }
    if (/SELECT tipo_registro AS tipoRegistro/.test(sql)) {
      return [[{ tipoRegistro:'INVENTARIO', hojaOrigen:'Inventario', filas:8, encabezadosJson:'[]', mapeoJson:'{}' }]];
    }
    if (/COUNT\(\*\) AS referencias/.test(sql) && /GROUP BY empresa, almacen/.test(sql)) {
      return [[
        { empresa:'Corellian', almacen:'ALM-CEN', tipo:'Central', referencias:4, piezas:24, valorEsperado:2750 },
        { empresa:'United', almacen:'ALM-NOR', tipo:'Regional', referencias:2, piezas:5, valorEsperado:null }
      ]];
    }
    if (/MAX\(id\) AS sourceId/.test(sql)) {
      assert.deepStrictEqual(params, ['Corellian','ALM-CEN']);
      return [[
        { sourceId:1, codigo:'A-1', articulo:'Motor', categoria:'Mecánico', tipoAlmacen:'Central', empresa:'Corellian', almacen:'ALM-CEN', esperado:10, valorEsperado:1000 },
        { sourceId:2, codigo:'A-2', articulo:'Tarjeta', categoria:'Eléctrico', tipoAlmacen:'Central', empresa:'Corellian', almacen:'ALM-CEN', esperado:5, valorEsperado:900 },
        { sourceId:3, codigo:'A-3', articulo:'Sensor', categoria:'Eléctrico', tipoAlmacen:'Central', empresa:'Corellian', almacen:'ALM-CEN', esperado:6, valorEsperado:600 },
        { sourceId:4, codigo:'A-4', articulo:'Tornillo', categoria:'Mecánico', tipoAlmacen:'Central', empresa:'Corellian', almacen:'ALM-CEN', esperado:3, valorEsperado:250 }
      ]];
    }
    throw new Error('Consulta no simulada: ' + String(sql).slice(0,180));
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return fakeDb;
  if (request === './xlsx-lite') return { parseXlsxSheets(){ return []; }, parseCsv(){ return []; } };
  return originalLoad.apply(this, arguments);
};

(async function(){
  const servicePath = path.resolve(__dirname, '../backend/src/modules/almacen/almacen.service.js');
  const service = require(servicePath);
  const catalogs = await service.getAuditCatalogs();
  assert.strictEqual(catalogs.ok, true);
  assert.strictEqual(catalogs.available, true);
  assert.strictEqual(catalogs.source.loteImportacion, 'lote-activo-001');
  assert.strictEqual(catalogs.warehouses.length, 2);
  assert.strictEqual(catalogs.warehouses[0].warehouse, 'ALM-CEN');
  assert.strictEqual(catalogs.warehouses[1].expectedValue, null);

  const sample = await service.getAuditSample({ company:'Corellian', warehouse:'ALM-CEN' });
  assert.strictEqual(sample.ok, true);
  assert.strictEqual(sample.sample.totalReferences, 4);
  assert.strictEqual(sample.sample.sampleSize, 3);
  assert.strictEqual(sample.sample.methodology.percentage, 5);
  assert.strictEqual(sample.sample.methodology.byValuePercent, 70);
  assert.strictEqual(sample.sample.methodology.randomPercent, 30);
  assert.strictEqual(sample.sample.items.length, 3);
  assert.ok(sample.sample.items.every(item => item.company === 'Corellian' && item.warehouse === 'ALM-CEN'));
  assert.ok(sample.sample.items.every(item => Number.isFinite(item.expected) && item.expected > 0));

  const writes = queries.filter(q => /\b(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER|CREATE)\b/i.test(q.sql));
  assert.deepStrictEqual(writes, []);
  console.log('OK fase4_auditoria_smoke');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => { Module._load = originalLoad; });
