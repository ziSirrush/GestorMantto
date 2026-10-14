'use strict';

// [Mantto Gestor | Fase 3 | Node test: consultas simuladas, sin acceso a Aiven]
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const adapterPath = path.join(root, 'backend/src/services/cobranza-uni/adeudos-proyecto-portafolio.service.js');
const scopePath = path.join(root, 'backend/src/services/cobranza-uni-scope.service.js');
const controllerPath = path.join(root, 'backend/src/modules/proyectos/proyectos.controller.js');
const repositoryPath = path.join(root, 'backend/src/modules/portafolio/portafolio.repository.js');

function fixture() {
  return {
    ok: true,
    proyecto: { proyecto: 'CBRE Querétaro', proyecto_busqueda: 'CBRE Querétaro', id_proyecto_cobranza: 80 },
    equipos: [{ proyecto: 'CBRE Querétaro' }, { proyecto: 'CBRE Querétaro' }],
    project_metrics: { llamadas_total_anio: 4, adeudo_mp: 999999, adeudo_va: 999888, adeudo_total: 1999887, gestion_credito_id: 999 }
  };
}
function identity(more = {}) { return { valido: true, estado: 'VALIDO', proyecto: 'CBRE Querétaro', id_proyecto_cobranza: '80', ...more }; }
function financial(more = {}) { return { gestion_credito_id: 68, adeudo_mp: 1200, adeudo_va: 300, gc_fk_conflictivos: 0, mp_fk_conflictivos: 0, va_fk_conflictivos: 0, ...more }; }
function response() { return { statusCode: 200, body: null, status(n) { this.statusCode = n; return this; }, json(payload) { this.body = payload; return this; } }; }
function loadMocked(filename, overrides) {
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = name => {
    if (!Object.hasOwn(overrides, name)) throw new Error('Dependencia inesperada: ' + name);
    return overrides[name];
  };
  mod._compile(fs.readFileSync(filename, 'utf8'), filename);
  return mod.exports;
}
function protectorWith({ row = financial(), id = identity(), onQuery } = {}) {
  const q = [];
  const query = async (sql, args) => {
    q.push({ sql, args });
    if (onQuery) return onQuery(sql, args);
    return [[row]];
  };
  const svc = loadMocked(adapterPath, {
    './identidad-proyecto.service': {
      resolverIdentidadProyecto_uni: async () => id
    }
  });
  const protector = svc.crearProtectorAdeudosPortafolioUni({ consultar: query, resolverIdentidad: async () => id });
  return { protector, q, svc };
}

test('F3: suma solo por nombre validado Y (FK correcto O NULL)', async () => {
  const { protector, q } = protectorWith();
  const payload = fixture();
  await protector.protegerPayloadUni(payload);
  assert.equal(payload.project_metrics.adeudo_mp, 1200);
  assert.equal(payload.project_metrics.adeudo_va, 300);
  assert.equal(payload.project_metrics.adeudo_total, 1500);
  assert.equal(payload.project_metrics.gestion_credito_id, 68);
  assert.equal(payload.project_metrics.adeudo_estado, 'VALIDADO');
  assert.equal(payload.project_metrics.adeudo_verificado, true);
  assert.equal(payload.project_metrics.llamadas_total_anio, 4);
  assert.equal(q.length, 1);
  assert.deepEqual(q[0].args, Array.from({length: 6}, () => ['CBRE Querétaro','80']).flat());
  assert.match(q[0].sql, /gc\.id_proyecto_cobranza = \? OR gc\.id_proyecto_cobranza IS NULL/);
  assert.match(q[0].sql, /mp\.id_proyecto_cobranza = \? OR mp\.id_proyecto_cobranza IS NULL/);
  assert.match(q[0].sql, /va\.id_proyecto_cobranza = \? OR va\.id_proyecto_cobranza IS NULL/);
  assert.match(q[0].sql, /MAX\(COALESCE\(va\.adeudo, 0\)\)/);
});

