'use strict';

// [Mantto Gestor | Fase 2 | Pruebas 100% simuladas: sin conexion a Aiven]
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const controllerPath = path.join(__dirname, '../backend/src/controllers/cobranza-uni-relaciones-protegidas.controller.js');
const rutaGc = path.join(__dirname, '../backend/src/routes/cobranza-uni.routes.js');
const rutaMp = path.join(__dirname, '../backend/src/routes/detalle-mp-2026.routes.js');
const identity = require('../backend/src/services/cobranza-uni/identidad-proyecto.service');

const CBRE = 'CBRE Querétaro';
const fakeScope = {
  canonicalProjectSql_uni: (alias) => `${alias}.proyecto`,
  canonicalZoneCodeSql_uni: () => 'NULL',
  canonicalZoneIdsSql_uni: () => 'NULL',
  buildCobranzaProjectScopeSql_uni: (req, alias) => `${alias}.visible = 1`,
  alcancePayload_uni: () => ({ zona_ids: [1], zonas: ['CENTRO'] }),
  canonicalizeRow_uni: (row, campo) => ({ ...row, [`${campo}_legacy`]: row[campo], zona_oficial: null, zona_ids_oficial: [] })
};

function catalogoValido(overrides = {}) {
  return {
    proyecto_mantto: CBRE,
    id_cobranza_mantto: '80',
    proyecto_cobranza: CBRE,
    nombres_catalogos_identicos: 1,
    registros_mismo_nombre: 1,
    usos_id_cobranza: 1,
    ids_distintos_portafolio: 1,
    equipos_con_id_contradictorio: 0,
    ...overrides
  };
}

function preparar({ selected = {}, catalogo = catalogoValido(), selectedAlias = 'gc', related = {}, mainPayload = null, errorCatalogo = null } = {}) {
  const consultas = [];
  const connection = {
    released: false,
    release() { this.released = true; },
    async query(sql, params = []) {
      consultas.push({ sql, params });
      if (/FROM proyectos_mantto pm\s/i.test(sql) && /WHERE TRIM\(pm.proyecto\)/i.test(sql)) {
        if (errorCatalogo) throw errorCatalogo;
        return [catalogo ? [catalogo] : []];
      }
      if (/WHERE gc\.id_gc = \?/i.test(sql)) return [[{ id_gc: 68, proyecto: CBRE, id_proyecto_cobranza: '80', ...selected }]];
      if (/WHERE mp\.id_dmp = \?/i.test(sql)) return [[{ id_dmp: 53, proyecto: CBRE, id_proyecto_cobranza: '80', ...selected }]];
      if (/WHERE pc\.id_pc = \?/i.test(sql)) return [[{ id_pc: 1244, proyecto: CBRE, id_proyecto_cobranza: '80', ...selected }]];
      const match = sql.match(/FROM (gestion_credito gc|detalle_mp_2026 mp|pc pc)/);
      if (match) {
        const alias = match[1].split(' ')[1];
        return [related[alias] || []];
      }
      throw new Error('SQL inesperada: ' + sql.slice(0, 150));
    }
  };
  const db = { getConnection: async () => connection, query: async (sql) => {
    consultas.push({ sql, params: [] });
    return [related.adeudosSeguro || []];
  } };
  const oldMp = { async getMainDetalleMp2026(_req, res) {
    return res.json(mainPayload || {ok: true, rows: [], kpis: {adeudo_mp_total:0, adeudo_va_total:0, adeudo_total:0}});
  } };
  const dependencies = {
    '../config/db': db,
    '../services/cobranza-uni-scope.service': fakeScope,
    '../services/cobranza-uni/identidad-proyecto.service': identity,
    './detalle-mp-2026-cuartos-v2.controller': oldMp
  };
  const src = fs.readFileSync(controllerPath, 'utf8');
  const mod = new Module(controllerPath);
  mod.filename = controllerPath;
  mod.paths = Module._nodeModulePaths(path.dirname(controllerPath));
  mod.require = (name) => {
    if (!Object.hasOwn(dependencies, name)) throw new Error('Dependencia no simulada: ' + name);
    return dependencies[name];
  };
  mod._compile(src, controllerPath);
  return { controller: mod.exports, consultas, connection };
}

