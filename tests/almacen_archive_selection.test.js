'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const archivePath = path.join(root, 'backend/src/modules/almacen/almacen.archive-service.js');
const dependencyPaths = {
  db: path.join(root, 'backend/src/config/db.js'),
  azure: path.join(root, 'backend/src/services/storage/azure-storage.service.js'),
  source: path.join(root, 'backend/src/modules/almacen/almacen.source-engine.js'),
  service: path.join(root, 'backend/src/modules/almacen/almacen.service.js')
};

const state = {};

function resetState() {
  state.findRows = [];
  state.matchSource = null;
  state.existing = null;
  state.blobExists = false;
  state.uploads = 0;
  state.imports = 0;
  state.queries = [];
  state.validation = {
    hash: 'a'.repeat(64),
    cutoffDate: '2026-08-31',
    rows: 25,
    datasets: [],
    warnings: [],
    coverage: {}
  };
}

const dbMock = {
  async query(sql, params) {
    state.queries.push({ sql, params });
    if (sql.includes('GROUP BY lote_importacion') && sql.includes('WHERE hash_archivo=?')) return [state.findRows];
    if (sql.includes('INSERT INTO almacen_fuente_excel')) return [{ affectedRows: 1 }];
    if (sql.includes('DELETE FROM almacen_fuente_excel')) return [{ affectedRows: 10 }];
    throw new Error(`Consulta no simulada: ${sql}`);
  }
};

const sourceMock = {
  TABLE: 'almacen_fuente_excel',
  RECORD_TYPES: { INVENTORY:'INVENTARIO', LOAN:'PRESTAMO', GUARD:'RESGUARDO', ARCHIVE:'ARCHIVO' },
  ARCHIVE_KIND: 'ALMACEN_ARCHIVO_BLOB_V1',
  async sourceByLot(lotId) {
    return state.matchSource || { loteImportacion:lotId, activo:false, loaded:false, archived:true };
  },
  async archiveRecordByLot() { return state.existing; }
};

const serviceMock = {
  async validateImport() { return state.validation; },
  async importSpreadsheet() { state.imports += 1; throw new Error('No debe importar al guardar en histórico.'); }
};

const azureMock = {
  async uploadPrivate_gnral({ file }) {
    state.uploads += 1;
    return {
      nombre_original:file.originalname,
      mime_type:file.mimetype,
      tamano_bytes:file.size,
      storage_provider:'AZURE_BLOB',
      storage_container:'private',
      storage_blob_name:`almacen/${file.originalname}`,
      storage_url:`https://example.invalid/${file.originalname}`
    };
  },
  async blobExists_gnral() { return state.blobExists; },
  async deleteBlob_gnral() { return { deleted:true, queued:false }; },
  getConfig_gnral() { return { maxFileBytes:25 * 1024 * 1024, sasMinutes:15 }; },
  async createReadSas_gnral() { return { url:'https://example.invalid/file' }; }
};

function installMock(modulePath, exports) {
  require.cache[modulePath] = { id:modulePath, filename:modulePath, loaded:true, exports };
}

for (const [name, modulePath] of Object.entries(dependencyPaths)) {
  installMock(modulePath, { db:dbMock, azure:azureMock, source:sourceMock, service:serviceMock }[name]);
}
delete require.cache[archivePath];
const archiveService = require(archivePath);

const file = {
  originalname:'CIERRE AGOSTO.xlsx',
  mimetype:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size:1024,
  buffer:Buffer.from('xlsx')
};

(async () => {
  resetState();
  const created = await archiveService.archiveSpreadsheet(file, '2026-08-31', 7);
  assert.equal(created.registered, true);
  assert.equal(state.uploads, 1);
  assert.equal(state.imports, 0, 'Guardar en histórico no debe activar/importar el cierre');
  const insert = state.queries.find(item => item.sql.includes('INSERT INTO almacen_fuente_excel'));
  assert(insert, 'Debe registrar una fila ARCHIVO en Aiven');
  assert.equal(insert.params[5], 0, 'Un archivo nuevo debe guardarse inactivo');
  assert(!state.queries.some(item => item.sql.includes('UPDATE almacen_fuente_excel SET activo')), 'No debe cambiar la fuente global activa');

  resetState();
  const legacyLot = '11111111-1111-4111-8111-111111111111';
  state.findRows = [{ loteImportacion:legacyLot }];
  state.matchSource = { loteImportacion:legacyLot, activo:false, loaded:true, archived:false, fechaImportacion:'2026-08-01T00:00:00.000Z' };
  const migrated = await archiveService.archiveSpreadsheet(file, '2026-08-31', 7);
  assert.equal(migrated.loteImportacion, legacyLot, 'Debe reutilizar el lote legacy por hash y fecha');
  assert.equal(migrated.migratedLegacy, true);
  assert(state.queries.some(item => item.sql.includes('DELETE FROM almacen_fuente_excel') && item.sql.includes('tipo_registro<>?')), 'Debe compactar las filas del legacy histórico después de archivarlo');

  resetState();
  state.findRows = [{ loteImportacion:legacyLot }];
  state.matchSource = { loteImportacion:legacyLot, activo:false, loaded:false, archived:true };
  state.existing = { metadata:{ storage_blob_name:'almacen/existente.xlsx', storage_container:'private' } };
  state.blobExists = true;
  const duplicate = await archiveService.archiveSpreadsheet(file, '2026-08-31', 7);
  assert.equal(duplicate.alreadyArchived, true);
  assert.equal(state.uploads, 0, 'No debe duplicar un Blob ya registrado');

  const frontend = fs.readFileSync(path.join(root, 'modules/almacen-carga/almacen-carga.js'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'backend/src/modules/almacen/almacen.routes.js'), 'utf8');
  const sourceEngine = fs.readFileSync(path.join(root, 'backend/src/modules/almacen/almacen.source-engine.js'), 'utf8');
  assert(frontend.includes('Guardar en histórico'));
  assert(frontend.includes('Usar este cierre'));
  assert(frontend.includes('para TODOS los usuarios'));
  assert(frontend.includes("authApi('/api/almacen/carga/archivar'"));
  assert(frontend.includes("authApi('/api/almacen/fuentes?all=1'"), 'La UI debe solicitar el histórico completo');
  assert(!frontend.includes('id="almload-import"'), 'La UI no debe activar automáticamente al guardar');
  assert(routes.includes("router.post('/carga/archivar'"));
  assert(sourceEngine.includes("String(input?.all || '').trim() === '1'"), 'El backend debe permitir listar todos los cierres');

  console.log('PASS almacen_archive_selection');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
