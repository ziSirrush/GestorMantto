'use strict';

const assert = require('assert');
const path = require('path');

const alcance = require(path.join(
  __dirname,
  '..',
  'src',
  'services',
  'alcance',
  'alcance-uni.service'
));

function createExecutor(zones = null) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql.includes('FROM usuario_zop')) {
        return [[...(zones || [
          { id_zona: 2, zona: 'CNB-02', nombre: 'Centro Norte B 02' },
          { id_zona: 1, zona: 'CNB-01', nombre: 'Centro Norte B 01' },
          { id_zona: 2, zona: 'cnb-02', nombre: 'Centro Norte B 02' }
        ])]];
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

  const context = await alcance.resolveAlcanceUni_uni(executor, req);
  assert.strictEqual(context.motor, 'alcance_uni');
  assert.strictEqual(context.empresa, 'UNITED');
  assert.strictEqual(context.modo, 'ZONAS_OPERATIVAS');
  assert.strictEqual(context.effective_user_id, 25);
  assert.strictEqual(context.llave_maestra, false);
  assert.strictEqual(context.requiere_filtro_zona, true);
  assert.strictEqual(context.reglas.permiso_funcional_requerido, true);
  assert.strictEqual(context.reglas.zonas_operativas, true);
  assert.strictEqual(context.reglas.llave_maestra_ignora_zonas, false);
  assert.deepStrictEqual(context.zona_ids, [1, 2]);
  assert.deepStrictEqual(context.zona_codigos, ['CNB-01', 'CNB-02']);
  assert.strictEqual(context.zonas_operativas.length, 2);
  assert.strictEqual(alcance.alcanceUniAllowsZone_uni(context, 2), true);
  assert.strictEqual(alcance.alcanceUniAllowsZone_uni(context, 9), false);

  const generic = alcance.buildResolvedZoneIdScopeSql_uni(context, 'x.zona_id');
  assert.strictEqual(generic.sql, 'x.zona_id IN (?, ?)');
  assert.deepStrictEqual(generic.params, [1, 2]);

  const portfolio = alcance.buildResolvedPortafolioScopeSql_uni(context, 'p');
  assert.strictEqual(portfolio.sql, 'p.zona_id IN (?, ?)');
  assert.deepStrictEqual(portfolio.params, [1, 2]);

  const ticket = alcance.buildResolvedTicketScopeSql_uni(context, 't');
  assert.ok(ticket.sql.includes('FROM portafolio p_scope_uni_ticket_equipo'));
  assert.ok(ticket.sql.includes('p_scope_uni_ticket_equipo.zona_id IN (?, ?)'));
  assert.ok(ticket.sql.includes('COUNT(DISTINCT p_scope_uni_ticket_project_check.zona_id) = 1'));
  assert.ok(ticket.sql.includes('t.codigo_equipo'));
  assert.ok(ticket.sql.includes('t.proyecto'));
  assert.ok(ticket.sql.includes('t.proyecto_padre'));
  assert.deepStrictEqual(ticket.params, [1, 2, 1, 2]);

  const noZoneExecutor = createExecutor([]);
  const noZoneContext = await alcance.resolveAlcanceUni_uni(noZoneExecutor, req);
  assert.deepStrictEqual(noZoneContext.zona_ids, []);
  assert.strictEqual(
    alcance.buildResolvedPortafolioScopeSql_uni(noZoneContext, 'p').sql,
    '1 = 0'
  );
  assert.strictEqual(
    alcance.buildResolvedTicketScopeSql_uni(noZoneContext, 't').sql,
    '1 = 0'
  );

  // La llave maestra elimina el alcance territorial y no consulta usuario_zop.
  const masterExecutor = createExecutor();
  const masterContext = await alcance.resolveAlcanceUni_uni(
    masterExecutor,
    req,
    { masterAccess: true }
  );
  assert.strictEqual(masterContext.llave_maestra, true);
  assert.strictEqual(masterContext.modo, 'LLAVE_MAESTRA');
  assert.strictEqual(masterContext.requiere_filtro_zona, false);
  assert.strictEqual(masterContext.zona_ids, null);
  assert.strictEqual(masterContext.zona_codigos, null);
  assert.strictEqual(masterExecutor.calls.length, 0);
  assert.strictEqual(
    alcance.buildResolvedPortafolioScopeSql_uni(masterContext, 'p').sql,
    '1 = 1'
  );
  assert.strictEqual(
    alcance.buildResolvedTicketScopeSql_uni(masterContext, 't').sql,
    '1 = 1'
  );
  assert.strictEqual(alcance.alcanceUniAllowsZone_uni(masterContext, 2), true);
  assert.strictEqual(alcance.alcanceUniAllowsZone_uni(masterContext, 9), true);

  // Llave maestra sin cuartos sigue abriendo todos los registros UNITED.
  const masterWithoutRoomsExecutor = createExecutor([]);
  const masterWithoutRooms = await alcance.resolveAlcanceUni_uni(
    masterWithoutRoomsExecutor,
    req,
    { masterAccess: true }
  );
  assert.strictEqual(masterWithoutRooms.llave_maestra, true);
  assert.strictEqual(masterWithoutRooms.requiere_filtro_zona, false);
  assert.strictEqual(masterWithoutRooms.zona_ids, null);
  assert.strictEqual(masterWithoutRoomsExecutor.calls.length, 0);
  assert.strictEqual(
    alcance.buildResolvedPortafolioScopeSql_uni(masterWithoutRooms, 'p').sql,
    '1 = 1'
  );
  assert.strictEqual(
    alcance.buildResolvedTicketScopeSql_uni(masterWithoutRooms, 't').sql,
    '1 = 1'
  );

  assert.throws(
    () => alcance.buildResolvedZoneIdScopeSql_uni(context, 'x.zona_id; DROP TABLE z_op'),
    /Columna SQL invalida/
  );
  assert.throws(
    () => alcance.buildResolvedTicketScopeSql_uni(context, 't;DROP'),
    /Alias SQL invalido/
  );

  await assert.rejects(
    () => alcance.resolveAlcanceUni_uni(executor, { id_SB: null }),
    /Usuario efectivo no disponible/
  );

  console.log('ALCANCE_UNI_PUERTAS_CUARTOS_V001: OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