function resMock() {
  return {
    statusCode: 200, body: null,
    status(n) { this.statusCode = n; return this; },
    json(b) { this.body = b; return this; }
  };
}
function reqMock(id = '68') { return {params:{id}, informationAccess:{}, user:{id:1}}; }
function relacionesSql(consultas) {
  return consultas.filter((x) => /SELECT\s+(?:gc|mp|pc)\.\*/i.test(x.sql) && !/WHERE (?:gc\.id_gc|mp\.id_dmp|pc\.id_pc) = \?/i.test(x.sql));
}

test('F2: GC valida la identidad de la fila original y filtra MP/VA por nombre e ID', async () => {
  const { controller, consultas, connection } = preparar();
  const res = resMock();
  await controller.getGestionCreditoDetalle(reqMock('68'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.gestion_credito.id_gc, 68);
  assert.deepEqual(res.body.mantenimiento_preventivo, []);
  assert.deepEqual(res.body.venta_adicional, []);
  const matches = relacionesSql(consultas);
  assert.equal(matches.length, 2);
  for (const item of matches) {
    assert.match(item.sql, /TRIM\((mp|pc)\.proyecto\).*utf8mb4_0900_as_ci/s);
    assert.match(item.sql, /AND \(\s*(mp|pc)\.id_proyecto_cobranza = \?/s);
    assert.match(item.sql, /OR (?:mp|pc)\.id_proyecto_cobranza IS NULL/);
    assert.match(item.sql, /AND (?:mp|pc)\.visible = 1/);
    assert.deepEqual(item.params, [CBRE, '80']);
  }
  assert.equal(connection.released, true);
});

test('F2: GC con FK desplazado bloquea todas las lecturas cruzadas', async () => {
  const { controller, consultas } = preparar({ selected: {id_proyecto_cobranza:'625'} });
  const res = resMock();
  await controller.getGestionCreditoDetalle(reqMock(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.mantenimiento_preventivo, []);
  assert.deepEqual(res.body.venta_adicional, []);
  assert.equal(relacionesSql(consultas).length, 0);
});

test('F2: FK NULL permite respaldo por nombre solamente tras validar el catalogo', async () => {
  const { controller, consultas } = preparar({ selected: {id_proyecto_cobranza:null} });
  const res = resMock();
  await controller.getGestionCreditoDetalle(reqMock(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(relacionesSql(consultas).length, 2);
});

test('F2: registro origen con nombre ambiguo no recibe relaciones', async () => {
  const { controller, consultas } = preparar({ catalogo: catalogoValido({registros_mismo_nombre:2}) });
  const res = resMock();
  await controller.getGestionCreditoDetalle(reqMock(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(relacionesSql(consultas).length, 0);
});

test('F2: un origen con dos IDs en Portafolio no recibe relaciones', async () => {
  const { controller, consultas } = preparar({ catalogo: catalogoValido({ids_distintos_portafolio:2}) });
  const res = resMock();
  await controller.getGestionCreditoDetalle(reqMock(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(relacionesSql(consultas).length, 0);
});

test('F2: Venta Adicional solo devuelve GC y MP filtrados con AND + permisos', async () => {
  const { controller, consultas } = preparar();
  const res = resMock();
  await controller.getVentaAdicionalDetalle(reqMock('1244'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.table, 'pc');
  assert.equal(res.body.venta.id_pc, 1244);
  assert.equal(relacionesSql(consultas).length, 2);
  assert.match(relacionesSql(consultas)[0].sql, /gc\.visible = 1/);
  assert.match(relacionesSql(consultas)[1].sql, /mp\.visible = 1/);
});

test('F2: detalle MP utiliza proyecto raw, nunca proyecto_oficial derivado del FK', async () => {
  const { controller, consultas } = preparar({ selected: {proyecto_oficial:'Vivalto', proyecto:CBRE} });
  const res = resMock();
  await controller.getDetalleMp2026(reqMock('53'), res);
  assert.equal(res.statusCode, 200);
  const catalogoReq = consultas.find(x => x.sql === identity.SQL_RESOLVER_IDENTIDAD_UNI);
  assert.deepEqual(catalogoReq.params, [CBRE]);
  assert.equal(relacionesSql(consultas).length, 3);
  assert.match(relacionesSql(consultas)[1].sql, /LIMIT 1/);
});

test('F2: detalle MP con ID contradictorio nunca ejecuta consultas a GC/VA/MP relacionados', async () => {
  const { controller, consultas } = preparar({selected:{id_proyecto_cobranza:'625'}});
  const res = resMock();
  await controller.getDetalleMp2026(reqMock('53'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.gestion_credito, null);
  assert.deepEqual(res.body.venta_adicional, []);
  assert.deepEqual(res.body.mantenimiento_preventivo, []);
  assert.equal(relacionesSql(consultas).length, 0);
});

test('F2: valores de ID inyectados se rechazan antes de acceder a Aiven', async () => {
  const { controller, consultas } = preparar();
  const res = resMock();
  await controller.getDetalleMp2026(reqMock('1 OR 1=1'), res);
  assert.equal(res.statusCode, 400);
  assert.equal(consultas.length, 0);
});

test('F2: errores de validacion SQL fallan cerrado sin devolver filas ajenas', async () => {
  const { controller, connection } = preparar({errorCatalogo:new Error('fuera de linea')});
  const res = resMock();
  const oldError = console.error;
  try { console.error = () => {}; await controller.getVentaAdicionalDetalle(reqMock('1244'), res); }
  finally { console.error = oldError; }
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.venta, undefined);
  assert.equal(connection.released, true);
});

test('F2: main MP sustituye los adeudos originales contaminados y deduplica por ID validado', async () => {
  const mainPayload = {
    ok:true, source:'aiven',
    rows:[
      {id_dmp:53, proyecto:CBRE, adeudo_va:1002092},
      {id_dmp:54, proyecto:CBRE, adeudo_va:1002092},
      {id_dmp:55, proyecto:'Vivalto', adeudo_va:999999}
    ],
    kpis:{adeudo_mp_total:110,adeudo_va_total:2002091,adeudo_total:2002201}
  };
  const { controller, consultas } = preparar({mainPayload, related:{adeudosSeguro:[
    {id_dmp:53,id_cobranza_validado:'80',adeudo_va:250,operaciones_fk_conflictivo:0},
    {id_dmp:54,id_cobranza_validado:'80',adeudo_va:250,operaciones_fk_conflictivo:0}
  ]}});
  const res = resMock();
  await controller.getMainDetalleMp2026(reqMock(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.rows.map(x=>x.adeudo_va),[250,250,0]);
  assert.equal(res.body.kpis.adeudo_va_total,250);
  assert.equal(res.body.kpis.adeudo_total,360);
  assert.equal(res.body.kpis.adeudo_va_es_parcial,true);
  assert.equal(res.body.kpis.adeudo_va_filas_sin_identidad,1);
  assert.deepEqual(res.body.rows.map(r=>r.adeudo_va_verificado),[true,true,false]);
  assert.equal(consultas.length,1);
  assert.match(consultas[0].sql,/INNER JOIN cobranza_proyectos cp/);
  assert.match(consultas[0].sql,/NOT EXISTS \(/);
  assert.match(consultas[0].sql,/WHERE pc\.visible = 1/);
  assert.match(consultas[0].sql,/AND mp\.visible = 1/);
  assert.match(consultas[0].sql,/MAX\(CASE WHEN pc\.id_proyecto_cobranza/);
  assert.match(consultas[0].sql,/CONVERT\(p\.proyecto USING utf8mb4\)/);
  assert.match(consultas[0].sql,/TRIM\(pc\.proyecto\) COLLATE utf8mb4_0900_as_ci/);
  assert.match(consultas[0].sql,/TRIM\(mp\.proyecto\) COLLATE utf8mb4_0900_as_ci/);
});

test('F2: main MP rechaza duplicados de una misma operacion en el agregado', async () => {
  const { controller } = preparar({ mainPayload:{ok:true,rows:[{id_dmp:1}],kpis:{adeudo_mp_total:0}}, related:{adeudosSeguro:[
    {id_dmp:1,id_cobranza_validado:80,adeudo_va:12},
    {id_dmp:1,id_cobranza_validado:80,adeudo_va:12}
  ]}});
  const res=resMock();const oldError=console.error;
  try { console.error=()=>{}; await controller.getMainDetalleMp2026(reqMock(),res); }
  finally {console.error=oldError;}
  assert.equal(res.statusCode,500);
  assert.equal(res.body.ok,false);
});

test('F2: advertencia de subtotal parcial si operaciones VA tienen FK contradictorio', async () => {
  const { controller } = preparar({
    mainPayload:{ok:true,rows:[{id_dmp:53,adeudo_va:4000}],kpis:{adeudo_mp_total:100}},
    related:{adeudosSeguro:[{id_dmp:53,id_cobranza_validado:'80',adeudo_va:300,operaciones_fk_conflictivo:2}]}
  });
  const res = resMock();
  await controller.getMainDetalleMp2026(reqMock(), res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.rows[0].adeudo_va,300);
  assert.equal(res.body.rows[0].adeudo_va_verificado,false);
  assert.equal(res.body.kpis.adeudo_va_total,300);
  assert.equal(res.body.kpis.adeudo_va_operaciones_fk_conflictivo,2);
  assert.equal(res.body.kpis.adeudo_va_es_parcial,true);
});

test('F2: subtotal completo cuando todos los proyectos y VA estan verificados', async () => {
  const { controller } = preparar({
    mainPayload:{ok:true,rows:[{id_dmp:53,adeudo_va:900}],kpis:{adeudo_mp_total:15}},
    related:{adeudosSeguro:[{id_dmp:53,id_cobranza_validado:'80',adeudo_va:125,operaciones_fk_conflictivo:0}]}
  });
  const res = resMock();
  await controller.getMainDetalleMp2026(reqMock(), res);
  assert.equal(res.body.rows[0].adeudo_va_verificado,true);
  assert.equal(res.body.kpis.adeudo_va_total,125);
  assert.equal(res.body.kpis.adeudo_va_es_parcial,false);
});

test('F2: SQL del resumen contiene solo SELECT y verifica unicidad de nombre/ID', async () => {
  const { controller } = preparar();
  const sql=controller._test.SQL_ADEUDOS_MP_PROTEGIDOS_UNI('mp.visible = 1','pc.visible = 1');
  assert.match(sql,/HAVING COUNT\(\*\) = 1/g);
  assert.match(sql,/COLLATE utf8mb4_0900_bin/);
  assert.match(sql,/MAX\(CASE WHEN pc\.id_proyecto_cobranza/);
  assert.match(sql,/CONVERT\(p\.proyecto USING utf8mb4\)/);
  assert.match(sql,/pc\.id_proyecto_cobranza = r\.cobranza/);
  assert.match(sql,/pc\.id_proyecto_cobranza IS NULL/);
  assert.match(sql,/operaciones_fk_conflictivo/);
  assert.match(sql,/mp\.id_proyecto_cobranza = r\.cobranza OR mp\.id_proyecto_cobranza IS NULL/);
  assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER)\s+(?:INTO|FROM|TABLE|[a-z_]+)/i);
});

test('F2: se conservan permisos, rutas y sincronizaciones M2M', async () => {
  const gc=fs.readFileSync(rutaGc,'utf8');
  const mp=fs.readFileSync(rutaMp,'utf8');
  assert.match(gc,/humanInformationGuard_gnral/);
  assert.match(mp,/humanInformationGuard_gnral/);
  assert.match(gc,/COBRANZA_UNI_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO\.ACCESO_VISUAL/);
  assert.match(gc,/COBRANZA_UNI_ADITIVAS_ACCESO_VISUAL_MODULO\.ACCESO_VISUAL/);
  assert.match(mp,/COBRANZA_UNI_MANTENIMIENTO_PREVENTIVO_ACCESO_VISUAL_MODULO\.ACCESO_VISUAL/);
  assert.match(gc,/router\.post\('\/sync', requireCobranzaUniIntegration, cobranzaUniLegacyController\.syncCobranzaUni\)/);
  assert.match(mp,/router\.post\('\/sync', requireCobranzaUniIntegration, detalleMp2026LegacyController\.syncDetalleMp2026\)/);
  assert.match(gc,/relacionesProtegidasUni\.getGestionCreditoDetalle/);
  assert.match(gc,/relacionesProtegidasUni\.getVentaAdicionalDetalle/);
  assert.match(mp,/relacionesProtegidasUni\.getDetalleMp2026/);
  assert.match(mp,/relacionesProtegidasUni\.getMainDetalleMp2026/);
});
