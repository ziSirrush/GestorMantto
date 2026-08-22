'use strict';

const assert = require('assert');
const {
  normalizeGroupingCompany_gnral,
  resolveAlcanceByGrouping_gnral
} = require('../src/services/alcance/alcance-resolver.service');

function mockExecutor() {
  const groupingByCode = {
    GENERAL: { id_agrupacion: 1, codigo: 'GENERAL', nombre: 'general', empresa: 'BLT', activo: 1 },
    SOPORTE: { id_agrupacion: 11, codigo: 'SOPORTE', nombre: 'Soporte', empresa: 'BLT', activo: 1 },
    VENTAS: { id_agrupacion: 4, codigo: 'VENTAS', nombre: 'ventas', empresa: 'Corellian SA de CV', activo: 1 },
    OPERACION: { id_agrupacion: 2, codigo: 'OPERACION', nombre: 'operacion', empresa: 'United Elevadores', activo: 1 },
    EXPERIMENTAL: { id_agrupacion: 12, codigo: 'EXPERIMENTAL', nombre: 'Experimental', empresa: 'UNITED', activo: 1 },
    INVALIDA: { id_agrupacion: 99, codigo: 'INVALIDA', nombre: 'Invalida', empresa: 'OTRA', activo: 1 }
  };

  return {
    async query(sql, params = []) {
      if (sql.includes('FROM perm_agrupaciones')) {
        if (sql.includes('id_agrupacion = ?')) {
          const id = Number(params[0]);
          const row = Object.values(groupingByCode).find((item) => item.id_agrupacion === id);
          return [row ? [row] : []];
        }
        const row = groupingByCode[String(params[0] || '').trim()];
        return [row ? [row] : []];
      }

      if (sql.includes("tipo_alcance = 'DOMINIO_COMPLETO'")) {
        const [userId, domain] = params;
        if (Number(userId) === 900 && domain === 'CORELLIAN') return [[{ id_alcance: 1 }]];
        if (Number(userId) === 901 && domain === 'UNITED') return [[{ id_alcance: 2 }]];
        if (Number(userId) === 902 && domain === 'GENERAL') return [[{ id_alcance: 3 }]];
        return [[]];
      }

      if (sql.includes("tipo_alcance IN ('REPORTA_A', 'REL_ADMIN', 'USUARIO')")) {
        if (Number(params[0]) === 100) {
          return [[
            { tipo_alcance: 'REPORTA_A', id_usuario_visible: null },
            { tipo_alcance: 'REL_ADMIN', id_usuario_visible: null },
            { tipo_alcance: 'USUARIO', id_usuario_visible: 103 }
          ]];
        }
        return [[]];
      }

      if (sql.includes('FROM usuarios') && sql.includes('WHERE reporta_a = ?')) {
        return Number(params[0]) === 100 ? [[{ id_SB: 101 }]] : [[]];
      }

      if (sql.includes('FROM usuarios_rel_admin')) {
        return Number(params[0]) === 100 ? [[{ id_SB: 102 }]] : [[]];
      }

      if (sql.includes('FROM usuario_zop')) {
        if (Number(params[0]) === 200) {
          return [[
            { id_zona: 2, zona: 'Z02', nombre: 'Zona 02' },
            { id_zona: 5, zona: 'Z05', nombre: 'Zona 05' }
          ]];
        }
        return [[]];
      }

      throw new Error(`SQL no contemplado por prueba: ${sql}`);
    }
  };
}

