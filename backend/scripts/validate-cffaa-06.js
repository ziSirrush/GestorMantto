'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'cffaa_validation';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'cffaa_validation';
process.env.DB_NAME = process.env.DB_NAME || 'mydb';
process.env.AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'cuentaprueba';
process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME = process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || 'contenedor-prueba';
process.env.CFFAA_STORAGE_METRICS_ENABLED = 'false';
process.env.CFFAA_STORAGE_ORPHAN_DELETE_ENABLED = 'false';

const backendRoot = path.resolve(__dirname, '..');
const reconciliation = require('../src/modules/storage-reconciliation/storage-reconciliation.service');
const metricService = require('../src/services/storage/storage-metrics.service');

function read(relative) {
  return fs.readFileSync(path.join(backendRoot, relative), 'utf8');
}

const classified = reconciliation.classifyReconciliation_gnral({
  containerName: 'contenedor-prueba',
  minAgeHours: 24,
  now: new Date('2026-08-03T20:00:00Z').getTime(),
  references: [
    {
      module: 'home-pendientes',
      storage_provider: 'AZURE_BLOB',
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/home/pendiente/1/registrado.jpg',
      activo: 1
    },
    {
      module: 'soporte',
      storage_provider: 'AZURE_BLOB',
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/soporte/ticket/2/faltante.pdf',
      activo: 1
    },
    {
      module: 'ventas-prospeccion',
      storage_provider: 'GLIDE',
      storage_blob_name: null,
      activo: 1
    },
    {
      module: 'ventas-prospeccion',
      storage_provider: 'GOOGLE_DRIVE',
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/ventas/prospeccion/mal-etiquetado.jpg',
      activo: 1
    }
  ],
  blobs: [
    {
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/home/pendiente/1/registrado.jpg',
      created_on: '2026-08-01T20:00:00Z'
    },
    {
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/ventas/prospeccion/mal-etiquetado.jpg',
      created_on: '2026-07-30T20:00:00Z'
    },
    {
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/general/huerfano-antiguo.pdf',
      created_on: '2026-07-30T20:00:00Z'
    },
    {
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/general/reciente.pdf',
      created_on: '2026-08-03T19:30:00Z'
    },
    {
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/general/pendiente.pdf',
      created_on: '2026-07-30T20:00:00Z'
    }
  ],
  pendingDeletes: [
    {
      id_operacion: 9,
      storage_container: 'contenedor-prueba',
      storage_blob_name: 'united/general/pendiente.pdf',
      estado: 'ERROR'
    }
  ]
});

assert.strictEqual(classified.aiven_without_blob.length, 1);
assert.strictEqual(classified.aiven_without_blob[0].storage_blob_name, 'united/soporte/ticket/2/faltante.pdf');
assert.strictEqual(classified.orphan_candidates.length, 1);
assert.strictEqual(classified.orphan_candidates[0].storage_blob_name, 'united/general/huerfano-antiguo.pdf');
assert.strictEqual(classified.recent_unregistered.length, 1);
assert.strictEqual(classified.pending_delete.length, 1);
assert.strictEqual(classified.referenceMap.has('contenedor-prueba|united/ventas/prospeccion/mal-etiquetado.jpg'), true);

assert.throws(
  () => reconciliation.validateCleanupRequest_gnral({
    confirmacion: reconciliation.DELETE_CONFIRMATION,
    blob_names: ['united/general/huerfano.pdf']
  }, { deleteEnabled: false, maxDelete: 50 }),
  error => error.code === 'CFFAA_ORPHAN_DELETE_DISABLED'
);

assert.throws(
  () => reconciliation.validateCleanupRequest_gnral({
    confirmacion: 'SI',
    blob_names: ['united/general/huerfano.pdf']
  }, { deleteEnabled: true, maxDelete: 50 }),
  error => error.code === 'CFFAA_ORPHAN_DELETE_CONFIRMATION_REQUIRED'
);

const cleanupList = reconciliation.validateCleanupRequest_gnral({
  confirmacion: reconciliation.DELETE_CONFIRMATION,
  blob_names: ['united/general/huerfano.pdf', 'united/general/huerfano.pdf']
}, { deleteEnabled: true, maxDelete: 50 });
assert.deepStrictEqual(cleanupList, ['united/general/huerfano.pdf']);

const safeDetails = metricService.sanitizeDetails_gnral({
  url: 'https://example.invalid/?sig=secreto',
  token: 'secreto',
  status: 'ok',
  nested: { value: 1 }
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeDetails, 'url'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeDetails, 'token'), false);
assert.strictEqual(safeDetails.status, 'ok');

