'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const sourcePath = path.resolve(__dirname, '../backend/src/services/notifications/project-photo-notification.service.js');
const EVENT = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA';
const actor = {
  user: { id_SB: 44, nombre: 'Gestor de prueba', roles: ['Gestor de Fotografías'] }
};
const photo = {
  domain: 'CORELLIAN', projectId: 'P10152', photoRecordId: 91,
  slot: 'foto_blt_3', storageUrl: 'https://storage.test/foto.jpg', actionContext: actor
};

function makeState() {
  return {
    eventActive: true,
    users: [
      { id: 10, active: true, roles: [1] },       // DG (solo dato de prueba)
      { id: 20, active: true, roles: [2] },       // Aux. Direccion
      { id: 30, active: true, roles: [3] },       // Rol no autorizado
      { id: 44, active: true, roles: [1, 2] },   // Gestor con dos roles receptores
      { id: 60, active: false, roles: [2] }
    ],
    roles: [
      { id: 1, active: true },
      { id: 2, active: true },
      { id: 3, active: true }
    ],
    matrix: [
      { id: 1, enabled: true, policy: 'OBLIGATORIA' },
      { id: 2, enabled: true, policy: 'OPCIONAL' },
      { id: 3, enabled: false, policy: 'OPCIONAL' }
    ],
    queries: [], emissions: [], logs: [], override: null, dbError: null
  };
}

function load(state) {
  const db = {
    async query(sql, params) {
      state.queries.push({ sql, params });
      if (state.dbError) throw state.dbError;
      // SQL contractual: la autorizacion surge del evento + matriz + rol activo
      // + asignacion de rol vigente + usuario activo, no del nombre del cargo.
      assert.match(sql, /FROM notificacion_eventos e/);
      assert.match(sql, /JOIN notificacion_evento_roles ner/);
      assert.match(sql, /ner\.activo = 1/);
      assert.match(sql, /ner\.politica IN \('OBLIGATORIA', 'OPCIONAL'\)/);
      assert.match(sql, /JOIN roles r/);
      assert.match(sql, /r\.estado = 1/);
      assert.match(sql, /JOIN usuario_roles ur/);
      assert.match(sql, /ur\.activo = 1/);
      assert.match(sql, /JOIN usuarios u/);
      assert.match(sql, /u\.estado = 1/);
      assert.match(sql, /e\.activo = 1/);
      assert.match(sql, /WHERE e\.codigo_evento = \?/);
      assert.doesNotMatch(sql, /DIRECTOR GENERAL|AUXILIAR DE DIRECCION/i);
      assert.deepEqual(params, [EVENT]);
      if (!state.eventActive) return [[]];
      // Emula los JOIN a partir del estado de los fixtures, NO ejecuta MySQL.
      const permitted = new Set(state.matrix.filter(m => m.enabled &&
        ['OBLIGATORIA', 'OPCIONAL'].includes(m.policy) &&
        state.roles.some(r => r.id === m.id && r.active)).map(m => m.id));
      const rows = state.users
        .filter(user => user.active && user.roles.some(role => permitted.has(role)))
        .map(user => ({ id_SB: user.id }));
      return [rows];
    }
  };
  const emitter = {
    async emitBusinessEventSafe_gnral(input) {
      state.emissions.push(input);
      return state.override || {
        ok: true, created: input.destinatarios.length, skipped: 0,
        recipients: input.destinatarios, bell_recipients: input.destinatarios,
        push_recipients: input.destinatarios, trace_id: 'matrix-v002'
      };
    }
  };
  const logger = {
    info(code, context) { state.logs.push({ level: 'info', code, context }); },
    warn(code, context) { state.logs.push({ level: 'warn', code, context }); },
    error(code, context) { state.logs.push({ level: 'error', code, context }); }
  };
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../config/db') return db;
    if (request === '../../shared/logger') return logger;
    if (request === './notification-business-emitter.service') return emitter;
    if (request === '../../middleware/project-photo.middleware') return {
      userCanManageProjectPhotos_gnral: user => Boolean(user?.roles?.includes('Gestor de Fotografías'))
    };
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(sourcePath)];
    return require(sourcePath);
  } finally {
    Module._load = original;
  }
}

