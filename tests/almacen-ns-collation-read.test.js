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