async function main() {
  const db = mockExecutor();

  // Compatibilidad con valores canonicos y legacy verificados.
  assert.strictEqual(normalizeGroupingCompany_gnral('GENERAL'), 'GENERAL');
  assert.strictEqual(normalizeGroupingCompany_gnral('BLT'), 'GENERAL');
  assert.strictEqual(normalizeGroupingCompany_gnral('United Elevadores'), 'UNITED');
  assert.strictEqual(normalizeGroupingCompany_gnral('Corellian SA de CV'), 'CORELLIAN');
  assert.strictEqual(normalizeGroupingCompany_gnral('NOT UNITED'), null);
  assert.strictEqual(normalizeGroupingCompany_gnral('GENERAL SERVICES'), null);
  assert.strictEqual(normalizeGroupingCompany_gnral('otra'), null);

  const general = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 10, correo: 'a@blt.mx', iniciales: 'AA' } },
    'GENERAL'
  );
  assert.strictEqual(general.motor, 'alcance_gnral');
  assert.strictEqual(general.empresa, 'GENERAL');
  assert.strictEqual(general.llave_maestra, false);
  assert.strictEqual(general.agrupacion.empresa_origen, 'BLT');

  const generalMaster = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 902, correo: 'master@blt.mx', iniciales: 'GM' } },
    'SOPORTE'
  );
  assert.strictEqual(generalMaster.llave_maestra, true);
  assert.strictEqual(generalMaster.resolver.llave_maestra_fuente, 'DOMINIO_COMPLETO');

  const corellian = await resolveAlcanceByGrouping_gnral(
    db,
    { contextUser: { id_SB: 100 }, user: { id_SB: 999 } },
    'VENTAS'
  );
  assert.strictEqual(corellian.motor, 'alcance_cor');
  assert.strictEqual(corellian.effective_user_id, 100);
  assert.deepStrictEqual(corellian.usuarios_visibles, [100, 101, 102, 103]);

  const corellianMaster = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 900 } },
    'VENTAS'
  );
  assert.strictEqual(corellianMaster.llave_maestra, true);
  assert.strictEqual(corellianMaster.resolver.llave_maestra_fuente, 'DOMINIO_COMPLETO');
  assert.strictEqual(corellianMaster.requiere_filtro_usuario, false);

  const united = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 200 } },
    'OPERACION'
  );
  assert.strictEqual(united.motor, 'alcance_uni');
  assert.deepStrictEqual(united.zona_ids, [2, 5]);
  assert.strictEqual(united.requiere_filtro_zona, true);

  const unitedMaster = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 901 } },
    'EXPERIMENTAL'
  );
  assert.strictEqual(unitedMaster.llave_maestra, true);
  assert.strictEqual(unitedMaster.resolver.llave_maestra_fuente, 'DOMINIO_COMPLETO');
  assert.strictEqual(unitedMaster.requiere_filtro_zona, false);

  const corellianKeyDoesNotOpenUnited = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 900 } },
    'OPERACION'
  );
  assert.strictEqual(corellianKeyDoesNotOpenUnited.llave_maestra, false);
  assert.deepStrictEqual(corellianKeyDoesNotOpenUnited.zona_ids, []);

  const unitedKeyDoesNotOpenGeneral = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 901, correo: 'united@blt.mx', iniciales: 'UM' } },
    'SOPORTE'
  );
  assert.strictEqual(unitedKeyDoesNotOpenGeneral.llave_maestra, false);

  const explicitGeneralMaster = await resolveAlcanceByGrouping_gnral(
    db,
    { user: { id_SB: 10, correo: 'a@blt.mx', iniciales: 'AA' } },
    'SOPORTE',
    { masterAccess: true }
  );
  assert.strictEqual(explicitGeneralMaster.llave_maestra, true);
  assert.strictEqual(explicitGeneralMaster.resolver.llave_maestra_fuente, 'VALIDADO_POR_CAPA_SUPERIOR');

  await assert.rejects(
    () => resolveAlcanceByGrouping_gnral(db, { user: { id_SB: 10 } }, 'INVALIDA'),
    (error) => error && error.code === 'ALCANCE_RESOLVER_UNSUPPORTED_COMPANY'
  );

  await assert.rejects(
    () => resolveAlcanceByGrouping_gnral(db, { user: { id_SB: 10 } }, 'NO_EXISTE'),
    (error) => error && error.code === 'ALCANCE_RESOLVER_GROUPING_NOT_FOUND'
  );

  console.log('ALCANCE_RESOLVER_V001: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