test('Panel: Dirección General y Auxiliar reciben el evento si ambos roles están activos', async () => {
  const state = makeState();
  const service = load(state);
  const result = await service.notifyProjectPhotoUploaded_gnral(photo);
  assert.equal(result.created, 3);
  assert.deepEqual(state.emissions[0].destinatarios, [10, 20, 44]);
  assert.equal(state.emissions[0].ruta, 'detalle:proyecto-corellian:P10152');
  assert.equal(state.emissions[0].requireRoleMatrix, true);
  assert.equal(state.emissions[0].excludeActor, false);
  assert.equal(state.logs.at(-1).context.destinatarios_panel_candidatos, 3);
});

test('Panel: Auxiliar puede recibir aunque Dirección General no esté habilitado', async () => {
  const state = makeState();
  state.matrix[0].enabled = false;
  const service = load(state);
  const result = await service.notifyProjectPhotoUploaded_gnral(photo);
  assert.equal(result.created, 2);
  assert.deepEqual(state.emissions[0].destinatarios, [20, 44]);
});

test('Panel: deshabilitar el rol Auxiliar excluye a su usuario sin cambios de código', async () => {
  const state = makeState();
  state.matrix[1].enabled = false;
  const service = load(state);
  await service.notifyProjectPhotoUploaded_gnral(photo);
  assert.deepEqual(state.emissions[0].destinatarios, [10, 44]);
});

test('Panel: habilitar otro rol posteriormente lo incluye automáticamente', async () => {
  const state = makeState();
  state.matrix[2].enabled = true;
  const service = load(state);
  await service.notifyProjectPhotoUploaded_gnral(photo);
  assert.deepEqual(state.emissions[0].destinatarios, [10, 20, 30, 44]);
});

test('Matriz: un usuario con dos roles autorizados solo recibe una notificación', async () => {
  const state = makeState();
  const service = load(state);
  const ids = await service.notificationMatrixRecipientIds_gnral();
  assert.equal(ids.filter(id => id === 44).length, 1);
  assert.deepEqual(ids, [10, 20, 44]);
});

test('Matriz: eventos inactivos o sin roles activos fallan cerrados', async () => {
  const state = makeState();
  state.eventActive = false;
  const service = load(state);
  const result = await service.notifyProjectPhotoUploaded_gnral(photo);
  assert.equal(result.created, 0);
  assert.equal(result.reason, 'SIN_DESTINATARIOS_HABILITADOS_EN_PANEL');
  assert.equal(state.emissions.length, 0);
  assert.equal(state.logs.at(-1).code, '[PROJECT_PHOTO_NOTIFICATION_NO_PANEL_RECIPIENTS]');
});

test('Matriz: roles y usuarios inactivos no son destinatarios', async () => {
  const state = makeState();
  state.roles.find(r => r.id === 2).active = false;
  state.users.find(u => u.id === 10).active = false;
  const service = load(state);
  const ids = await service.notificationMatrixRecipientIds_gnral();
  assert.deepEqual(ids, [44]);
});

test('United: respeta ruta de portafolio y audiencia del mismo Panel', async () => {
  const state = makeState();
  const service = load(state);
  await service.notifyProjectPhotoDeleted_gnral({ ...photo, domain: 'UNITED' });
  assert.deepEqual(state.emissions[0].destinatarios, [10, 20, 44]);
  assert.equal(state.emissions[0].ruta, 'detalle:proyecto:P10152');
});

test('La capa de emision sigue evaluando canales/OPCIONAL; el origen no los fuerza', async () => {
  const state = makeState();
  state.override = {
    ok: true, created: 1, skipped: 2, recipients: [10], bell_recipients: [10],
    push_recipients: [], reason: 'PREFERENCIA_DESACTIVADA', trace_id: 'matrix-policy'
  };
  const service = load(state);
  const result = await service.notifyProjectPhotoUploaded_gnral(photo);
  assert.equal(result.created, 1);
  assert.deepEqual(result.push_recipients, []);
  assert.equal(state.logs.at(-1).context.push_elegibles, 0);
  assert.equal(state.emissions[0].requireRoleMatrix, true);
});

test('Error al consultar la matriz: no se envian avisos ni se amplian destinatarios', async () => {
  const state = makeState();
  state.dbError = Object.assign(new Error('DB no disponible'), { code: 'ER_CONN' });
  const service = load(state);
  const result = await service.notifyProjectPhotoUploaded_gnral(photo);
  assert.equal(result.created, 0);
  assert.equal(result.reason, 'ERROR_NOTIFICACION_FOTOGRAFIA_PROYECTO');
  assert.equal(state.emissions.length, 0);
  assert.equal(state.logs.at(-1).code, '[PROJECT_PHOTO_NOTIFICATION_FAILED]');
});
