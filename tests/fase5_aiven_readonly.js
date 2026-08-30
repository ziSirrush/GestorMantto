'use strict';

const path = require('path');
const assert = require('assert');

const repo = path.resolve(process.argv[2] || '.');
const db = require(path.join(repo, 'backend', 'src', 'config', 'db'));

(async function(){
  const [lotRows] = await db.query(
    "SELECT COUNT(DISTINCT lote_importacion) AS activeLots, COUNT(*) AS activeRows FROM almacen_fuente_excel WHERE activo=1"
  );
  const activeLots = Number(lotRows[0]?.activeLots || 0);
  const activeRows = Number(lotRows[0]?.activeRows || 0);
  assert.strictEqual(activeLots, 1, 'Debe existir exactamente un lote activo. Encontrados: ' + activeLots);
  assert.ok(activeRows > 0, 'El lote activo no puede estar vacio.');

  const [datasets] = await db.query(
    "SELECT lote_importacion AS lot, tipo_registro AS type, COUNT(*) AS rowsCount FROM almacen_fuente_excel WHERE activo=1 GROUP BY lote_importacion, tipo_registro ORDER BY tipo_registro"
  );
  const inventory = datasets.find(row => row.type === 'INVENTARIO');
  assert.ok(inventory && Number(inventory.rowsCount) > 0, 'El lote activo debe contener INVENTARIO.');

  const [badRows] = await db.query(
    "SELECT COUNT(*) AS invalidRows FROM almacen_fuente_excel WHERE activo=1 AND tipo_registro='INVENTARIO' AND (NULLIF(TRIM(empresa),'') IS NULL OR NULLIF(TRIM(almacen),'') IS NULL OR (NULLIF(TRIM(codigo),'') IS NULL AND NULLIF(TRIM(articulo),'') IS NULL) OR fisico IS NULL)"
  );
  assert.strictEqual(Number(badRows[0]?.invalidRows || 0), 0, 'Hay filas INVENTARIO activas que violan el contrato minimo.');

  console.log('PASS fase5_aiven_readonly');
  console.log('Active lot:', inventory.lot);
  console.log('Active rows:', activeRows);
  console.log('Datasets:', datasets.map(row => row.type + '=' + row.rowsCount).join(', '));
})().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(async () => {
  try { if(db && typeof db.end === 'function') await db.end(); } catch(_error) {}
});
