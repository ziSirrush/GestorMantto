#!/usr/bin/env node
'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
// Herramienta opt-in: SOLO GET. No PATCH/POST/PUT/DELETE ni consultas SQL.
// No imprime tokens, cuerpos operativos ni nombres de proyectos/personas.
const assert = require('node:assert/strict');

const PATH_COR = '/api/instalaciones/administracion';
const EXPECTED_GROUPS_COR = 11;

function parseArgs_cor(args) {
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--readonly') { values.readonly = true; continue; }
    if (!['--base-url', '--record-id', '--query'].includes(arg)) {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
    if (!args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Falta el valor de ${arg}.`);
    }
    values[arg.slice(2)] = args[++index];
  }
  if (!values.readonly) throw new Error('Se requiere --readonly como confirmacion explicita del modo sin escrituras.');
  if (!values['base-url']) throw new Error('Falta --base-url.');
  const url = new URL(values['base-url']);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('Solo se acepta HTTPS o HTTP local.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('La URL debe ser una raiz de API sin usuario, query, hash ni ruta adicional.');
  }
  let recordId = null;
  if (values['record-id'] !== undefined) {
    recordId = Number(values['record-id']);
    if (!Number.isSafeInteger(recordId) || recordId <= 0) throw new Error('record-id debe ser un entero positivo.');
  }
  const query = String(values.query || '').trim();
  if (query.length > 255) throw new Error('query excede 255 caracteres.');
  return { baseUrl: url.origin, recordId, query };
}

function groupFields_cor(contract) {
  const all = new Set(contract.system_readonly_fields || []);
  for (const group of contract.groups || []) {
    if (group.permissions?.can_view !== true) continue;
    for (const field of group.fields || []) all.add(field);
  }
  return all;
}

function ensureAuthorizedProjection_cor(data, contract, description) {
  assert.ok(data && typeof data === 'object' && !Array.isArray(data), description + ': cuerpo de datos invalido');
  const allowed = groupFields_cor(contract);
  for (const key of Object.keys(data)) {
    assert.ok(allowed.has(key), description + ': campo sin permiso en respuesta: ' + key);
  }
  assert.ok(Object.prototype.hasOwnProperty.call(data, 'id_ins_fl'), description + ': falta ID de registro');
}

async function smoke_cor(options, dependencies = {}) {
  const fetcher = dependencies.fetch || globalThis.fetch;
  const token = String(dependencies.token || process.env.MANTTO_QA_TOKEN || '').trim();
  const deviceToken = String(dependencies.deviceToken || process.env.MANTTO_QA_DEVICE_TOKEN || '').trim();
  if (!token) throw new Error('Configura MANTTO_QA_TOKEN en la sesion actual. No coloques el token en argumentos.');
  if (typeof fetcher !== 'function') throw new Error('Node con fetch es obligatorio.');
  const checks = [];
  async function request(path, authorized) {
    const headers = { Accept:'application/json', 'Cache-Control':'no-store' };
    if (authorized) {
      headers.Authorization = 'Bearer ' + token;
      if (deviceToken) headers['X-Device-Token'] = deviceToken;
    }
    const response = await fetcher(options.baseUrl + path, {
      method:'GET', headers, redirect:'error', signal:AbortSignal.timeout(15000)
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json };
  }
  function add(name, ok) {
    checks.push({ name, ok: Boolean(ok) });
    if (!ok) throw new Error('No paso el control: ' + name);
  }

  const guest = await request(PATH_COR+'/contrato',false);
  add('guard sin sesion (401/403)', [401,403].includes(guest.status));

  const contractResponse = await request(PATH_COR+'/contrato',true);
  add('contrato autenticado (HTTP 200)', contractResponse.status===200 && contractResponse.body?.ok===true);
  const contract = contractResponse.body;
  add('11 grupos del contrato', Array.isArray(contract.groups) && contract.groups.length===EXPECTED_GROUPS_COR);
  add('permisos por grupo', contract.groups.every(g=>g?.permissions && typeof g.permissions.can_view==='boolean' && typeof g.permissions.can_edit==='boolean'));

  const badId = await request(PATH_COR+'/registros/id-invalido',true);
  add('ID invalido rechazado (HTTP 400)',badId.status===400);
  const badLimit = await request(PATH_COR+'/registros?limit=101',true);
  add('limite excesivo rechazado (HTTP 400)',badLimit.status===400);

  const search = new URLSearchParams({limit:'5'});
  if (options.query) search.set('q', options.query);
  const recordsResponse = await request(PATH_COR+'/registros?'+search.toString(),true);
  add('busqueda autorizada (HTTP 200)',recordsResponse.status===200 && Array.isArray(recordsResponse.body?.data));
  const records = recordsResponse.body.data;
  add('sin fuga de campos en listado', records.every(row => {
    try { ensureAuthorizedProjection_cor(row,contract,'listado'); return true; }
    catch (_) {return false;}
  }));

  if (options.recordId) {
    const detailResponse = await request(PATH_COR+'/registros/'+options.recordId,true);
    add('detalle autorizado por ID (HTTP 200)',detailResponse.status===200 && detailResponse.body?.ok===true);
    ensureAuthorizedProjection_cor(detailResponse.body.data,contract,'detalle');
    add('sin fuga de campos en detalle',true);
    add('ID solicitado coincide',Number(detailResponse.body.data.id_ins_fl)===options.recordId);
  }
  return { checks, records_count: records.length, groups_count: contract.groups.length };
}

async function main_cor(argv = process.argv.slice(2)) {
  const options = parseArgs_cor(argv);
  const result = await smoke_cor(options);
  for (const entry of result.checks) console.log('PASS ' + entry.name);
  console.log(`COMPLETADO: ${result.checks.length} controles de solo lectura. Registros consultados: ${result.records_count}.`);
}

if (require.main === module) {
  main_cor().catch(error => {
    // No imprimir payloads de APIs, URLs con tokens ni stacks sensibles.
    console.error('QA READONLY ERROR: ' + String(error?.message || 'error').slice(0,300));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs_cor, groupFields_cor, ensureAuthorizedProjection_cor, smoke_cor, main_cor };
