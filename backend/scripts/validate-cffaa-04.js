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

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const service = require('../src/modules/ventas-prospeccion/ventas-prospeccion.service');
const storageSchema = require('../src/services/storage/storage-schema.service');

function read(relative) {
  return fs.readFileSync(path.join(backendRoot, relative), 'utf8');
}

assert.strictEqual(
  typeof service.presentProspectionFile,
  'function',
  'La version instalada de ventas-prospeccion.service.js no exporta presentProspectionFile. Reaplica los archivos de Prospeccion incluidos en este FIX.'
);

const azurePresented = service.presentProspectionFile({
  id_archivo: 18,
  id_pros: 7,
  id_com_pors: null,
  tipo_relacion: 'VISITA',
  nombre_archivo: 'foto.jpg',
  nombre_original: 'Foto visita.jpg',
  mime_type: 'image/jpeg',
  extension: 'jpg',
  tamano_bytes: 1234,
  storage_provider: 'AZURE_BLOB',
  storage_url: 'https://cuentaprueba.blob.core.windows.net/contenedor-prueba/interno.jpg',
  storage_container: 'contenedor-prueba',
  storage_blob_name: 'united/ventas/prospeccion/7/interno.jpg',
  thumbnail_url: null,
  orden: 1,
  es_imagen: 1,
  activo: 1
}, 7);
assert.strictEqual(azurePresented.access_endpoint, '/api/ventas/prospeccion/7/archivos/18/acceso');
assert.strictEqual(azurePresented.storage_url, null);
assert.strictEqual(Object.prototype.hasOwnProperty.call(azurePresented, 'storage_blob_name'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(azurePresented, 'storage_container'), false);

const legacyPresented = service.presentProspectionFile({
  id_archivo: 19,
  id_pros: 7,
  tipo_relacion: 'VISITA',
  nombre_original: 'Historico.jpg',
  storage_provider: 'GLIDE',
  storage_url: 'https://storage.googleapis.com/historico.jpg',
  orden: 2,
  es_imagen: 1,
  activo: 1
}, 7);
assert.strictEqual(legacyPresented.legacy, true);
assert.strictEqual(legacyPresented.storage_url, 'https://storage.googleapis.com/historico.jpg');

assert(storageSchema.REQUIRED_COLUMNS.ventas_prospeccion_archivos.includes('storage_provider'));
assert(storageSchema.REQUIRED_COLUMNS.ventas_prospeccion_archivos.includes('storage_container'));
assert(storageSchema.REQUIRED_COLUMNS.ventas_prospeccion_archivos.includes('storage_blob_name'));

const repositorySource = read('src/modules/ventas-prospeccion/ventas-prospeccion.repository.js');
assert(repositorySource.includes("UPPER(COALESCE(storage_provider, 'GLIDE')) = 'GLIDE'"));
assert(repositorySource.includes('storage_provider, storage_url, storage_container, storage_blob_name'));
assert(repositorySource.includes('file.storage_provider, file.storage_url, file.storage_container, file.storage_blob_name'));
assert.strictEqual(repositorySource.includes("'GOOGLE_DRIVE', ?, ?, ?, ?, 1, 1"), false);
assert(repositorySource.includes('async function findFileById'));
assert(repositorySource.includes('async function deactivateFile'));

const serviceSource = read('src/modules/ventas-prospeccion/ventas-prospeccion.service.js');
assert(serviceSource.includes('storageAccess.createReadAccess_gnral'));
assert(serviceSource.includes('internalStorageCompany(actionContext)'));
assert(serviceSource.includes('empresa: storageCompany'));
assert.strictEqual(serviceSource.includes('createReadSas_gnral'), false);
assert(serviceSource.includes('queueOnFailure: true'));
assert(serviceSource.includes("tipo_evento: 'ARCHIVO_ELIMINADO'"));
assert(serviceSource.includes('archivos: archivos.map((archivo) => presentProspectionFile(archivo, idPros))'));

const routesSource = read('src/modules/ventas-prospeccion/ventas-prospeccion.routes.js');
assert.strictEqual(routesSource.includes("require('multer')"), false);
assert(routesSource.includes("fieldName: 'fotos'"));
assert(routesSource.includes("policyName: 'IMAGE'"));
assert(routesSource.includes("fieldName: 'archivos'"));
assert(routesSource.includes("policyName: 'GENERAL'"));
assert(routesSource.includes("requireStorageSchema('ventas_prospeccion_archivos')"));
assert(routesSource.includes("'/prospeccion/:id/archivos/:idArchivo/acceso'"));
assert(routesSource.includes('router.delete('));
assert(routesSource.includes('requireHistoricalSyncEnabled'));

const controllerSource = read('src/modules/ventas-prospeccion/ventas-prospeccion.controller.js');
assert(controllerSource.includes('service.getFileAccess'));
assert(controllerSource.includes('service.deleteFile'));
assert(controllerSource.includes('error.statusCode || error.status'));

const frontendSource = fs.readFileSync(
  path.join(projectRoot, 'modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.js'),
  'utf8'
);
assert(frontendSource.includes('data-file-access'));
assert(frontendSource.includes('openFileAccess'));
assert(frontendSource.includes('response?.data?.access_url'));

const detailCss = fs.readFileSync(
  path.join(projectRoot, 'modules/ventas-prospeccion-detalle/ventas-prospeccion-detalle.css'),
  'utf8'
);
assert(detailCss.includes('.vpd-file-access{width:100%;font:inherit;cursor:pointer;text-align:left}'));

const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
assert(indexSource.includes('ventas-prospeccion-detalle.js?v=20260803-cffaa04-v001'));
assert(indexSource.includes('ventas-prospeccion-detalle.css?v=20260803-cffaa04-v001'));

const postflight = read('sql/20260803_CFFAA_04_POSTFLIGHT.sql');
assert(postflight.includes('posibles_azure_mal_etiquetados'));
assert(postflight.includes("UPPER(TRIM(storage_provider)) = 'AZURE_BLOB'"));
assert.strictEqual(/\b(UPDATE|DELETE|INSERT|ALTER|DROP|CREATE)\b/i.test(postflight.replace(/^--.*$/gm, '')), false);

console.log('CFFAA-04: Prospeccion Azure, SAS bajo demanda, sincronizacion historica protegida y baja individual validados.');
