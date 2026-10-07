'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(process.argv[2] || process.cwd());
let passed = 0;

function pass(label) {
  passed += 1;
  console.log(`PASS ${label}`);
}

function file(rel) {
  const absolute = path.join(repo, rel);
  assert.ok(fs.existsSync(absolute), `Falta archivo requerido: ${rel}`);
  return absolute;
}

function text(rel) {
  return fs.readFileSync(file(rel), 'utf8');
}

function requireText(source, needle, label) {
  assert.ok(source.includes(needle), `${label}: falta ${needle}`);
}

const requiredFiles = [
  'backend/src/modules/entregas-control/entregas-control.controller.js',
  'backend/src/modules/entregas-control/entregas-control.repository.js',
  'backend/src/modules/entregas-control/entregas-control.routes.js',
  'backend/src/modules/entregas-control/entregas-control.service.js',
  'backend/src/routes/index.js',
  'core/app.js',
  'core/router.js',
  'index.html',
  'modules/entregas-control/entregas-control.js',
  'modules/entregas-control/entregas-control.css'
];
requiredFiles.forEach(file);
pass('archivos Fase 1 presentes');

const jsFiles = requiredFiles.filter(name => name.endsWith('.js'));
for (const rel of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file(rel)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `node --check fallo en ${rel}: ${result.stderr || result.stdout}`);
}
pass('node --check archivos JS');

const routesIndex = text('backend/src/routes/index.js');
requireText(routesIndex, "require('../modules/entregas-control/entregas-control.routes')", 'backend routes');
requireText(routesIndex, "router.use('/entregas', entregasControlRoutes);", 'backend routes');
pass('registro backend /api/entregas');

const app = text('core/app.js');
requireText(app, "const ENTREGAS_CONTROL_ROUTE_GNRAL = 'entregas-control';", 'core/app.js');
requireText(app, 'bindEntregasControl_gnral();', 'core/app.js');
pass('carga dinámica frontend');

const router = text('core/router.js');
requireText(router, "'entregas-control':'Control de Entregas'", 'core/router.js');
pass('ruta frontend registrada');

const index = text('index.html');
requireText(index, 'data-group="entregas"', 'index.html');
requireText(index, 'data-route="entregas-control"', 'index.html');
requireText(index, 'data-permission-code="ENTREGAS_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL"', 'index.html');
pass('sidebar Entregas con permiso nativo');

const frontend = text('modules/entregas-control/entregas-control.js');
for (const tab of ['programadas', 'mis-entregas', 'validacion', 'indicadores']) {
  requireText(frontend, `data-tab="${tab}"`, 'frontend tabs');
}
for (const endpoint of [
  '/api/entregas/opciones',
  '/api/entregas/programadas',
  '/api/entregas/mis-entregas',
  '/api/entregas/validacion',
  '/api/entregas/indicadores',
  '/api/entregas/instancias/'
]) requireText(frontend, endpoint, 'frontend API');
requireText(frontend, 'await loadProgramadas()', 'refresco mutación');
requireText(frontend, 'await loadMisEntregas()', 'refresco mutación');
requireText(frontend, 'await loadValidation()', 'refresco mutación');
pass('frontend 4 pestañas + refresco selectivo');

const css = text('modules/entregas-control/entregas-control.css');
assert.ok(/@media\s*\(max-width:\s*680px\)/.test(css), 'Falta regla responsive móvil');
pass('responsive/PWA CSS');

const servicePath = file('backend/src/modules/entregas-control/entregas-control.service.js');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
for (const forbidden of ['ManttoLabBlobStore', 'IndexedDB', 'Supabase', 'Railway']) {
  assert.ok(!serviceSource.toLowerCase().includes(forbidden.toLowerCase()), `Referencia no permitida: ${forbidden}`);
}
for (const required of [
  "empresa: 'BLT'",
  "modulo: 'entregas'",
  'storageContract.uploadAndPersist_gnral',
  'storageAccess.createReadAccess_gnral',
  "timeZone: 'America/Mexico_City'"
]) requireText(serviceSource, required, 'service contract');
pass('Aiven/Azure/horario productivo sin almacenamiento LAB');