test('F3: con FK conflictivos no devuelve el falso total como cifra confirmada', async () => {
  const { protector } = protectorWith({ row: financial({ va_fk_conflictivos: 2, adeudo_va: 15 }) });
  const payload = fixture();
  await protector.protegerPayloadUni(payload);
  assert.equal(payload.project_metrics.adeudo_mp, null);
  assert.equal(payload.project_metrics.adeudo_va, null);
  assert.equal(payload.project_metrics.adeudo_total, null);
  assert.equal(payload.project_metrics.adeudo_es_parcial, true);
  assert.equal(payload.project_metrics.adeudo_estado, 'PARCIAL_FK_CONFLICTIVO');
  assert.deepEqual(payload.project_metrics.adeudo_subtotal_validado, { mp: 1200, va: 15, total: 1215 });
  assert.equal(payload.project_metrics.adeudo_pendientes.va_fk_conflictivos, 2);
});

test('F3: sin identidad comprobada elimina montos contaminados y no consulta adeudos', async () => {
  const { protector, q } = protectorWith({ id: { valido: false, estado: 'PORTAFOLIO_MULTIPLE_IDS' } });
  const payload = fixture();
  await protector.protegerPayloadUni(payload);
  assert.equal(q.length, 0);
  assert.equal(payload.project_metrics.adeudo_mp, null);
  assert.equal(payload.project_metrics.adeudo_va, null);
  assert.equal(payload.project_metrics.adeudo_total, null);
  assert.equal(payload.project_metrics.gestion_credito_id, null);
  assert.equal(payload.project_metrics.adeudo_estado, 'PORTAFOLIO_MULTIPLE_IDS');
});

test('F3: varios nombres de proyecto entre equipos bloquean lectura financiera', async () => {
  const { protector, q } = protectorWith();
  const payload = fixture();
  payload.equipos[1].proyecto = 'Vivalto';
  await protector.protegerPayloadUni(payload);
  assert.equal(payload.project_metrics.adeudo_estado, 'SIN_IDENTIDAD');
  assert.equal(q.length, 0);
});

test('F3: referencia de cabecera invalida bloquea lectura financiera', async () => {
  const { protector, q } = protectorWith();
  const payload = fixture();
  payload.proyecto.id_proyecto_cobranza = '80 OR 1=1';
  await protector.protegerPayloadUni(payload);
  assert.equal(payload.project_metrics.adeudo_estado, 'FK_INVALIDO');
  assert.equal(q.length, 0);
});

test('F3: respuesta corrompida de Aiven genera error, nunca devuelve el OR anterior', async () => {
  const { protector } = protectorWith({ onQuery: async () => [null] });
  await assert.rejects(() => protector.protegerPayloadUni(fixture()), /unico/);
});

test('F3: validador falla ante conteo de errores no fiable o importe no numerico', async () => {
  for (const row of [financial({ va_fk_conflictivos: -1 }), financial({ adeudo_mp: 'texto' })]) {
    const { protector } = protectorWith({ row });
    await assert.rejects(() => protector.protegerPayloadUni(fixture()), /no fiable/);
  }
});

test('F3: wrapper conserva errores y no hace lecturas extra ante 404', async () => {
  const { protector, q } = protectorWith();
  const res = response();
  await protector.envolverDetalleUni({}, res, async (_req, proxy) => proxy.status(404).json({ ok: false, message: 'No encontrado' }));
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'No encontrado');
  assert.equal(q.length, 0);
});

test('F3: wrapper falla cerrado con 503 ante error de Aiven y no filtra el subtotal anterior', async () => {
  const { protector } = protectorWith({ onQuery: async () => { throw new Error('Privado Aiven'); } });
  const res = response();
  const origConsole = console.error;
  console.error = () => {};
  try {
    await protector.envolverDetalleUni({}, res, async (_req, proxy) => proxy.json(fixture()));
  } finally { console.error = origConsole; }
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.doesNotMatch(JSON.stringify(res.body), /Privado|999999|999888/);
});

test('F3: wrapper conserva claves de equipos y tickets, solo reemplaza area financiera', async () => {
  const { protector } = protectorWith();
  const res = response();
  const payload = fixture();
  payload.tickets = [{ticket: 123}];
  await protector.envolverDetalleUni({}, res, async (_req, proxy) => proxy.json(payload));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tickets[0].ticket, 123);
  assert.equal(res.body.equipos.length, 2);
  assert.equal(res.body.project_metrics.adeudo_total, 1500);
});

