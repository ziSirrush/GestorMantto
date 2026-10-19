'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dbPath = require.resolve(path.join(root, 'backend/src/config/db.js'));
const previousDb = require.cache[dbPath];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };

const guardPath = path.join(root, 'backend/src/modules/almacen/almacen.ns-access-guard.js');
const queryPath = path.join(root, 'backend/src/modules/almacen/almacen.ns-query-service.js');
const { SUBSIDIARIES, buildAlmacenNsScope } = require(guardPath);
const { readScope } = require(queryPath);

test.after(() => {
  delete require.cache[require.resolve(guardPath)];
  delete require.cache[require.resolve(queryPath)];
  if (previousDb) require.cache[dbPath] = previousDb;
  else delete require.cache[dbPath];
});

test('el ID confirmado de NUBIAN es 3', () => {
  assert.equal(SUBSIDIARIES.NUBIAN.id, '3');
});

test('la llave CORELLIAN autoriza solamente la subsidiaria 2', () => {
  const scope = buildAlmacenNsScope({ corellian: true, united: false });
  assert.deepEqual([...scope.subsidiaryIds], ['2']);
});

test('la llave UNITED autoriza solamente la subsidiaria 5', () => {
  const scope = buildAlmacenNsScope({ corellian: false, united: true });
  assert.deepEqual([...scope.subsidiaryIds], ['5']);
});

test('ambas llaves autorizan CORELLIAN, NUBIAN y UNITED', () => {
  const scope = buildAlmacenNsScope({ corellian: true, united: true });
  assert.deepEqual([...scope.subsidiaryIds], ['2', '3', '5']);
});

test('sin llaves maestras el alcance se niega', () => {
  assert.equal(buildAlmacenNsScope({ corellian: false, united: false }), null);
});

test('consultas, rutas y frontend conservan el alcance producido en backend', () => {
  const valid = buildAlmacenNsScope({ corellian: true, united: true });
  assert.deepEqual([...readScope({ almacenNsScope: valid }).subsidiaryIds], ['2', '3', '5']);
  assert.throws(
    () => readScope({ almacenNsScope: { masterKeys: { corellian: false, united: false }, subsidiaryIds: ['3'] } }),
    (error) => error?.code === 'ALMACEN_NS_SCOPE_UNRESOLVED'
  );

  const querySource = fs.readFileSync(queryPath, 'utf8');
  const routesSource = fs.readFileSync(path.join(root, 'backend/src/modules/almacen/almacen.routes.js'), 'utf8');
  const frontendSource = fs.readFileSync(path.join(root, 'modules/almacen/almacen.js'), 'utf8');
  assert.match(querySource, /id_subsidiaria_ns IN \(\?\)/);
  assert.match(routesSource, /almacenNsAccessGuard/);
  assert.doesNotMatch(frontendSource, /\['Corellian','Nubian','United'\]/);
});