function baseMocks() {
  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async () => [[]]
  };
  return {
    conn,
    db: { getConnection: async () => conn, query: async () => [[]] },
    repository: {},
    azureStorage: { deleteBlob_gnral: async () => ({ deleted: true }) },
    storageContract: { uploadAndPersist_gnral: async () => { throw new Error('storage mock no configurado'); } },
    storageAccess: { createReadAccess_gnral: async () => ({}) },
    filePolicy: { validateFile_gnral: () => true }
  };
}

function loadService(mocks) {
  delete require.cache[servicePath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../../config/db') return mocks.db;
    if (request === '../../services/storage/azure-storage.service') return mocks.azureStorage;
    if (request === '../../services/storage/storage-contract.service') return mocks.storageContract;
    if (request === '../../services/storage/storage-access.service') return mocks.storageAccess;
    if (request === '../../services/storage/storage-file-policy.service') return mocks.filePolicy;
    if (request === './entregas-control.repository') return mocks.repository;
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(servicePath); }
  finally { Module._load = originalLoad; }
}

{
  const m = baseMocks();
  const s = loadService(m);
  assert.equal(s.nextOccurrenceDate_gnral('SEMANAL', '2026-10-07', 2), '2026-10-14');
  assert.equal(s.nextOccurrenceDate_gnral('QUINCENAL', '2026-10-07', 3), '2026-11-06');
  assert.equal(s.nextOccurrenceDate_gnral('MENSUAL', '2026-01-31', 2), '2026-02-28');
  assert.equal(s.nextOccurrenceDate_gnral('MENSUAL', '2024-01-31', 2), '2024-02-29');
  assert.equal(s.deliveryState_gnral({ fecha_entrega_dia: '2026-10-07', fecha_limite: '2026-10-07' }, '2026-10-08'), 'A_TIEMPO');
  assert.equal(s.deliveryState_gnral({ fecha_entrega_dia: '2026-10-08', fecha_limite: '2026-10-07' }, '2026-10-08'), 'TARDE');
  assert.equal(s.deliveryState_gnral({ fecha_entrega_dia: null, fecha_limite: '2026-10-06' }, '2026-10-07'), 'NO_ENTREGADO');
  assert.equal(s.deliveryState_gnral({ fecha_entrega_dia: null, fecha_limite: '2026-10-07' }, '2026-10-07'), 'PENDIENTE');
  assert.equal(s.validationState_gnral({ validado: 1, fecha_entrega: 'x' }), 'VALIDO');
  assert.equal(s.validationState_gnral({ validado: 0, fecha_entrega: 'x' }), 'RECHAZADO');
  assert.equal(s.validationState_gnral({ validado: null, fecha_entrega: 'x' }), 'SIN_REVISAR');
  pass('recurrencia + estados');
}