test('F3: rutas alternas /proyectos?detalle=1 y /proyectos/detalle usan el protector', async () => {
  const seen = [];
  const svc = { envolverDetalleUni: async (req, res, handler) => { seen.push(req); return handler(req,res); } };
  const proy = { getProyectosInicial_uni: () => 'inicial', getProyectosFiltros_uni: () => 'filtros', getProyectos_uni: () => 'listado', getProyectoDetalle_uni: () => 'detalle' };
  const ctrl = loadMocked(controllerPath, {
    './proyectos.service': { getPortafolioProyectoDetalle: () => 'legacy' },
    './proyectos-cuartos_uni.service': proy,
    '../../services/cobranza-uni/adeudos-proyecto-portafolio.service': svc
  });
  assert.equal(await ctrl.getProyectos({query:{detalle:'1',proyecto:'CBRE Querétaro'}},{}),'detalle');
  assert.equal(await ctrl.getProyectoDetalle({query:{}},{}),'detalle');
  assert.equal(await ctrl.getProyectos({query:{}},{}),'listado');
  assert.equal(await ctrl.getPortafolioProyectoDetalle({query:{}},{}),'legacy');
  assert.equal(seen.length, 3);
});

test('F3: repositorio Portafolio protege detalle pero no cambia otros handlers', async () => {
  let wrapped = 0;
  const noop = () => 'original';
  const repo = loadMocked(repositoryPath, {
    '../../controllers/data.controller': {syncPortafolio:noop,getPortafolioEquipoTicketsLote:noop},
    './portafolio-comercial_uni': {getPortafolioDashboardInicial_uni:noop,getPortafolioDashboard_uni:noop,getPortafolioEquipos_uni:noop},
    './portafolio-consultas_uni': {getPortafolioProyectoDetalle_uni:noop,getPortafolioFiltros_uni:noop,getPortafolioEquipoDetalle_uni:noop,getPortafolio_uni:noop,getEquipos_uni:noop},
    './portafolio-movimientos_uni': {getPortafolioMovimientosInicial_uni:noop,getPortafolioMovimientos_uni:noop,getPortafolioSemanasDisponibles_uni:noop,getPortafolioMovimientosSemanales_uni:noop,ejecutarCorteSemanalManual_uni:noop,getPortafolioMovimientoDetalle_uni:noop},
    './portafolio-proyecto-fotos_uni': {getPortafolioProyectoFotografias_uni:noop,uploadPortafolioProyectoFotografia_uni:noop,deletePortafolioProyectoFotografia_uni:noop,updatePortafolioProyectoFotoPrincipal_uni:noop},
    '../../services/cobranza-uni/adeudos-proyecto-portafolio.service': { envolverDetalleUni: async (_req,_res, fn) => { wrapped += 1; return fn(); } }
  });
  assert.equal(await repo.getHandler('getPortafolioProyectoDetalle')({}, {}),'original');
  assert.equal(wrapped, 1);
  assert.equal(repo.getHandler('getPortafolio'), noop);
  assert.equal(repo.getHandler('syncPortafolio'), noop);
});

