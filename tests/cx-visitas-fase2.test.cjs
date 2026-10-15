'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 2 V001]
// Tests sin Aiven/Azure, con mocks de repositorio y guard de rutas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const MODULE = path.join(ROOT, 'backend/src/modules/customer-experience');
const read = name => fs.readFileSync(path.join(MODULE, name), 'utf8');
const serviceFile = path.join(MODULE, 'customer-experience-visitas.service.js');
const repoFile = path.join(MODULE, 'customer-experience-visitas.repository.js');
const routesFile = path.join(MODULE, 'customer-experience-visitas.routes.js');

function mockLoad(target, replacement) {
  const original = Module._load;
  Module._load = function mockRequest(request, parent, isMain) {
    if (replacement && parent && path.resolve(parent.filename) === path.resolve(target)
        && Object.hasOwn(replacement, request)) return replacement[request];
    return original.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve(target)];
  try { return require(target); }
  finally { Module._load = original; }
}

function fakeRepository(initial = []) {
  const visits = initial.map(row => ({ ...row }));
  const events = [];
  const calls = { begin: 0, commit: 0, rollback: 0, released: 0, rowLocks: 0, insert: 0, update: 0, inactive: 0 };
  let nextId = Math.max(0, ...visits.map(x => Number(x.id_visita))) + 1;
  let rejectHistory = false;

  function scopeMatch(row, scope) {
    return scope.full || scope.users.includes(Number(row.id_usuario_creador))
      || scope.users.includes(Number(row.id_usuario_responsable));
  }

  const connection = {
    async beginTransaction() {
      calls.begin++;
      this.saved = {
        visits: visits.map(row => ({ ...row })),
        events: events.map(event => ({ ...event })),
        nextId
      };
    },
    async commit() { calls.commit++; this.saved = null; },
    async rollback() {
      calls.rollback++;
      const snap = this.saved;
      visits.splice(0, visits.length, ...snap.visits);
      events.splice(0, events.length, ...snap.events);
      nextId = snap.nextId;
      this.saved = null;
    },
    release() { calls.released++; }
  };

  const impl = {
    getConnection_cor: async () => connection,
    list_cor: async (_connection, filters, scope) => {
      const all = visits.filter(v => !v.inactivo && scopeMatch(v, scope))
        .filter(v => !filters.q || [v.titulo, v.proyecto_nombre, v.cliente_nombre, v.referencia_id]
          .join(' ').toLowerCase().includes(filters.q.toLowerCase()))
        .filter(v => !filters.estado || v.estado === filters.estado)
        .filter(v => !filters.id_usuario_responsable || Number(v.id_usuario_responsable) === filters.id_usuario_responsable)
        .sort((a, b) => b.id_visita - a.id_visita);
      return { total: all.length, rows: all.slice(filters.offset, filters.offset + filters.page_size) };
    },
    getById_cor: async (_connection, id, scope, opts) => {
      if (opts?.forUpdate) calls.rowLocks++;
      return visits.find(v => v.id_visita === id && (opts?.includeInactive || !v.inactivo) && scopeMatch(v, scope)) || null;
    },
    listHistory_cor: async (_connection, id, page) => {
      const all = events.filter(v => v.id_visita === id).reverse();
      return { total: all.length, rows: all.slice(page.offset, page.offset + page.page_size) };
    },
    getActiveAssignee_cor: async (_connection, id) => (
      id === 66 ? { id_SB: id, empresa: 'United Elevadores' } :
      [11, 12, 13, 99].includes(id) ? { id_SB: id, empresa: 'Corellian SA de CV' } : null
    ),
    insert_cor: async (_connection, data, actor) => {
      calls.insert++;
      const id = nextId++;
      visits.push({ ...data, id_visita: id, id_usuario_creador: actor,
        id_usuario_ultima_modificacion: actor, resultado: null,
        fecha_realizada_utc: null, estado: 'BORRADOR', inactivo: 0,
        created_at: new Date('2026-10-15T18:00:00.000Z'),
        updated_at: new Date('2026-10-15T18:00:00.000Z') });
      return id;
    },
    update_cor: async (_connection, id, changes, actor) => {
      calls.update++;
      const row = visits.find(x => x.id_visita === id && !x.inactivo);
      if (!row) return 0;
      Object.assign(row, changes, { id_usuario_ultima_modificacion: actor });
      return 1;
    },
    deactivate_cor: async (_connection, id, actor) => {
      calls.inactive++;
      const row = visits.find(x => x.id_visita === id && !x.inactivo);
      if (!row) return 0;
      row.inactivo = 1;
      row.id_usuario_ultima_modificacion = actor;
      return 1;
    },
    insertHistory_cor: async (_connection, id, actor, action, details) => {
      if (rejectHistory) throw new Error('HISTORY_INSERT_FAILED');
      events.push({ id_evento: events.length + 1, id_visita: id,
        id_actor_usuario: actor, accion: action, detalle: details });
    }
  };
  return { impl, visits, events, calls, rejectHistory: value => { rejectHistory = value; } };
}

