'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const repositoryPath = path.resolve(
  __dirname,
  '../backend/src/modules/instalaciones-bitacora/instalaciones-bitacora.repository.js'
);
const servicePath = path.resolve(
  __dirname,
  '../backend/src/modules/instalaciones-bitacora/instalaciones-bitacora.service.js'
);

function requireWithStubs(modulePath, stubs) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('upsertDocumento enlaza id_proyecto recibido como primer parámetro SQL', async () => {
  const queries = [];
  const repository = requireWithStubs(repositoryPath, {
    '../../config/db': {}
  });
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };

  await repository.upsertDocumento(connection, 'P14223', {
    carpeta_raiz_id: 'folder-root',
    drive_file_id: 'drive-file-1',
    drive_parent_folder_id: 'folder-root',
    nombre_archivo: 'Plano.pdf',
    ruta_carpeta: null,
    mime_type: 'application/pdf',
    web_view_link: 'https://drive.example/file-1',
    fecha_creacion_drive: '2026-09-11 12:00:00',
    fecha_modificacion_drive: '2026-09-11 13:00:00',
    detectado_por_usuario: 77
  });

  assert.equal(queries.length, 1);
  assert.equal(queries[0].params[0], 'P14223');
  assert.equal(queries[0].params[2], 'drive-file-1');
});

test('syncBitacora propaga el proyecto normalizado al upsert de cada archivo', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    release() { calls.push(['release']); }
  };
  const repositoryStub = {
    async getConnection() { return connection; },
    async upsertDocumento(receivedConnection, idProyecto, doc) {
      calls.push(['upsertDocumento', receivedConnection, idProyecto, doc]);
    },
    async marcarEliminados(receivedConnection, idProyecto, ids) {
      calls.push(['marcarEliminados', receivedConnection, idProyecto, ids]);
      return 0;
    },
    async findExistingFileIds() {
      return [{ drive_file_id: 'drive-file-1', estatus: 'activo' }];
    },
    async upsertSyncEstado(receivedConnection, idProyecto, estado) {
      calls.push(['upsertSyncEstado', receivedConnection, idProyecto, estado]);
    },
    async listDocumentos(idProyecto) {
      calls.push(['listDocumentos', idProyecto]);
      return [{ drive_file_id: 'drive-file-1', estatus: 'activo' }];
    },
    async getSyncEstado(idProyecto) {
      calls.push(['getSyncEstado', idProyecto]);
      return {
        ultima_sincronizacion: '2026-09-11 13:00:00',
        ultimo_usuario: 77,
        total_activos: 1,
        total_eliminados: 0,
        truncado: 0
      };
    }
  };
  const driveServiceStub = {
    async listFiles(userId, options) {
      calls.push(['listFiles', userId, options]);
      return {
        files: [{
          id: 'drive-file-1',
          name: 'Plano.pdf',
          is_folder: false,
          trashed: false,
          mime_type: 'application/pdf',
          web_view_link: 'https://drive.example/file-1',
          created_time: '2026-09-11T12:00:00.000Z',
          modified_time: '2026-09-11T13:00:00.000Z'
        }],
        next_page_token: null
      };
    }
  };
  const projectDriveServiceStub = {
    async getProjectFolder(idProyecto) {
      calls.push(['getProjectFolder', idProyecto]);
      return { carpeta_proyecto: { carpeta_id: 'folder-root' } };
    }
  };
  const service = requireWithStubs(servicePath, {
    './instalaciones-bitacora.repository': repositoryStub,
    '../../services/google/drive.service': driveServiceStub,
    '../instalaciones-proyecto-drive/instalaciones-proyecto-drive.service': projectDriveServiceStub,
    '../../shared/logger': { info() {}, warn() {}, error() {} }
  });

  const result = await service.syncBitacora(77, '  P14223  ');
  const upsertCall = calls.find((call) => call[0] === 'upsertDocumento');

  assert.ok(upsertCall, 'La sincronización debe persistir el archivo encontrado.');
  assert.equal(upsertCall[1], connection);
  assert.equal(upsertCall[2], 'P14223');
  assert.equal(upsertCall[3].drive_file_id, 'drive-file-1');
  assert.equal(result.ok, true);
  assert.equal(result.id_proyecto, 'P14223');
  assert.ok(calls.some((call) => call[0] === 'commit'));
  assert.ok(calls.some((call) => call[0] === 'release'));
  assert.ok(!calls.some((call) => call[0] === 'rollback'));
});
