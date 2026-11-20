'use strict';

// Regression for Azure MySQL 1267 (ER_CANT_AGGREGATE_2COLLATIONS).
// No production Aiven access, network calls, or database writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dbPath = require.resolve(path.join(root, 'backend/src/config/db.js'));
let includeCatalog = true;
let queries = [];
const fakeDb = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('SELECT id_lote AS loteImportacion') && sql.includes('FROM almacen_ns_lotes')) {
      return [[{ loteImportacion: 'inventario-actual', fechaCorte: '2026-11-04', fechaImportacion: '2026-11-05' }]];
    }
    if (sql.includes('SELECT COUNT(*) AS filas FROM almacen_ns_inventario')) return [[{ filas: 15844 }]];
    if (sql.includes('SELECT id_lote AS idLote FROM almacen_ns_lotes')) {
      return [includeCatalog ? [{ idLote: 'catalogo-publicado' }] : []];
    }
    return [[]];
  }
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
const ns = require(path.join(root, 'backend/src/modules/almacen/almacen.ns-query-service.js'));
const scope = { subsidiaryIds: ['2', '3', '5'] };

const textFields = ['codigo', 'articulo', 'categoria', 'ag', 'empresa', 'idSubsidiariaNs', 'almacen'];
const collate = expr => `MAX(CONVERT(${expr} USING utf8mb4) COLLATE utf8mb4_unicode_ci)`;

test('las consultas de Almacen normalizan MAX de texto con y sin catalogo publicado', async () => {
  for (const catalog of [true, false]) {
    includeCatalog = catalog;
    queries = [];
    await ns.getDashboard(scope);
    await ns.getInventory(scope, { page: 1, pageSize: 30, stockOnly: true });
    await ns.getStock(scope);
    await ns.getTop(scope);
    await ns.getCatalogs(scope);
    await ns.getAuditCatalogs(scope);

    const aggregated = queries.filter(entry => entry.sql.includes('SELECT MIN(v.id) AS id'));
    assert.ok(aggregated.length >= 5, 'se generaron consultas agrupadas reales');
    for (const { sql, params } of aggregated) {
      for (const field of textFields) {
        assert.ok(sql.includes(collate(`v.${field}`)), `MAX de ${field} debe tener collation explicita`);
      }
      assert.ok(sql.includes('MAX(v.idArticuloNs)'), 'conservar agregados numericos');
      assert.ok(sql.includes('i.id_subsidiaria_ns IN (?)'), 'conservar filtro de dominio');
      assert.deepEqual(params.find(value => Array.isArray(value)), scope.subsidiaryIds);
      if (catalog) {
        assert.ok(sql.includes('LEFT JOIN ('), 'catalogo publicado activo');
        assert.ok(sql.includes(collate("NULLIF(TRIM(categoria_articulo),'')")));
        assert.ok(sql.includes(collate("NULLIF(TRIM(numero_parte_fabricante_original),'')")));
      } else {
        assert.ok(!sql.includes('LEFT JOIN ('), 'sin catalogo no hay JOIN');
      }
    }
  }
});


test('el listado usa el conteo de su mismo resumen y ejecuta solo dos agregaciones filtradas', async () => {
  const oldFlag = process.env.BLT_OPT_ALMACEN_INVENTORY_COUNT_V1;
  process.env.BLT_OPT_ALMACEN_INVENTORY_COUNT_V1='1';
  const previousQuery = fakeDb.query;
  const previousCatalog = includeCatalog;
  const executed = [];
  try {
    includeCatalog = false;
    fakeDb.query = async (sql, params = []) => {
      executed.push({ sql, params });
      if (sql.includes('SELECT id_lote AS loteImportacion') && sql.includes('FROM almacen_ns_lotes')) {
        return [[{ loteImportacion: 'inventario-actual', fechaCorte: '2026-11-04', fechaImportacion: '2026-11-05' }]];
      }
      if (sql.includes('SELECT COUNT(*) AS filas FROM almacen_ns_inventario')) return [[{ filas: 3 }]];
      if (sql.includes('SELECT id_lote AS idLote FROM almacen_ns_lotes')) return [[]];
      if (sql.includes('SELECT * FROM (SELECT MIN(v.id) AS id')) {
        return [[{ id: 3, codigo: 'REF-3', fisico: '7', valor: '70.00' }]];
      }
      if (sql.includes('SELECT COUNT(*) AS registros,COALESCE(SUM(fisico),0) AS piezas')) {
        return [[{ registros: 2, piezas: '12', filasConValor: 2, valorTotal: '120.00' }]];
      }
      throw new Error('Consulta SQL inesperada: ' + sql);
    };
    const result = await ns.getInventory(scope, {
      page: 2, pageSize: 1, company: 'CORELLIAN', stockOnly: true,
      minValue: 10, maxValue: 100
    });
    const grouped = executed.filter(({ sql }) => sql.includes('SELECT MIN(v.id) AS id'));
    assert.equal(grouped.length, 2, 'lista y resumen: dos consultas, nunca tres');
    assert.equal(grouped.filter(({ sql }) => sql.includes('COUNT(*) AS registros')).length, 1);
    assert.equal(grouped.filter(({ sql }) => sql.includes('COUNT(*) AS total')).length, 0);
    assert.deepEqual(result.pagination, { page: 2, pageSize: 1, total: 2, pages: 2 });
    assert.deepEqual(result.summary, { registros: 2, piezas: 12, valorTotal: 120 });
    assert.equal(result.rows[0].fisico, 7);
    assert.equal(result.rows[0].valor, 70);
    for (const { sql, params } of grouped) {
      assert.match(sql, /id_subsidiaria_ns IN \(\?\)/);
      assert.match(sql, /v\.empresa=\?/);
      assert.match(sql, /g\.valor>=\?/);
      assert.match(sql, /g\.valor<=\?/);
      assert.match(sql, /g\.fisico>0/);
      assert.ok(params.some(value => Array.isArray(value) && value.join(',') === '2,3,5'));
    }
  } finally {
    fakeDb.query = previousQuery;
    includeCatalog = previousCatalog;
    if(oldFlag===undefined)delete process.env.BLT_OPT_ALMACEN_INVENTORY_COUNT_V1;
    else process.env.BLT_OPT_ALMACEN_INVENTORY_COUNT_V1=oldFlag;
  }
});
