'use strict';

const assert = require('assert');
const path = require('path');

const alcance = require(path.join(
  __dirname,
  '..',
  'src',
  'services',
  'alcance',
  'alcance-cor.service'
));

function createExecutor() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql.includes('FROM usuarios_alcance_informacion')) {
        return [[
          { tipo_alcance: 'REPORTA_A', id_usuario_visible: null },
          { tipo_alcance: 'REL_ADMIN', id_usuario_visible: null },
          { tipo_alcance: 'USUARIO', id_usuario_visible: 44 },
          { tipo_alcance: 'USUARIO', id_usuario_visible: 45 },
          { tipo_alcance: 'USUARIO', id_usuario_visible: 44 }
        ]];
      }

      if (sql.includes('FROM usuarios\n') && sql.includes('reporta_a = ?')) {
        return [[
          { id_SB: 31 },
          { id_SB: 32 }
        ]];
      }

      if (sql.includes('FROM usuarios_rel_admin')) {
        return [[
          { id_SB: 41 },
          { id_SB: 42 }
        ]];
      }

      throw new Error(`SQL no contemplado por prueba: ${sql}`);
    }
  };
}

async function run() {
  const executor = createExecutor();
  const req = {
    user: { id_SB: 10 },
    contextUser: { id_SB: 25 }
  };

  const context = await alcance.resolveAlcanceCor_cor(executor, req);
  assert.strictEqual(context.motor, 'alcance_cor');
  assert.strictEqual(context.empresa, 'CORELLIAN');
  assert.strictEqual(context.effective_user_id, 25);
  assert.strictEqual(context.llave_maestra, false);
  assert.strictEqual(context.requiere_filtro_usuario, true);
  assert.strictEqual(context.reglas.ver_reporta_a, true);
  assert.strictEqual(context.reglas.ver_rel_admin, true);
  assert.strictEqual(context.reglas.zonas_operativas, false);
  assert.deepStrictEqual(context.usuarios_automaticos, [25, 31, 32, 41, 42]);
  assert.deepStrictEqual(context.usuarios_adicionales, [44, 45]);
  assert.deepStrictEqual(context.usuarios_visibles, [25, 31, 32, 41, 42, 44, 45]);
  assert.strictEqual(alcance.alcanceCorAllowsUser_cor(context, 42), true);
  assert.strictEqual(alcance.alcanceCorAllowsUser_cor(context, 99), false);

  const resolvedSql = alcance.buildResolvedUserColumnsScopeSql_cor(
    context,
    ['f.id_asesor', 'f.id_sup', 'f.id_admin']
  );
  assert.ok(resolvedSql.sql.includes('f.id_asesor IN'));
  assert.ok(resolvedSql.sql.includes('f.id_sup IN'));
  assert.ok(resolvedSql.sql.includes('f.id_admin IN'));
  assert.strictEqual(resolvedSql.params.length, 21);

  const insFlExecutor = createExecutor();
  const insFlSql = await alcance.buildInsFlScopeSql_cor(insFlExecutor, req, 'fl');
  assert.ok(insFlSql.sql.includes('fl.id_asesor IN'));
  assert.ok(insFlSql.sql.includes('fl.id_sup IN'));
  assert.ok(insFlSql.sql.includes('fl.id_admin IN'));

  const masterExecutor = createExecutor();
  const masterContext = await alcance.resolveAlcanceCor_cor(
    masterExecutor,
    req,
    { masterAccess: true }
  );
  assert.strictEqual(masterContext.llave_maestra, true);
  assert.strictEqual(masterContext.requiere_filtro_usuario, false);
  assert.strictEqual(masterContext.usuarios_visibles, null);
  assert.strictEqual(masterExecutor.calls.length, 0);

  const masterSql = alcance.buildResolvedUserColumnsScopeSql_cor(masterContext, 'x.created_by');
  assert.strictEqual(masterSql.sql, '1 = 1');
  assert.deepStrictEqual(masterSql.params, []);

  assert.throws(
    () => alcance.buildResolvedUserColumnsScopeSql_cor(context, 'x.id; DROP TABLE usuarios'),
    /Columna SQL invalida/
  );

  await assert.rejects(
    () => alcance.resolveAlcanceCor_cor(executor, { id_SB: null }),
    /Usuario efectivo no disponible/
  );

  console.log('ALCANCE_COR_V001: OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