function req(userId = 11, { visible = null, full = false, viewer = false,
  actorId = userId, grouping = 'CUSTOMER_EXPERIENCE', domain = 'CORELLIAN', filter = !full } = {}) {
  return {
    user: { id_SB: userId }, contextUser: { id_SB: userId }, actorUser: { id_SB: actorId },
    viewerContext: viewer ? { active: true } : null,
    informationAccess: {
      actor_user_id: actorId, effective_user_id: userId,
      acceso_puerta: true, dominio: domain,
      agrupacion: { codigo: grouping },
      acceso_dominio_completo: full,
      requiere_filtro_usuario: filter,
      usuarios_visibles: visible ?? [userId]
    }
  };
}

const loadService = fake => mockLoad(serviceFile,
  { './customer-experience-visitas.repository': fake.impl });

async function rejectsWithCode(promise, status, code) {
  await assert.rejects(promise, e => e?.status === status && e?.code === code);
}

test('Paquete modifica unicamente el montaje de rutas CX, sin alterar endpoints previos', () => {
  const file = read('customer-experience.routes.js');
  const original = file.slice(0, file.indexOf('// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 2 V001]'))
    + 'module.exports = router;\n';
  const oldSha = crypto.createHash('sha1').update(`blob ${Buffer.byteLength(original)}\u0000${original}`).digest('hex');
  assert.equal(oldSha, '5452360c461237a55e5ae689c15709a23dfbf987');
  assert.equal((file.match(/router\.use\('\/visitas'/g) || []).length, 1);
  assert.match(file, /'\/mantenimiento\/sync'/);
  assert.match(file, /'\/venta-instalacion\/sync'/);
  assert.match(file, /'\/dashboard'/);
  assert.match(file, /'\/mantenimiento\/encuestas'/);
});

test('Normalizacion de payload: titulo obligatorio, no acepta identidades ni estados cliente', () => {
  const s = loadService(fakeRepository()).__test;
  assert.equal(s.normalizeBody_cor({ titulo: '  Reunión CX  ' }, true).titulo, 'Reunión CX');
  assert.equal(s.normalizeBody_cor({ titulo: 'Reunión CX' }, true).id_usuario_responsable, null);
  assert.throws(() => s.normalizeBody_cor({ observaciones: 'x' }, true), { code: 'CX_VISITAS_CAMPO_REQUERIDO' });
  for (const field of ['id_usuario_creador', 'id_actor_usuario', 'estado', 'inactivo',
    'fecha_realizada_utc', 'resultado', 'updated_at']) {
    assert.throws(() => s.normalizeBody_cor({ titulo: 'Visita', [field]: 123 }, true),
      { code: 'CX_VISITAS_CAMPOS_NO_PERMITIDOS' });
  }
  assert.throws(() => s.normalizeBody_cor({ titulo: 'z'.repeat(201) }, true),
    { code: 'CX_VISITAS_CAMPO_LARGO' });
  assert.throws(() => s.normalizeBody_cor([]), { code: 'CX_VISITAS_CUERPO_INVALIDO' });
});

test('Identificadores, paginacion, fechas UTC y rangos invalidos se rechazan', () => {
  const s = loadService(fakeRepository()).__test;
  for (const input of ['1 OR 1=1', '0', '-1', '1.1', '9007199254740999']) {
    assert.throws(() => s.id_cor(input), { code: 'CX_VISITAS_ID_INVALIDO' });
  }
  assert.equal(s.utcInput_cor('2026-10-15T18:30:00-06:00', 'fecha_programada_utc'),
    '2026-10-16 00:30:00.000');
  assert.equal(s.utcInput_cor('2026-10-15T18:30:00.123Z', 'fecha_programada_utc'),
    '2026-10-15 18:30:00.123');
  for (const input of ['2026-10-15 18:30:00', '2026-02-30T10:00:00Z',
    '2026-10-15T25:00:00Z', '2026-10-15T18:00:00+14:30']) {
    assert.throws(() => s.utcInput_cor(input, 'fecha_programada_utc'), { code: 'CX_VISITAS_FECHA_INVALIDA' });
  }
  assert.throws(() => s.filters_cor({desde:'2026-10-16',hasta:'2026-10-15'}), { code:'CX_VISITAS_RANGO_INVALIDO' });
  assert.throws(() => s.pagination_cor({page_size:'101'}), { code:'CX_VISITAS_PAGINACION_INVALIDA' });
});

test('Guard de alcance: fail-closed ante dominio distinto, motor desconocido y Visor en escritura', () => {
  const s = loadService(fakeRepository()).__test;
  assert.deepEqual(s.scope_cor(req(11, {visible: [11,12]})).users, [11, 12]);
  assert.equal(s.scope_cor(req(11, {full: true})).full, true);
  assert.throws(() => s.scope_cor(req(11, {domain: 'UNITED'})), { code:'CX_VISITAS_ALCANCE_INVALIDO' });
  assert.throws(() => s.scope_cor(req(11, {grouping: 'VENTAS'})), { code:'CX_VISITAS_ALCANCE_INVALIDO' });
  assert.throws(() => s.scope_cor(req(11, {filter:false,full:false})), { code:'CX_VISITAS_ALCANCE_INVALIDO' });
  assert.throws(() => s.scope_cor(req(11, {visible: [12]})), { code:'CX_VISITAS_USUARIO_FUERA_ALCANCE' });
  assert.throws(() => s.scope_cor(req(11, {viewer:true,actorId:99}), true), { code:'VIEWER_READ_ONLY' });
});

test('Crear y leer visita: sujeto autorizado, actor servidor, auditoria transaccional', async () => {
  const fake = fakeRepository(), svc = loadService(fake);
  const result = await svc.create_cor(req(11), { titulo: 'Visita A',
    referencia_origen: 'OTRO', referencia_id: 'O-1', fecha_programada_utc: '2026-10-15T12:00:00Z' });
  assert.equal(result.visita.id_usuario_creador, 11);
  assert.equal(result.visita.estado, 'BORRADOR');
  assert.equal(result.visita.fecha_programada_utc, '2026-10-15 12:00:00.000');
  assert.deepEqual(fake.events.map(e => e.accion), ['CREAR']);
  assert.equal(fake.events[0].id_actor_usuario, 11);
  assert.equal(fake.calls.begin, 1);
  assert.equal(fake.calls.commit, 1);
  assert.equal(fake.calls.rollback, 0);
  assert.equal(fake.calls.released, 1);
  const list = await svc.list_cor(req(11), { q: 'Visita' });
  assert.equal(list.total, 1);
  assert.equal(list.page_size, 25);
  const history = await svc.history_cor(req(11), result.visita.id_visita, {});
  assert.equal(history.total, 1);
});

test('Alcance de usuario: visita visible por creador o responsable; no permite edicion ajena', async () => {
  const fake = fakeRepository(), svc = loadService(fake);
  const created = await svc.create_cor(req(11, {visible: [11, 12]}),
    {titulo:'Visita compartida', id_usuario_responsable: 12});
  const id = created.visita.id_visita;
  assert.equal((await svc.list_cor(req(12), {})).total, 1);
  assert.equal((await svc.get_cor(req(12), id)).visita.id_visita, id);
  assert.equal((await svc.edit_cor(req(12), id, { titulo: 'Actualizada' })).visita.titulo, 'Actualizada');
  assert.equal((await svc.list_cor(req(13), {})).total, 0);
  await rejectsWithCode(svc.get_cor(req(13), id), 404, 'CX_VISITAS_NO_ENCONTRADA');
  // Un supervisor puede consultar a un visible, pero no modificarlo sin ser creador/responsable.
  await rejectsWithCode(svc.edit_cor(req(13, {visible:[11,12,13]}), id, {titulo:'Intento'}),
    403, 'CX_VISITAS_EDICION_NO_AUTORIZADA');
});

test('Actualizacion sin cambios no genera historial; cambio real registra EDITAR', async () => {
  const fake = fakeRepository(), svc = loadService(fake);
  const created = await svc.create_cor(req(), { titulo: 'Visita C' });
  const id = created.visita.id_visita;
  const noop = await svc.edit_cor(req(), id, { titulo: 'Visita C' });
  assert.equal(noop.sin_cambios, true);
  assert.equal(fake.events.length, 1);
  assert.equal(fake.calls.update, 0);
  const patch = await svc.edit_cor(req(), id, { titulo: 'Visita D', observaciones: 'Nota' });
  assert.equal(patch.sin_cambios, false);
  assert.equal(fake.events[1].accion, 'EDITAR');
  assert.deepEqual(fake.events[1].detalle.campos, ['titulo', 'observaciones']);
  assert.ok(fake.calls.rowLocks >= 2);
});

test('No permite referencias incompletas, responsable fuera de alcance ni otras empresas', async () => {
  const fake = fakeRepository(), svc = loadService(fake);
  await rejectsWithCode(svc.create_cor(req(), {titulo:'Visita', referencia_id:'P-1'}),
    400, 'CX_VISITAS_REFERENCIA_INCOMPLETA');
  await rejectsWithCode(svc.create_cor(req(), {titulo:'Visita', id_usuario_responsable:12}),
    403, 'CX_VISITAS_RESPONSABLE_FUERA_ALCANCE');
  await rejectsWithCode(svc.create_cor(req(11, {full:true}), {titulo:'Visita', id_usuario_responsable:66}),
    400, 'CX_VISITAS_RESPONSABLE_INVALIDO');
  assert.equal(fake.visits.length, 0);
  assert.ok(fake.calls.rollback >= 2);
});

test('Rollback atomico si falla el INSERT de auditoria', async () => {
  const fake = fakeRepository(), svc = loadService(fake);
  fake.rejectHistory(true);
  await assert.rejects(svc.create_cor(req(), {titulo:'Fail'}), /HISTORY_INSERT_FAILED/);
  assert.equal(fake.visits.length, 0);
  assert.equal(fake.events.length, 0);
  assert.equal(fake.calls.rollback, 1);
  assert.equal(fake.calls.commit, 0);
  assert.equal(fake.calls.released, 1);
});

test('Baja logica no elimina datos ni historial; las lecturas activas devuelven 404', async () => {
  const fake = fakeRepository(), svc = loadService(fake);
  const id = (await svc.create_cor(req(), {titulo:'Baja'})).visita.id_visita;
  const result = await svc.deactivate_cor(req(), id);
  assert.equal(result.desactivada, true);
  assert.equal(fake.visits[0].inactivo, 1);
  assert.deepEqual(fake.events.map(e => e.accion), ['CREAR', 'DESACTIVAR']);
  await rejectsWithCode(svc.get_cor(req(), id), 404, 'CX_VISITAS_NO_ENCONTRADA');
  await rejectsWithCode(svc.deactivate_cor(req(), id), 404, 'CX_VISITAS_NO_ENCONTRADA');
  const history = await svc.history_cor(req(), id, {});
  assert.deepEqual(history.eventos.map(e => e.accion), ['DESACTIVAR', 'CREAR']);
});

test('Repositorio: SQL parametrizado, alcance a creador/responsable, baja logica y locking', async () => {
  const queries = [];
  const fakeDb = { getConnection: async () => ({ release() {} }) };
  const repo = mockLoad(repoFile, { '../../config/db': fakeDb });
  const scoped = repo.scopeSql_cor({ full: false, users: [11, 12] });
  assert.match(scoped.sql, /id_usuario_creador IN/);
  assert.match(scoped.sql, /id_usuario_responsable IN/);
  assert.deepEqual(scoped.params, [11,12,11,12]);
  const connection = {query: async (sql, params) => {
    queries.push({ sql, params });
    return [[{ id_visita: 9, inactivo: 0 }]];
  }};
  await repo.getById_cor(connection, 9, { full:false, users:[11,12] }, {forUpdate:true});
  assert.match(queries[0].sql, /inactivo = 0/);
  assert.match(queries[0].sql, /FOR UPDATE/);
  assert.equal(queries[0].params[0], 9);
  assert.deepEqual(queries[0].params.slice(1), [11,12,11,12]);
  queries.length = 0;
  await repo.update_cor(connection, 9, { titulo: 'Test' }, 11);
  assert.match(queries[0].sql, /WHERE id_visita = \? AND inactivo = 0/);
  assert.deepEqual(queries[0].params, ['Test', 11, 9]);
  await assert.rejects(repo.update_cor(connection, 9, { 'titulo = 1; DROP TABLE x': 'X' }, 11));
});

test('Router: gate deshabilitado por defecto, accion + visual + agrupacion para 6 rutas', async () => {
  const regs = [];
  const configurations = [];
  const express = {
    Router: () => {
      const router = {};
      for (const method of ['use','get','post','patch','delete']) {
        router[method] = (...args) => regs.push({method,args});
      }
      return router;
    }
  };
  const repo = fakeRepository(), service = loadService(repo);
  const allowedPerms = [];
  const guard = options => {
    configurations.push(options);
    return [function fakeAuth(req,res,next){next();},function fakeGuard(req,res,next){next();}];
  };
  const controller = { list_cor(){},get_cor(){},history_cor(){},create_cor(){},edit_cor(){},deactivate_cor(){} };
  mockLoad(routesFile, {
    express,
    './customer-experience-visitas.controller': controller,
    './customer-experience-visitas.service': service,
    '../../middleware/information-access-gnral.middleware': {humanInformationGuard_gnral: guard},
    '../../services/permissions/effective-permission.service': {
      hasEffectivePermission: async (userId, code) => { allowedPerms.push([userId,code]); return false; }
    }
  });
  assert.equal(regs.filter(x => x.method === 'use').length, 1);
  assert.equal(configurations.length, 6);
  assert.deepEqual(configurations.map(x=>x.permissionCode), [service.PERMISSIONS_COR.list,
    service.PERMISSIONS_COR.history, service.PERMISSIONS_COR.list,
    service.PERMISSIONS_COR.create, service.PERMISSIONS_COR.edit, service.PERMISSIONS_COR.deactivate]);
  configurations.forEach(config => {
    assert.equal(config.domain, 'CORELLIAN');
    assert.equal(config.groupingCode, 'CUSTOMER_EXPERIENCE');
  });
  const original = process.env.CX_VISITAS_API_ENABLED;
  try {
    delete process.env.CX_VISITAS_API_ENABLED;
    let response;
    await regs[0].args[0]({}, {status(code){response=code;return this;}, json(v){this.data=v;return this;}}, ()=> { throw new Error('Gate inesperadamente abierto'); });
    assert.equal(response, 503);
    assert.equal(process.env.CX_VISITAS_API_ENABLED, undefined);
    process.env.CX_VISITAS_API_ENABLED = 'true';
    let passed = false;
    regs[0].args[0]({}, {}, ()=>{passed=true;});
    assert.equal(passed,true);
    const visual = regs.find(x=>x.method==='get').args.at(-2);
    let denied;
    await visual({informationAccess:{effective_user_id:11}}, {
      status(code){denied=code;return this;},json(){return this;}
    }, () => {throw new Error('Visual gate unexpectedly granted');});
    assert.equal(denied, 403);
    assert.deepEqual(allowedPerms, [[11, service.PERMISSIONS_COR.visual]]);
  } finally {
    if(original===undefined) delete process.env.CX_VISITAS_API_ENABLED;
    else process.env.CX_VISITAS_API_ENABLED=original;
  }
});
