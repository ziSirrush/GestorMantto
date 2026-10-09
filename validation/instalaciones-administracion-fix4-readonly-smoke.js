#!/usr/bin/env node
'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
// Smoke opt-in y SOLO GET. No imprime datos operativos, correos ni credenciales.
// No acredita rollback/auditoria: esas pruebas requieren entorno QA autorizado.

const assert = require('node:assert/strict');
const ROOT = '/api/instalaciones/administracion';

function parseArgs_cor(argv) {
  const result = {};
  const values = new Set(['--base-url', '--record-id', '--denied-record-id']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--readonly') { result.readonly = true; continue; }
    if (!values.has(arg) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Parametro desconocido o incompleto. Usa --readonly --base-url URL [--record-id ID] [--denied-record-id ID].');
    }
    result[arg.slice(2)] = argv[++i];
  }
  if (!result.readonly || !result['base-url']) {
    throw new Error('Se requiere --readonly y --base-url. No se ejecutaron solicitudes.');
  }
  const url = new URL(result['base-url']);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!((url.protocol === 'https:') || (local && url.protocol === 'http:')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Usa la raiz HTTPS de la API (HTTP solo localhost), sin credenciales, rutas ni parametros.');
  }
  const id = key => {
    if (result[key] === undefined) return null;
    const n = Number(result[key]);
    if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${key} debe ser un entero positivo.`);
    return n;
  };
  return {baseUrl: url.origin, recordId:id('record-id'), deniedRecordId:id('denied-record-id')};
}

function allowedFields_cor(contract) {
  const fields = new Set(['id_ins_fl', 'updated_at', 'created_at']);
  for (const group of contract.groups || []) {
    if (group.permissions?.can_view !== true) continue;
    for (const field of group.fields || []) fields.add(field);
  }
  return fields;
}

function ensureProjection_cor(row, contract, kind) {
  assert.ok(row && typeof row === 'object' && !Array.isArray(row), `${kind}: datos invalidos`);
  const fields = allowedFields_cor(contract);
  if (kind === 'equipos' && contract.groups.find(g => g.key === 'responsables')?.permissions?.can_view === true) {
    fields.add('supervisor_display');
  }
  for (const key of Object.keys(row)) {
    assert.ok(fields.has(key), `${kind}: columna no autorizada ${key}`);
  }
  assert.ok(Object.hasOwn(row, 'id_ins_fl'), `${kind}: sin ID del registro`);
}

async function smoke_cor(opts, deps = {}) {
  const fetcher = deps.fetch || globalThis.fetch;
  const token = String(deps.token ?? process.env.MANTTO_QA_TOKEN ?? '').trim();
  const device = String(deps.deviceToken ?? process.env.MANTTO_QA_DEVICE_TOKEN ?? '').trim();
  const denied = String(deps.deniedToken ?? process.env.MANTTO_QA_DENIED_TOKEN ?? '').trim();
  if (!token) throw new Error('Se requiere MANTTO_QA_TOKEN en variables de entorno, no en argumentos.');
  if (typeof fetcher !== 'function') throw new Error('Node 18+ con fetch es obligatorio.');
  const checks = [], skipped = [];
  function check(name, value) {
    if (!value) throw new Error('No paso el control: ' + name);
    checks.push(name);
  }
  async function request(path, bearer) {
    const headers = {Accept: 'application/json', 'Cache-Control':'no-store'};
    if (bearer) {
      headers.Authorization = 'Bearer ' + bearer;
      if (device) headers['X-Device-Token'] = device;
    }
    const response = await fetcher(opts.baseUrl + path, {
      method:'GET', headers, redirect:'error', cache:'no-store', signal:AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => null);
    return {status:response.status, body};
  }

  const guest = await request(ROOT + '/contrato', null);
  check('sin sesion no consulta el contrato (401/403)', [401,403].includes(guest.status));
  const reply = await request(ROOT + '/contrato', token);
  check('contrato accesible bajo permiso y puerta', reply.status === 200 && reply.body?.ok === true);
  const contract = reply.body;
  check('contrato mantiene 11 grupos funcionales', Array.isArray(contract.groups) && contract.groups.length === 11);
  check('permisos VER/EDITAR declarados por grupo', contract.groups.every(g =>
    typeof g?.permissions?.can_view === 'boolean' && typeof g?.permissions?.can_edit === 'boolean'));
  const badId = await request(ROOT + '/registros/id-invalido', token);
  check('ID no valido retorna 400', badId.status === 400);
  const oldSearch = await request(ROOT + '/registros?limit=5', token);
  const anyVisible = contract.groups.some(g => g.permissions.can_view);
  if (anyVisible) {
    check('listado historico aplica permisos', oldSearch.status === 200 && Array.isArray(oldSearch.body?.data));
    for (const row of oldSearch.body.data) ensureProjection_cor(row, contract, 'listado');
    checks.push('listado sin columnas restringidas');
  } else check('lista sin permisos protegida (403)', oldSearch.status === 403);

  const canProject = contract.groups.find(g => g.key === 'proyecto')?.permissions?.can_view === true;
  if (canProject) {
    const filters = await request(ROOT + '/filtros', token);
    check('filtros autorizados disponibles', filters.status === 200 && filters.body?.ok === true &&
      Array.isArray(filters.body.estatus) && Array.isArray(filters.body.supervisores));
    const supervisorVisible = contract.groups.find(g => g.key === 'responsables')?.permissions?.can_view === true;
    check('filtro supervisor respeta permiso del grupo',
      filters.body.permisos?.supervisor === supervisorVisible);
    const list = await request(ROOT + '/proyectos?limit=5&offset=0', token);
    check('proyectos con paginacion y scope', list.status === 200 && list.body?.ok === true &&
      Array.isArray(list.body?.data) && Number.isInteger(Number(list.body.total)));
    const projects = list.body.data;
    for (const project of projects) {
      check('proyecto expone clave y conteo, no datos ajenos',
        Object.keys(project).every(k => ['project_key','proyecto','id_proyecto','equipos'].includes(k)) &&
        /^([PR]):/.test(String(project.project_key)));
    }
    if (projects.length) {
      const key = encodeURIComponent(projects[0].project_key);
      const equipments = await request(ROOT + '/proyectos/' + key + '/equipos?limit=5&offset=0', token);
      check('equipos del proyecto consultados con scope', equipments.status === 200 &&
        Array.isArray(equipments.body?.data));
      for (const row of equipments.body.data) ensureProjection_cor(row, contract, 'equipos');
      checks.push('resumen equipos no filtra datos restringidos');
      if (!opts.recordId && equipments.body.data[0]) opts = {...opts, recordId: Number(equipments.body.data[0].id_ins_fl)};
    } else skipped.push('equipos: sin proyectos para comprobar detalles');
    const badLimit = await request(ROOT+'/proyectos?limit=51', token);
    check('limite indebido rechazado (400)', badLimit.status===400);
  } else {
    const blocked = await request(ROOT + '/proyectos?limit=5', token);
    check('proyectos sin permiso PROYECTO protegidos (403)', blocked.status === 403);
    skipped.push('navegacion: usuario sin permiso PROYECTO.VER');
  }

  if (opts.recordId) {
    const detail = await request(ROOT + '/registros/' + opts.recordId, token);
    check('detalle autorizado consultado', detail.status === 200 && detail.body?.ok === true);
    ensureProjection_cor(detail.body.data, contract, 'detalle');
    check('detalle pertenece a ID solicitado', Number(detail.body.data.id_ins_fl) === opts.recordId);
  } else skipped.push('detalle: no se proporciono ID ni se hallo equipo');
  if (opts.deniedRecordId) {
    const forbidden = await request(ROOT + '/registros/' + opts.deniedRecordId, token);
    check('registro fuera de scope sin datos (403/404)', [403,404].includes(forbidden.status));
  } else skipped.push('scope negativo por ID: sin --denied-record-id');
  if (denied) {
    const deniedContract = await request(ROOT + '/contrato', denied);
    check('usuario autenticado sin permiso/puerta obtiene 403 al consultar modulo', deniedContract.status === 403);
    const deniedProjects = await request(ROOT + '/proyectos?limit=5', denied);
    check('usuario autenticado sin acceso obtiene 403 al listar proyectos', deniedProjects.status === 403);
  } else skipped.push('usuario denegado: sin MANTTO_QA_DENIED_TOKEN');
  return {checks,skipped};
}

async function main_cor(argv=process.argv.slice(2)) {
  const args = parseArgs_cor(argv);
  const result = await smoke_cor(args);
  for (const label of result.checks) console.log('PASS '+label);
  for (const label of result.skipped) console.log('NO EJECUTADO '+label);
  console.log('READONLY TERMINADO: '+result.checks.length+' controles, '+result.skipped.length+' casos no ejecutados.');
}
if (require.main === module) {
  main_cor().catch(error => {
    console.error('QA FIX 4:',String(error?.message || 'fallo').slice(0,220));
    process.exitCode=1;
  });
}
module.exports={parseArgs_cor,allowedFields_cor,ensureProjection_cor,smoke_cor,main_cor};
