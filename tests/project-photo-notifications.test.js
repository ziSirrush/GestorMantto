'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(
  root,
  'backend/src/services/notifications/project-photo-notification.service.js'
);

const state = {
  panelRecipientIds: [],
  emissions: [],
  queries: 0
};

const dbStub = {
  async query(sql, params) {
    state.queries += 1;
    const text = String(sql);
    assert.match(text, /FROM notificacion_eventos e/);
    assert.match(text, /INNER JOIN notificacion_evento_roles ner/);
    assert.match(text, /ner\.activo = 1/);
    assert.match(text, /ner\.politica IN \('OBLIGATORIA', 'OPCIONAL'\)/);
    assert.match(text, /INNER JOIN usuario_roles ur/);
    assert.match(text, /ur\.activo = 1/);
    assert.match(text, /u\.estado = 1/);
    assert.doesNotMatch(text, /DIRECTOR GENERAL/);
    assert.deepEqual(params, ['FOTOGRAFIA_PROYECTO_ACTUALIZADA']);
    return [state.panelRecipientIds.map((id) => ({ id_SB: id }))];
  }
};

const emitterStub = {
  async emitBusinessEventSafe_gnral(input) {
    state.emissions.push({ ...input });
    return {
      ok: true,
      created: input.destinatarios.length,
      skipped: 0,
      recipients: input.destinatarios.slice(),
      trace_id: `photo-trace-${state.emissions.length}`
    };
  }
};

function loadService() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../config/db') return dbStub;
    if (request === '../../shared/logger') return { info() {}, warn() {}, error() {} };
    if (request === '../../middleware/project-photo.middleware') return {
      userCanManageProjectPhotos_gnral: (user) => Array.isArray(user?.roles) && user.roles.includes('Gestor de Fotografías')
    };
    if (request === './notification-business-emitter.service') return emitterStub;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(servicePath)];
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

const service = loadService();

function reset() {
  state.panelRecipientIds = [];
  state.emissions = [];
  state.queries = 0;
}

function manager(id = 70) {
  return {
    user: {
      id_SB: id,
      nombre: 'Gestora Foto',
      roles: ['Gestor de Fotografías']
    }
  };
}

test('carga de fotografía incluye todos los destinatarios habilitados en el Panel (DG y Auxiliar)', async () => {
  reset();
  state.panelRecipientIds = [1, 2, 2];

  const result = await service.notifyProjectPhotoUploaded_gnral({
    domain: 'CORELLIAN',
    projectId: 'PPNS-100',
    photoRecordId: 44,
    slot: 'foto_blt_2',
    storageUrl: 'https://storage.test/corellian/photo-1.jpg',
    actionContext: manager()
  });

  assert.equal(result.created, 2);
  assert.equal(state.emissions.length, 1);
  assert.deepEqual(state.emissions[0].destinatarios, [1, 2]);
  assert.equal(state.emissions[0].codigoEvento, 'FOTOGRAFIA_PROYECTO_ACTUALIZADA');
  assert.equal(state.emissions[0].actorUserId, 70);
  assert.equal(state.emissions[0].excludeActor, false);
  assert.equal(state.emissions[0].requireRoleMatrix, true);
  assert.equal(state.emissions[0].zonaOperativaNoAplica, true);
  assert.equal(state.emissions[0].ruta, 'detalle:proyecto-corellian:PPNS-100');
  assert.match(state.emissions[0].titulo, /cargada/i);
  assert.match(state.emissions[0].mensaje, /Gestora Foto cargó/);
  assert.match(state.emissions[0].eventInstanceKey, /:CARGADA:CORELLIAN:/);
});

test('eliminación de fotografía mantiene mensaje y audiencia de la matriz', async () => {
  reset();
  state.panelRecipientIds = [9];

  await service.notifyProjectPhotoDeleted_gnral({
    domain: 'UNITED',
    projectId: 'Proyecto Norte',
    photoRecordId: 81,
    slot: 'foto_5',
    storageUrl: 'https://storage.test/united/photo-5.jpg',
    actionContext: manager(9)
  });

  assert.equal(state.emissions.length, 1);
  assert.deepEqual(state.emissions[0].destinatarios, [9]);
  assert.equal(state.emissions[0].excludeActor, false);
  assert.match(state.emissions[0].titulo, /eliminada/i);
  assert.match(state.emissions[0].mensaje, /eliminó.*Proyecto Norte.*United/);
  assert.match(state.emissions[0].eventInstanceKey, /:ELIMINADA:UNITED:/);
  assert.equal(state.emissions[0].ruta, 'detalle:proyecto:Proyecto Norte');
});

test('un actor sin rol Gestor de Fotografías no resuelve destinatarios ni emite', async () => {
  reset();
  state.panelRecipientIds = [1];

  const result = await service.notifyProjectPhotoUploaded_gnral({
    domain: 'CORELLIAN',
    projectId: 'PPNS-200',
    photoRecordId: 45,
    slot: 'foto_blt_1',
    storageUrl: 'https://storage.test/corellian/photo-2.jpg',
    actionContext: { user: { id_SB: 8, roles: ['Programador'] } }
  });

  assert.equal(result.reason, 'ACTOR_SIN_ROL_GESTOR_FOTOGRAFIAS');
  assert.equal(state.queries, 0);
  assert.equal(state.emissions.length, 0);
});

test('contrato del motor: panel es fuente de verdad y ambos dominios emiten despues del commit', {
  skip: [
    'backend/src/controllers/panel-control-notificaciones.controller.js',
    'backend/src/controllers/ins-fl.controller.js',
    'backend/src/modules/portafolio/portafolio-proyecto-fotos_uni.js'
  ].some(file => !fs.existsSync(path.join(root, file))) ? 'Requiere checkout completo del repositorio' : false
}, () => {
  const service = fs.readFileSync(servicePath, 'utf8');
  const panel = fs.readFileSync(
    path.join(root, 'backend/src/controllers/panel-control-notificaciones.controller.js'),
    'utf8'
  );
  const coreController = fs.readFileSync(
    path.join(root, 'backend/src/controllers/ins-fl.controller.js'),
    'utf8'
  );
  const unitedController = fs.readFileSync(
    path.join(root, 'backend/src/modules/portafolio/portafolio-proyecto-fotos_uni.js'),
    'utf8'
  );

  assert.match(service, /JOIN notificacion_evento_roles ner/);
  assert.match(service, /requireRoleMatrix: true/);
  assert.doesNotMatch(service, /DIRECTOR GENERAL/);
  assert.match(panel, /notificacion_evento_roles/);
  assert.match(panel, /politica IN \('OBLIGATORIA', 'OPCIONAL'\)/);

  for (const source of [coreController, unitedController]) {
    assert.ok(source.indexOf('await conn.commit()') < source.indexOf('notifyProjectPhotoUploaded_gnral({'));
    assert.match(source, /notifyProjectPhotoDeleted_gnral\(\{/);
  }
});
