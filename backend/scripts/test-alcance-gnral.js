'use strict';

const assert = require('assert');
const path = require('path');

const alcance = require(path.join(
  __dirname,
  '..',
  'src',
  'services',
  'alcance',
  'alcance-gnral.service'
));

function run() {
  const req = {
    user: { id_SB: 10, correo: 'actor@blt.test', iniciales: 'ACT' },
    contextUser: { id_SB: 25, correo: 'Viewer@BLT.Test ', iniciales: ' vw ' }
  };

  const context = alcance.resolveAlcanceGnral_gnral(req);
  assert.strictEqual(context.motor, 'alcance_gnral');
  assert.strictEqual(context.empresa, 'GENERAL');
  assert.strictEqual(context.effective_user_id, 25);
  assert.strictEqual(context.identidad.correo, 'viewer@blt.test');
  assert.strictEqual(context.identidad.iniciales, 'VW');
  assert.strictEqual(context.reglas.reporta_a, false);
  assert.strictEqual(context.reglas.zonas_operativas, false);

  const taskScope = alcance.buildPendientesScopeSql_gnral(req, 'p');
  assert.notStrictEqual(taskScope.sql, '1 = 0');
  assert.ok(taskScope.sql.includes('pendientes_usuarios'));
  assert.deepStrictEqual(taskScope.params, ['viewer@blt.test', 'viewer@blt.test', 'VW']);

  const supportScope = alcance.buildSupportTicketScopeSql_gnral(req, 't');
  assert.strictEqual(supportScope.sql, '(t.id_usuario = ? OR t.id_soporte = ?)');
  assert.deepStrictEqual(supportScope.params, [25, 25]);

  const ownedScope = alcance.buildUserIdScopeSql_gnral(req, 'n.id_usuario');
  assert.strictEqual(ownedScope.sql, 'n.id_usuario = ?');
  assert.deepStrictEqual(ownedScope.params, [25]);

  const masterScope = alcance.buildPendientesScopeSql_gnral(req, 'p', { masterAccess: true });
  assert.strictEqual(masterScope.sql, '1 = 1');
  assert.strictEqual(masterScope.alcance.llave_maestra, true);

  const missingTaskIdentity = alcance.buildPendientesScopeSql_gnral({ id_SB: 99 }, 'p');
  assert.strictEqual(missingTaskIdentity.sql, '1 = 0');

  assert.throws(
    () => alcance.buildSupportTicketScopeSql_gnral(req, 't; DROP TABLE x'),
    /Alias SQL invalido/
  );

  console.log('ALCANCE_GNRAL_V001: OK');
}

run();