test('F3: alcance territorial nunca canoniza solamente por FK', () => {
  const guard = loadMocked(scopePath, {
    './information-record-scope-gnral.service': {
      hasUnrestrictedUnitedScope_gnral: () => false,
      zoneIds_gnral: () => [3, 1, 3],
      zoneCodes_gnral: () => ['NORTE']
    }
  });
  const sql = guard.canonicalProjectSql_uni('mp');
  assert.match(sql, /FROM proyectos_mantto pm_scope/);
  assert.match(sql, /INNER JOIN cobranza_proyectos cp_scope/);
  assert.match(sql, /TRIM\(mp\.proyecto\).*utf8mb4_0900_as_ci/s);
  assert.match(sql, /mp\.id_proyecto_cobranza = pm_scope\.cobranza/);
  assert.match(sql, /mp\.id_proyecto_cobranza IS NULL/);
  assert.match(sql, /p_scope_discordante\.id_proyecto_cobranza <> pm_scope\.cobranza/);
  assert.doesNotMatch(sql, /COALESCE\(\s*\(\s*SELECT cp_scope\.proyecto/);
  const scope = guard.buildCobranzaProjectScopeSql_uni({},'mp');
  assert.match(scope,/p_cob_scope_allowed\.zona_id IN \(1, 3\)/);
  assert.match(scope,/p_cob_scope_outside\.zona_id NOT IN \(1, 3\)/);
  assert.match(scope,/mp\.id_proyecto_cobranza = pm_scope\.cobranza/);
  assert.match(scope,/AND NOT EXISTS/);
  assert.throws(() => guard.canonicalProjectSql_uni('mp;DROP TABLE'),/invalido/);
});

test('F3: sin zonas el alcance niega acceso; llaves maestras oficiales no se modifican', () => {
  const noZones = loadMocked(scopePath, {
    './information-record-scope-gnral.service': {
      hasUnrestrictedUnitedScope_gnral: () => false, zoneIds_gnral: () => [], zoneCodes_gnral: () => []
    }
  });
  assert.equal(noZones.buildCobranzaProjectScopeSql_uni({}, 'gc'), '1 = 0');
  const master = loadMocked(scopePath, {
    './information-record-scope-gnral.service': {
      hasUnrestrictedUnitedScope_gnral: () => true, zoneIds_gnral: () => [], zoneCodes_gnral: () => []
    }
  });
  assert.equal(master.buildCobranzaProjectScopeSql_uni({}, 'gc'), '1 = 1');
});

test('F3: nombre canonico de FK diferente al proyecto raw no arrastra zona de otro proyecto', () => {
  const svc = loadMocked(scopePath, {
    './information-record-scope-gnral.service': {
      hasUnrestrictedUnitedScope_gnral: () => true,
      zoneIds_gnral: () => [], zoneCodes_gnral: () => []
    }
  });
  const r = svc.canonicalizeRow_uni({ proyecto:'CBRE Querétaro', proyecto_oficial:'Vivalto', zona_oficial:'SUR', zona_ids_oficial:'5', z_oper:'Legacy' },'z_oper');
  assert.equal(r.proyecto_oficial,'CBRE Querétaro');
  assert.equal(r.zona_oficial,null);
  assert.equal(r.z_oper,null);
  assert.deepEqual(r.zona_ids_oficial,[]);
  assert.equal(r.z_oper_legacy,'Legacy');
  assert.equal(r.identidad_nombre_fk_conflictiva,true);
});

test('F3: nombre canonico valido conserva zona oficial y no altera columnas legacy', () => {
  const svc = loadMocked(scopePath, {
    './information-record-scope-gnral.service': {
      hasUnrestrictedUnitedScope_gnral: () => true,
      zoneIds_gnral: () => [], zoneCodes_gnral: () => []
    }
  });
  const r = svc.canonicalizeRow_uni({proyecto:'CBRE Querétaro',proyecto_oficial:'CBRE Querétaro',zona_oficial:'CENTRO',zona_ids_oficial:'1,2',z_oper:'Original'},'z_oper');
  assert.equal(r.z_oper,'CENTRO');
  assert.deepEqual(r.zona_ids_oficial,[1,2]);
  assert.equal(r.identidad_nombre_fk_conflictiva,false);
});

test('F3: error 409 visible en UI legacy cuando no es posible verificar importes', async () => {
  const { protector } = protectorWith({ id: { valido: false, estado: 'NOMBRE_AMBIGUO' } });
  const res = response();
  const oldWarn = console.warn;
  console.warn = () => {};
  try { await protector.envolverDetalleUni({}, res, async (_req, proxy) => proxy.json(fixture())); }
  finally { console.warn = oldWarn; }
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'COBRANZA_PROYECTO_NO_VERIFICADA');
  assert.match(res.body.message,/pendientes de validacion/);
  assert.doesNotMatch(JSON.stringify(res.body), /999999|999888/);
});

test('F3: la existencia de FK financiero contradictorio tambien falla cerrado con advertencia', async () => {
  const { protector } = protectorWith({ row: financial({ mp_fk_conflictivos: 1 }) });
  const res = response();
  const oldWarn = console.warn;
  console.warn = () => {};
  try { await protector.envolverDetalleUni({}, res, async (_req, proxy) => proxy.json(fixture())); }
  finally { console.warn = oldWarn; }
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.integridad.estado, 'PARCIAL_FK_CONFLICTIVO');
  assert.equal(res.body.integridad.pendientes, undefined);
});
