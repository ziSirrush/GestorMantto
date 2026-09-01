'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const jobPath = path.join(root, 'backend/src/jobs/almacenCierreIncorrecto.job.js');
const modulePaths = {
  db:path.join(root, 'backend/src/config/db.js'),
  logger:path.join(root, 'backend/src/shared/logger.js'),
  source:path.join(root, 'backend/src/modules/almacen/almacen.source-engine.js'),
  azure:path.join(root, 'backend/src/services/storage/azure-storage.service.js'),
  permission:path.join(root, 'backend/src/services/permissions/effective-permission.service.js'),
  emitter:path.join(root, 'backend/src/services/notifications/notification-business-emitter.service.js')
};

const state = {};
function reset() {
  state.active = null;
  state.expected = null;
  state.blobExists = true;
  state.recipients = [];
  state.emissions = [];
  state.queries = [];
}

const dbMock = {
  async query(sql, params) {
    state.queries.push({ sql, params });
    if (sql.includes('TIMESTAMPDIFF')) return [state.active ? [state.active] : []];
    if (sql.includes('fecha_corte BETWEEN')) return [state.expected ? [state.expected] : []];
    throw new Error(`Consulta no simulada: ${sql}`);
  }
};
const sourceMock = {
  TABLE:'almacen_fuente_excel',
  RECORD_TYPES:{ ARCHIVE:'ARCHIVO' },
  async archiveRecordByLot(lotId) {
    return state.expected && lotId === state.expected.loteImportacion
      ? { metadata:{ storage_blob_name:`almacen/${lotId}.xlsx`, storage_container:'private' } }
      : null;
  }
};
const azureMock = { async blobExists_gnral() { return state.blobExists; } };
const permissionMock = {
  async listUsersWithEffectivePermission(code) {
    assert.equal(code, 'ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL');
    return state.recipients;
  }
};
const emitterMock = {
  async emitBusinessEventSafe_gnral(input) {
    state.emissions.push(input);
    return { ok:true, created:input.destinatarios.length };
  }
};
const loggerMock = { info() {}, warn() {}, error() {} };

function mock(modulePath, exports) {
  require.cache[modulePath] = { id:modulePath, filename:modulePath, loaded:true, exports };
}
mock(modulePaths.db, dbMock);
mock(modulePaths.logger, loggerMock);
mock(modulePaths.source, sourceMock);
mock(modulePaths.azure, azureMock);
mock(modulePaths.permission, permissionMock);
mock(modulePaths.emitter, emitterMock);
delete require.cache[jobPath];
const job = require(jobPath);

const now = new Date('2026-09-01T18:00:00.000Z');
const wrongActive = {
  loteImportacion:'11111111-1111-4111-8111-111111111111',
  archivoOrigen:'INVENTARIO JULIO.xlsx',
  fechaCorte:'2026-07-31',
  activatedAt:'2026-09-01 08:00:00.000',
  activeMinutes:240
};
const expectedAugust = {
  loteImportacion:'22222222-2222-4222-8222-222222222222',
  archivoOrigen:'INVENTARIO AGOSTO.xlsx',
  fechaCorte:'2026-08-31',
  fechaImportacion:'2026-09-01 09:00:00.000'
};

(async () => {
  assert.deepEqual(job.previousMonthRange(now), {
    year:2026,
    month:8,
    start:'2026-08-01',
    end:'2026-08-31',
    key:'2026-08'
  });
  assert.deepEqual(job.previousMonthRange(new Date('2026-01-15T12:00:00.000Z')), {
    year:2025,
    month:12,
    start:'2025-12-01',
    end:'2025-12-31',
    key:'2025-12'
  });

  reset();
  state.active = { ...wrongActive, fechaCorte:'2026-08-15', activeMinutes:999 };
  let result = await job.checkAlmacenCierreIncorrecto(now, { db:dbMock, ignoreEnabled:true });
  assert.equal(result.reason, 'correct_previous_month');
  assert.equal(state.emissions.length, 0);

  reset();
  state.active = { ...wrongActive, activeMinutes:239 };
  result = await job.checkAlmacenCierreIncorrecto(now, { db:dbMock, ignoreEnabled:true });
  assert.equal(result.reason, 'threshold_not_reached');

  reset();
  state.active = { ...wrongActive };
  result = await job.checkAlmacenCierreIncorrecto(now, { db:dbMock, ignoreEnabled:true });
  assert.equal(result.reason, 'expected_file_not_loaded');

  reset();
  state.active = { ...wrongActive };
  state.expected = { ...expectedAugust };
  state.recipients = [7, 12];
  result = await job.checkAlmacenCierreIncorrecto(now, {
    db:dbMock,
    permissionService:permissionMock,
    emit:emitterMock.emitBusinessEventSafe_gnral
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.recipients, [7, 12]);
  assert.equal(state.emissions.length, 1);
  const notification = state.emissions[0];
  assert.equal(notification.codigoEvento, 'ALMACEN_CIERRE_INCORRECTO_4H');
  assert.deepEqual(notification.destinatarios, [7, 12]);
  assert.equal(notification.ruta, 'almacen-carga');
  assert(notification.mensaje.includes('más de 4 horas'));
  assert(notification.mensaje.includes('INVENTARIO AGOSTO.xlsx'));
  assert(notification.eventInstanceKey.includes(wrongActive.loteImportacion));
  assert(notification.eventInstanceKey.includes(expectedAugust.loteImportacion));

  const firstDedup = notification.eventInstanceKey;
  await job.checkAlmacenCierreIncorrecto(now, {
    db:dbMock,
    permissionService:permissionMock,
    emit:emitterMock.emitBusinessEventSafe_gnral
  });
  assert.equal(state.emissions[1].eventInstanceKey, firstDedup, 'La misma activación debe conservar su clave de deduplicación');

  reset();
  state.active = { ...wrongActive };
  state.expected = { ...expectedAugust };
  state.recipients = [];
  result = await job.checkAlmacenCierreIncorrecto(now, {
    db:dbMock,
    permissionService:permissionMock,
    emit:emitterMock.emitBusinessEventSafe_gnral
  });
  assert.equal(result.reason, 'no_authorized_recipients');
  assert.equal(state.emissions.length, 0);

  const permissionSource = fs.readFileSync(path.join(root, 'backend/src/services/permissions/effective-permission.service.js'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(root, 'backend/src/bootstrap.js'), 'utf8');
  const router = fs.readFileSync(path.join(root, 'core/router.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'sql/20260901_ALMACEN_CIERRE_INCORRECTO_NOTIFICACION_V001.sql'), 'utf8');
  assert(permissionSource.includes('listUsersWithEffectivePermission'));
  assert(permissionSource.includes('THEN COALESCE(('), 'El permiso personal debe prevalecer sobre el rol');
  assert(bootstrap.includes('startAlmacenCierreIncorrectoJob()'));
  assert(bootstrap.includes('stopAlmacenCierreIncorrectoJob()'));
  assert(router.includes("document.getElementById('view-' + ruta)"), 'La notificación debe abrir la ruta declarada del módulo');
  assert(migration.includes("'ALMACEN_CIERRE_INCORRECTO_4H'"));
  assert(migration.includes("'almacen-carga'"));

  console.log('PASS almacen_cierre_incorrecto_notification');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