(async () => {
  {
    const m = baseMocks();
    let insertedProgramada = null;
    let insertedInstances = null;
    m.repository.getActiveUserById_gnral = async (_c, id) => ({ id_SB: id, nombre: 'Colaborador' });
    m.repository.insertProgramada_gnral = async (_c, row) => { insertedProgramada = row; return 77; };
    m.repository.insertInstancias_gnral = async (_c, id, rows) => { insertedInstances = { id, rows }; return rows.length; };
    m.repository.getProgramadaById_gnral = async () => ({ id_entrega_programada: 77, id_responsable: 5, id_colaborador: 9, titulo: 'Reporte' });
    m.repository.listInstanciasByProgramada_gnral = async () => insertedInstances.rows.map(row => ({ ...row, id_instancia: row.numero_ocurrencia, fecha_entrega: null }));
    const s = loadService(m);
    const result = await s.crearProgramada_gnral(5, {
      id_colaborador: 9,
      titulo: ' Reporte ',
      descripcion: ' X ',
      tipo_recurrencia: 'SEMANAL',
      fecha_inicio: '2026-10-07'
    });
    assert.equal(insertedProgramada.id_responsable, 5);
    assert.equal(insertedInstances.rows.length, 12);
    assert.equal(insertedInstances.rows[11].fecha_limite, '2026-12-23');
    assert.equal(result.total, 12);
    pass('alta programada transaccional + horizonte 12');
  }

  {
    const m = baseMocks();
    m.repository.getProgramadaById_gnral = async () => ({ id_entrega_programada: 1, id_responsable: 8 });
    m.repository.listInstanciasByProgramada_gnral = async () => [];
    const s = loadService(m);
    await assert.rejects(() => s.detalleProgramada_gnral(7, 1), error => error.code === 'ENTREGAS_OWNER_REQUIRED' && error.status === 403);
    pass('detalle fail-closed por responsable');
  }

  {
    const m = baseMocks();
    let persisted = null;
    let deletedOld = null;
    m.repository.getInstanciaContext_gnral = async (_executor, id, options) => {
      if (options && options.forUpdate) {
        return { id_instancia: id, id_entrega_programada: 11, id_colaborador: 9, id_responsable: 5, programada_activa: 1, storage_blob_name: 'old/blob.pdf', storage_container: 'private' };
      }
      if (persisted) {
        return { id_instancia: id, id_entrega_programada: 11, id_colaborador: 9, id_responsable: 5, programada_activa: 1, ...persisted, fecha_entrega_dia: '2026-10-07' };
      }
      return { id_instancia: id, id_entrega_programada: 11, id_colaborador: 9, id_responsable: 5, programada_activa: 1, storage_blob_name: 'old/blob.pdf', storage_container: 'private' };
    };
    m.repository.updateInstanciaArchivo_gnral = async (_c, _id, row) => { persisted = row; return 1; };
    m.storageContract.uploadAndPersist_gnral = async options => {
      const uploaded = {
        nombre_original: 'nuevo.pdf', mime_type: 'application/pdf', tamano_bytes: 123,
        storage_provider: 'AZURE_BLOB', storage_container: 'private', storage_blob_name: 'new/blob.pdf'
      };
      return { uploaded, persisted: await options.persist(uploaded) };
    };
    m.azureStorage.deleteBlob_gnral = async name => { deletedOld = name; return { deleted: true }; };
    const s = loadService(m);
    const out = await s.subirArchivo_gnral(9, 33, { originalname: 'nuevo.pdf', mimetype: 'application/pdf', size: 123, buffer: Buffer.from('x') });
    assert.equal(persisted.entregado_por, 9);
    assert.equal(persisted.storage_blob_name, 'new/blob.pdf');
    assert.equal(deletedOld, 'old/blob.pdf');
    assert.equal(out.instancia.estado_validacion, 'SIN_REVISAR');
    pass('Azure upload/persist/cleanup contract');
  }

  {
    const m = baseMocks();
    m.repository.getInstanciaContext_gnral = async () => ({ id_instancia: 2, id_entrega_programada: 1, id_colaborador: 9, id_responsable: 5, programada_activa: 1 });
    const s = loadService(m);
    await assert.rejects(() => s.subirArchivo_gnral(7, 2, { originalname: 'x.pdf' }), error => error.code === 'ENTREGAS_COLLABORATOR_REQUIRED' && error.status === 403);
    pass('carga fail-closed por colaborador');
  }

  {
    const m = baseMocks();
    m.repository.getInstanciaContext_gnral = async () => ({
      id_instancia: 3, id_colaborador: 9, id_responsable: 5,
      storage_provider: 'AZURE_BLOB', storage_container: 'private', storage_blob_name: 'x',
      nombre_archivo: 'a.pdf', mime_type: 'application/pdf', tamano_bytes: 1
    });
    m.storageAccess.createReadAccess_gnral = async options => ({ access_url: 'sas', authorization: (await options.authorize()).metadata });
    const s = loadService(m);
    assert.equal((await s.archivoAcceso_gnral({ user: { id_SB: 5 }, query: {} }, 3)).authorization.rol_entrega, 'RESPONSABLE');
    assert.equal((await s.archivoAcceso_gnral({ user: { id_SB: 9 }, query: {} }, 3)).authorization.rol_entrega, 'COLABORADOR');
    await assert.rejects(() => s.archivoAcceso_gnral({ user: { id_SB: 7 }, query: {} }, 3), error => error.code === 'ENTREGAS_ARCHIVO_FORBIDDEN' && error.status === 403);
    pass('SAS autorizado solo responsable/colaborador');
  }

  {
    const m = baseMocks();
    let update = null;
    m.repository.getInstanciaContext_gnral = async () => ({
      id_instancia: 4, id_colaborador: 9, id_responsable: 5,
      storage_blob_name: 'x', fecha_entrega: '2026-10-07 10:00:00', fecha_entrega_dia: '2026-10-07', fecha_limite: '2026-10-08',
      validado: update ? update.validado : null,
      validado_por: update ? update.validado_por : null,
      comentario_validacion: update ? update.comentario_validacion : null
    });
    m.repository.updateValidacion_gnral = async (_db, _id, row) => { update = row; return 1; };
    const s = loadService(m);
    const out = await s.validar_gnral(5, 4, { valido: false, comentario: 'Incorrecto' });
    assert.equal(update.validado, 0);
    assert.equal(out.estado_validacion, 'RECHAZADO');
    await assert.rejects(() => s.validar_gnral(6, 4, { valido: true }), error => error.code === 'ENTREGAS_VALIDATOR_REQUIRED' && error.status === 403);
    pass('validación solo responsable');
  }

  const routesPath = file('backend/src/modules/entregas-control/entregas-control.routes.js');
  delete require.cache[routesPath];
  const registrations = [];
  const fakeRouter = {
    get: (routePath, ...handlers) => registrations.push({ method: 'GET', path: routePath, handlers }),
    post: (routePath, ...handlers) => registrations.push({ method: 'POST', path: routePath, handlers }),
    delete: (routePath, ...handlers) => registrations.push({ method: 'DELETE', path: routePath, handlers })
  };
  const express = { Router: () => fakeRouter };
  const controller = new Proxy({}, { get: (_target, prop) => function controllerStub() { return prop; } });
  const permissions = {
    programadas_ver: 'PV', programadas_crear: 'PC', programadas_desactivar: 'PD',
    mis_entregas_ver: 'MV', mis_entregas_adjuntar: 'MA', validacion_ver: 'VV', validacion_validar: 'VA', indicadores_ver: 'IV'
  };
  const guardCalls = [];
  let uploadOptions = null;
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'express') return express;
    if (request === './entregas-control.controller') return controller;
    if (request === './entregas-control.service') return { PERMISSIONS_GNRAL: permissions };
    if (request === '../../middleware/information-access-gnral.middleware') {
      return { humanInformationGuard_gnral: options => { guardCalls.push(options); return [function auth() {}, function guard() {}]; } };
    }
    if (request === '../../middleware/storage-upload.middleware') {
      return { createUploadMiddleware_gnral: options => { uploadOptions = options; return function upload() {}; } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try { require(routesPath); }
  finally { Module._load = originalLoad; }

  const expectedRoutes = [
    ['GET', '/opciones'], ['GET', '/programadas'], ['GET', '/programadas/:id'], ['POST', '/programadas'], ['DELETE', '/programadas/:id'],
    ['GET', '/mis-entregas'], ['POST', '/instancias/:id/archivo'], ['GET', '/instancias/:id/archivo/acceso'],
    ['GET', '/validacion'], ['POST', '/instancias/:id/validar'], ['GET', '/indicadores']
  ];
  assert.deepEqual(registrations.map(row => [row.method, row.path]), expectedRoutes);
  assert.deepEqual(uploadOptions, { fieldName: 'archivo', maxFiles: 1, required: true, policyName: 'GENERAL' });
  for (const call of guardCalls) {
    assert.equal(call.domain, 'GENERAL');
    assert.equal(call.groupingCode, 'ENTREGAS');
  }
  pass('11 rutas + guards GENERAL/ENTREGAS + upload policy');

  console.log(`\nRESULTADO LOCAL: PASS (${passed} bloques)`);
})().catch(error => {
  console.error('\nRESULTADO LOCAL: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
