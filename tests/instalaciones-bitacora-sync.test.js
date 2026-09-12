'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
const routesPath = path.resolve(
  __dirname,
  '../backend/src/modules/instalaciones-bitacora/instalaciones-bitacora.routes.js'
);
const permissionCode = 'INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_BITACORA.VER';

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

test('listDocumentos ordena por el movimiento más reciente', async () => {
  let capturedSql = '';
  const repository = requireWithStubs(repositoryPath, {
    '../../config/db': {
      async query(sql) {
        capturedSql = String(sql).replace(/\s+/g, ' ').trim();
        return [[]];
      }
    }
  });

  await repository.listDocumentos('P14223');

  assert.match(capturedSql, /END AS fecha_movimiento/);
  assert.match(capturedSql, /ORDER BY fecha_movimiento DESC, nombre_archivo ASC/);
});

test('la interfaz muestra el movimiento y usa un botón Actualizar de 30 por 30', () => {
  const details = fs.readFileSync(path.resolve(__dirname, '../core/details.js'), 'utf8');

  assert.match(details, /\.mg-bitacora-refresh\{width:30px;height:30px;/);
  assert.match(details, /<th>Último movimiento<\/th>/);
  assert.match(details, /aria-label="Actualizar bitácora">↻<\/button>/);
});

test('la Bitácora solo se inicializa con permiso visual efectivo', () => {
  const details = fs.readFileSync(path.resolve(__dirname, '../core/details.js'), 'utf8');
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../sql/20260911_BITACORA_OBRA_PERMISO_VISUAL_V001.sql'),
    'utf8'
  );

  assert.match(details, new RegExp(permissionCode.replace('.', '\\.')));
  assert.match(details, /permission\.exists===true&&permission\.efectivo===true/);
  assert.match(details, /mg-bitacora-panel[^']+hidden/);
  assert.match(migration, new RegExp(permissionCode.replace('.', '\\.')));
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+(?:rol_permisos|usuario_permisos)/i);
});

test('las rutas GET y sync rechazan usuarios sin permiso de Bitácora', async () => {
  const registrations = [];
  let checkedUserId = null;
  let checkedPermission = null;
  const routerStub = {
    get(pathname, ...handlers) { registrations.push({ method: 'GET', pathname, handlers }); },
    post(pathname, ...handlers) { registrations.push({ method: 'POST', pathname, handlers }); }
  };
  const requireAuthStub = (_req, _res, next) => next();

  requireWithStubs(routesPath, {
    express: { Router: () => routerStub },
    './instalaciones-bitacora.controller': { getBitacora() {}, syncBitacora() {} },
    '../../middleware/auth.middleware': { requireAuth: requireAuthStub },
    '../../services/permissions/effective-permission.service': {
      async hasEffectivePermission(userId, code) {
        checkedUserId = userId;
        checkedPermission = code;
        return false;
      }
    }
  });

  const getRoute = registrations.find(entry => entry.method === 'GET');
  const postRoute = registrations.find(entry => entry.method === 'POST');
  assert.ok(getRoute);
  assert.ok(postRoute);
  assert.equal(getRoute.handlers[0], requireAuthStub);
  assert.equal(postRoute.handlers[0], requireAuthStub);
  assert.equal(getRoute.handlers[1], postRoute.handlers[1]);

  let statusCode = null;
  let payload = null;
  let nextCalled = false;
  const response = {
    status(value) { statusCode = value; return this; },
    json(value) { payload = value; return value; }
  };
  await getRoute.handlers[1](
    { method: 'GET', contextUser: { id_SB: 77 } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(checkedUserId, 77);
  assert.equal(checkedPermission, permissionCode);
  assert.equal(statusCode, 403);
  assert.equal(payload.code, 'INSTALACIONES_BITACORA_FORBIDDEN');
  assert.equal(nextCalled, false);
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