const routeSource = read('src/modules/storage-reconciliation/storage-reconciliation.routes.js');
assert(routeSource.includes("router.get('/resumen'"));
assert(routeSource.includes("router.get('/inventario'"));
assert(routeSource.includes("router.get('/uploads-legacy'"));
assert(routeSource.includes("router.get('/metricas'"));
assert(routeSource.includes("router.post('/huerfanos/eliminar'"));
assert(routeSource.includes('requireStorageReconciliationEnabled'));

const serviceSource = read('src/modules/storage-reconciliation/storage-reconciliation.service.js');
assert(serviceSource.includes("const DELETE_CONFIRMATION = 'ELIMINAR_HUERFANOS_AZURE'"));
assert(serviceSource.includes('repository.isBlobReferenced_gnral'));
assert(serviceSource.includes('SKIPPED_REFERENCED'));
assert(serviceSource.includes('SKIPPED_TOO_RECENT'));
assert(serviceSource.includes('SKIPPED_REFERENCED_RECHECK'));
assert(serviceSource.includes('CFFAA_STORAGE_ORPHAN_DELETE_ENABLED'));
assert(serviceSource.includes('historical_migration_automatic: false'));
assert.strictEqual(serviceSource.includes('migrateHistorical'), false);

const repositorySource = read('src/modules/storage-reconciliation/storage-reconciliation.repository.js');
for (const table of [
  'pendientes_archivos',
  'pendientes_comentarios_adjuntos',
  'sup_adjuntos',
  'ventas_prospeccion_archivos',
  'ventas_cotizaciones_archivos'
]) {
  assert(repositorySource.includes(`table: '${table}'`));
}
assert(repositorySource.includes('storage_operaciones_pendientes'));
assert(repositorySource.includes("LIKE '%/uploads/%'"));

const azureSource = read('src/services/storage/azure-storage.service.js');
assert(azureSource.includes('async function listBlobs_gnral'));
assert(azureSource.includes('async function blobExists_gnral'));
assert(azureSource.includes('async function getBlobProperties_gnral'));
assert(azureSource.includes("tipo_evento: 'UPLOAD_OK'"));
assert(azureSource.includes("tipo_evento: 'DELETE_OK'"));

const accessSource = read('src/services/storage/storage-access.service.js');
assert(accessSource.includes("tipo_evento: 'ACCESS_OK'"));
assert(accessSource.includes("tipo_evento: status === 401 || status === 403 ? 'ACCESS_DENIED' : 'ACCESS_ERROR'"));
const uploadMiddleware = read('src/middleware/storage-upload.middleware.js');
assert(uploadMiddleware.includes("tipo_evento: 'REJECTED'"));

const appSource = read('src/app.js');
assert(appSource.includes('CFFAA_LEGACY_UPLOADS_ENABLED'));
assert(appSource.includes("app.use('/uploads'"));

const diagnosticsMiddleware = read('src/middleware/historical-sync.middleware.js');
assert(diagnosticsMiddleware.includes('CFFAA_PRODUCTION_DIAGNOSTICS_OVERRIDE'));
assert(diagnosticsMiddleware.includes("process.env.NODE_ENV"));

const envExample = read('.env.example');
for (const variable of [
  'CFFAA_STORAGE_RECONCILIATION_ENABLED=false',
  'CFFAA_STORAGE_METRICS_ENABLED=false',
  'CFFAA_STORAGE_ORPHAN_DELETE_ENABLED=false',
  'CFFAA_STORAGE_ORPHAN_MIN_AGE_HOURS=24',
  'CFFAA_LEGACY_UPLOADS_ENABLED=true',
  'CFFAA_PRODUCTION_DIAGNOSTICS_OVERRIDE=false'
]) {
  assert(envExample.includes(variable));
}

const migration = read('sql/20260803_CFFAA_06_STORAGE_EVENTOS.sql');
assert(migration.includes('CREATE TABLE IF NOT EXISTS storage_eventos'));
assert(migration.includes('idx_storage_eventos_tipo_fecha'));
assert.strictEqual(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i.test(migration.replace(/^\s*--.*$/gm, '')), false);

const postflight = read('sql/20260803_CFFAA_06_POSTFLIGHT.sql');
assert(postflight.includes('Inventario consolidado por proveedor'));
assert(postflight.includes('Referencias historicas conocidas bajo /uploads'));
const postflightWithoutComments = postflight.replace(/^\s*--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert.strictEqual(/\b(UPDATE|DELETE|INSERT|ALTER|DROP|CREATE|TRUNCATE)\b/i.test(postflightWithoutComments), false);

console.log('CFFAA-06: conciliacion Aiven/Azure, inventario historico, metricas, limpieza controlada y cierre validados.');
