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
const service = require('../src/modules/ventas-cotizaciones/ventas-cotizaciones.service');
const storageSchema = require('../src/services/storage/storage-schema.service');

function readBackend(relative) {
  return fs.readFileSync(path.join(backendRoot, relative), 'utf8');
}

const azurePresented = service.presentCotizacionArchivo_gnral({
  id_archivo: 21,
  id_cotizacion: 8,
  id_comentario: 15,
  id_usuario: 4,
  nombre_archivo: 'archivo.pdf',
  nombre_original: 'Propuesta.pdf',
  extension: 'pdf',
  mime_type: 'application/pdf',
  tamanio_bytes: 2000,
  storage_provider: 'AZURE_BLOB',
  storage_url: 'https://cuentaprueba.blob.core.windows.net/contenedor-prueba/interno.pdf',
  storage_container: 'contenedor-prueba',
  storage_blob_name: 'corellian/ventas/cotizacion/8/comentarios-15/interno.pdf',
  drive_file_id: null,
  drive_folder_id: null,
  drive_url: null,
  tipo_archivo: 'application/pdf',
  descripcion: 'Propuesta',
  version_numero: 2,
  id_archivo_anterior: 20,
  activo: 1
}, 8);
assert.strictEqual(azurePresented.access_endpoint, '/api/ventas/cotizaciones/8/archivos/21/acceso');
assert.strictEqual(azurePresented.legacy, false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(azurePresented, 'storage_blob_name'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(azurePresented, 'storage_container'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(azurePresented, 'storage_url'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(azurePresented, 'drive_file_id'), false);
assert.strictEqual(azurePresented.version_numero, 2);
assert.strictEqual(azurePresented.id_archivo_anterior, 20);

const legacyPresented = service.presentCotizacionArchivo_gnral({
  id_archivo: 22,
  id_cotizacion: 8,
  id_comentario: 15,
  nombre_archivo: 'historico.pdf',
  nombre_original: 'Histórico.pdf',
  storage_provider: 'GLIDE_STORAGE',
  drive_url: 'https://drive.google.com/file/d/historico/view',
  activo: 1
}, 8);
assert.strictEqual(legacyPresented.legacy, true);
assert.strictEqual(legacyPresented.legacy_url, 'https://drive.google.com/file/d/historico/view');
assert.strictEqual(legacyPresented.access_endpoint, null);

assert(storageSchema.REQUIRED_COLUMNS.ventas_cotizaciones_archivos.includes('storage_provider'));
assert(storageSchema.REQUIRED_COLUMNS.ventas_cotizaciones_archivos.includes('storage_container'));
assert(storageSchema.REQUIRED_COLUMNS.ventas_cotizaciones_archivos.includes('storage_blob_name'));
assert(storageSchema.REQUIRED_COLUMNS.ventas_cotizaciones_archivos.includes('id_archivo_anterior'));

const routeSource = readBackend('src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js');
assert.strictEqual(routeSource.includes("require('multer')"), false);
assert(routeSource.includes("fieldName: 'archivo'"));
assert(routeSource.includes("policyName: 'GENERAL'"));
assert(routeSource.includes("requireStorageSchema('ventas_cotizaciones_archivos')"));
assert(routeSource.includes("'/cotizaciones/:id/archivos/:idArchivo/acceso'"));
assert(routeSource.includes('uploadInteractionFile'));

const controllerSource = readBackend('src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js');
assert(controllerSource.includes('req.file || null'));
assert(controllerSource.includes('service.getArchivoAccess'));
assert(controllerSource.includes('error.statusCode || error.status'));

const repositorySource = readBackend('src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js');
assert(repositorySource.includes('async function listArchivosByComentario'));
assert(repositorySource.includes('async function softDeleteArchivosByComentario'));
assert(repositorySource.includes('FOR UPDATE'));

const serviceSource = readBackend('src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js');
assert(serviceSource.includes('storageAccess.createReadAccess_gnral'));
assert(serviceSource.includes("throw badRequest('Escribe un comentario o adjunta un archivo.')"));
assert(serviceSource.includes("comentario: comentario || ''"));
assert(serviceSource.includes('repository.softDeleteArchivosByComentario'));
assert(serviceSource.includes('queueOnFailure: true'));
assert(serviceSource.includes('id_archivo_anterior: version.previous?.id_archivo || null'));
assert.strictEqual(serviceSource.includes('withArchivoAccess_gnral'), false);
assert.strictEqual(serviceSource.includes('createReadSas_gnral'), false);
assert.strictEqual(serviceSource.includes("comentario: 'Archivo adjunto'"), false);

const frontendSource = fs.readFileSync(
  path.join(projectRoot, 'modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js'),
  'utf8'
);
assert(frontendSource.includes('const form=new FormData()'));
assert(frontendSource.includes("form.append('comentario',text)"));
assert(frontendSource.includes("form.append('archivo',file,file.name)"));
assert(frontendSource.includes("await req('/api/ventas/cotizaciones/'+state.id+'/comentarios',{method:'POST',body:form})"));
assert(frontendSource.includes('data-vqd-file-open'));
assert(frontendSource.includes('response?.data?.access_url'));
assert.strictEqual(frontendSource.includes("body:JSON.stringify({comentario:'Archivo adjunto'})"), false);
assert.strictEqual(frontendSource.includes("await req('/api/ventas/cotizaciones/'+state.id+'/archivos',{method:'POST'"), false);

const cssSource = fs.readFileSync(
  path.join(projectRoot, 'modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.css'),
  'utf8'
);
assert(cssSource.includes('button.vqd-message-file{width:100%'));

const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
assert(indexSource.includes('ventas-cotizaciones-detalle.js?v=20260803-cffaa05-v001'));
assert(indexSource.includes('ventas-cotizaciones-detalle.css?v=20260803-cffaa05-v001'));

const postflight = readBackend('sql/20260803_CFFAA_05_POSTFLIGHT.sql');
assert(postflight.includes('azure_activos_incompletos'));
assert(postflight.includes('archivos_activos_en_comentarios_inactivos'));
assert(postflight.includes('comentarios_artificiales_archivo_adjunto'));
const postflightWithoutComments = postflight.replace(/^\s*--.*$/gm, '');
assert.strictEqual(/\b(UPDATE|DELETE|INSERT|ALTER|DROP|CREATE|TRUNCATE)\b/i.test(postflightWithoutComments), false);

console.log('CFFAA-05: interacción atómica, SAS bajo demanda, baja coordinada y versionado de Cotizaciones validados.');
