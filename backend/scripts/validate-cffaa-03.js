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
const filesService = require('../src/modules/support/support-files.service');
const storageSchema = require('../src/services/storage/storage-schema.service');

assert.strictEqual(filesService.MAX_INITIAL_FILES, 5);
assert.strictEqual(filesService.MAX_FILE_MB, Number(process.env.AZURE_STORAGE_MAX_FILE_MB || 25));
assert.deepStrictEqual(filesService.normalizeFiles_gnral(null), []);
assert.strictEqual(filesService.normalizeFiles_gnral([{ originalname: 'a.pdf' }]).length, 1);
assert.strictEqual(filesService.resolveTicketCompany_gnral({ empresa: 'United Elevadores' }), 'United Elevadores');
assert.strictEqual(filesService.resolveTicketCompany_gnral({ usuario_empresa: 'Corellian SA de CV' }), 'Corellian SA de CV');

let error = null;
try { filesService.resolveTicketCompany_gnral({}); } catch (caught) { error = caught; }
assert(error);
assert.strictEqual(error.code, 'CFFAA_SUPPORT_COMPANY_REQUIRED');

const presented = filesService.presentAttachment_gnral({
  id_adjunto: 7,
  id_ticket: 3,
  nombre_original: 'reporte.pdf',
  mime_type: 'application/pdf',
  peso_archivo: 100,
  storage_provider: 'AZURE_BLOB',
  storage_container: 'privado',
  storage_blob_name: 'united/soporte/archivo.pdf',
  ruta_archivo: 'united/soporte/archivo.pdf',
  activo: 1
}, 3);
assert.strictEqual(presented.access_endpoint, '/api/support/tickets/3/adjuntos/7/acceso');
assert.strictEqual(Object.prototype.hasOwnProperty.call(presented, 'storage_blob_name'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(presented, 'storage_container'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(presented, 'ruta_archivo'), false);

assert(storageSchema.REQUIRED_COLUMNS.sup_tickets.includes('empresa'));
assert(storageSchema.REQUIRED_COLUMNS.sup_adjuntos.includes('storage_blob_name'));

const routeSource = fs.readFileSync(path.join(backendRoot, 'src/routes/support.routes.js'), 'utf8');
assert(routeSource.includes("fieldName: 'archivos'"));
assert(routeSource.includes("maxFiles: 5"));
assert(routeSource.includes("policyName: 'GENERAL'"));
assert(routeSource.includes("fieldName: 'archivo'"));
assert(routeSource.includes("router.delete("));
assert(routeSource.includes("requireStorageSchema('sup_tickets', 'sup_adjuntos')"));
assert.strictEqual(routeSource.includes("require('multer')"), false);

const controllerSource = fs.readFileSync(path.join(backendRoot, 'src/controllers/support.controller.js'), 'utf8');
assert(controllerSource.includes('createTicketWithAttachments_gnral'));
assert(controllerSource.includes('addAttachment_gnral'));
assert(controllerSource.includes('createAttachmentAccess_gnral'));
assert(controllerSource.includes('deleteAttachment_gnral'));
assert.strictEqual(controllerSource.includes('req.user.empresa || ticket.empresa'), false);

const supportServiceSource = fs.readFileSync(path.join(backendRoot, 'src/services/support-solicitudes.service.js'), 'utf8');
assert(supportServiceSource.includes('presentAttachment_gnral'));
assert(supportServiceSource.includes('ticket.empresa = ticket.empresa || ticket.usuario_empresa'));

const legacyFrontend = fs.readFileSync(path.join(projectRoot, 'modules/support/support.js'), 'utf8');
assert.strictEqual(legacyFrontend.includes('readAsDataURL'), false);
assert.strictEqual(legacyFrontend.includes('FileReader'), false);
assert(legacyFrontend.includes("form.append('archivos',file,file.name)"));
assert(legacyFrontend.includes('SUPPORT_MAX_FILE_BYTES=25*1024*1024'));
assert(legacyFrontend.includes('SUPPORT_MAX_REQUEST_BYTES=50*1024*1024'));

const modernFrontend = fs.readFileSync(path.join(projectRoot, 'modules/soporte-solicitudes/soporte-solicitudes.js'), 'utf8');
assert(modernFrontend.includes('data-ss-file-delete'));
assert(modernFrontend.includes("method: 'DELETE'"));
assert(modernFrontend.includes('/adjuntos/'));
assert(modernFrontend.includes('permissions.delete_attachment'));

const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
assert(indexSource.includes('Máximo 25 MB por archivo, 50 MB en total y hasta 5 archivos.'));
assert(indexSource.includes('soporte-solicitudes.js?v=20260803-cffaa03-v001'));
assert(indexSource.includes('support.js?v=20260803-cffaa03-v001'));

const migrationSource = fs.readFileSync(path.join(backendRoot, 'sql/20260803_CFFAA_03_SOPORTE_AZURE.sql'), 'utf8');
assert(migrationSource.includes("'sup_tickets',\n  'empresa'"));
assert(migrationSource.includes('idx_sup_tickets_empresa'));
assert(migrationSource.includes('SET SQL_SAFE_UPDATES = 0'));
assert(migrationSource.includes('SET SQL_SAFE_UPDATES = @cffaa03_sql_safe_updates_anterior'));
assert(migrationSource.includes('t.id_ticket IS NOT NULL'));

console.log('CFFAA-03: Soporte multipart, empresa persistida, SAS bajo demanda y baja de adjuntos validados.');
