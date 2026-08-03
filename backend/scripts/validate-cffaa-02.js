const fs = require('fs');
const path = require('path');

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'cffaa_validation';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'cffaa_validation';
process.env.DB_NAME = process.env.DB_NAME || 'mydb';
process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME = process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || 'mantto-gestor-archivos';
process.env.CFFAA_FILE_SIGNATURE_VALIDATION = 'true';

const root = path.resolve(__dirname, '..');
const projectRoot = path.resolve(root, '..');
const service = require('../src/modules/pendientes/pendientes-files.service');
const filesController = require('../src/modules/pendientes/pendientes-files.controller');

let failed = false;

function check(condition, message) {
  if (condition) {
    console.log(`[OK] ${message}`);
  } else {
    console.error(`[ERROR] ${message}`);
    failed = true;
  }
}

const normalized = service.normalizeTaskBody_gnral({
  usuarios_json: '["JV","AB"]',
  subtareas_json: '[{"subtarea":"Uno"}]',
  con_subtareas: '1'
});
check(Array.isArray(normalized.usuarios) && normalized.usuarios.length === 2, 'Formulario multipart convierte usuarios_json.');
check(Array.isArray(normalized.subtareas) && normalized.subtareas.length === 1, 'Formulario multipart convierte subtareas_json.');
check(normalized.con_subtareas === true, 'Formulario multipart convierte con_subtareas.');

const jpeg = {
  fieldname: 'photo_file',
  originalname: 'evidencia.jpg',
  mimetype: 'image/jpeg',
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]),
  size: 5
};
const evidence = service.extractTaskEvidence_gnral({ body: {}, files: { photo_file: [jpeg] } });
check(evidence && evidence.tipo_archivo === 'FOTO', 'La evidencia de imagen usa la política IMAGE.');

let base64Rejected = false;
try {
  service.extractCommentFile_gnral({ body: { archivo: 'data:image/jpeg;base64,AAAA' } });
} catch (error) {
  base64Rejected = error.code === 'CFFAA_BASE64_UPLOAD_DISABLED';
}
check(base64Rejected, 'Las cargas Base64 antiguas quedan rechazadas.');

const safeTask = service.sanitizePendienteForClient_gnral({
  id_pendiente: 1,
  photo_url: 'azureblob:privado/a.jpg',
  adjunto_url: 'https://legacy.example/file.pdf'
});
check(!Object.prototype.hasOwnProperty.call(safeTask, 'photo_url') && !Object.prototype.hasOwnProperty.call(safeTask, 'adjunto_url'), 'El detalle no expone referencias internas o enlaces históricos directos.');
check(safeTask.tiene_evidencia_legacy === 1, 'El detalle conserva el indicador de evidencia histórica.');

const comments = service.attachCommentFiles_gnral(
  [{ id_comentario: 7, comentario: '' }],
  [{ id_adjunto: 9, id_comentario: 7, nombre_archivo: 'archivo.pdf', storage_provider: 'AZURE_BLOB', activo: 1 }],
  1
);
check(comments[0].adjuntos[0].access_endpoint === '/api/pendientes/1/comentarios/7/adjuntos/9/acceso', 'Los adjuntos de comentario usan acceso autenticado bajo demanda.');

check(typeof filesController.getDirectFileAccess === 'function', 'Controlador de acceso para evidencia directa disponible.');
check(typeof filesController.getCommentFileAccess === 'function', 'Controlador de acceso para adjunto de comentario disponible.');
check(typeof filesController.getLegacyFileAccess === 'function', 'Controlador de compatibilidad histórica disponible.');
check(typeof filesController.deleteDirectFile === 'function', 'Controlador de baja lógica de evidencia disponible.');

const routesSource = fs.readFileSync(path.join(root, 'src/modules/pendientes/pendientes.routes.js'), 'utf8');
check(routesSource.includes("createUploadMiddleware_gnral"), 'Rutas de Pendientes usan el middleware común CFFAA-01.');
check(routesSource.includes("'/pendientes/:id/archivos/:idArchivo/acceso'"), 'Ruta de acceso a evidencia directa registrada.');
check(routesSource.includes("'/pendientes/:id/comentarios/:idComentario/adjuntos/:idAdjunto/acceso'"), 'Ruta de acceso a adjuntos de comentarios registrada.');
check(routesSource.includes("'/pendientes/:id/archivos/:idArchivo'"), 'Ruta de eliminación de evidencia registrada.');


const legacyServiceSource = fs.readFileSync(path.join(root, 'src/modules/pendientes/pendientes-files.service.js'), 'utf8');
check(legacyServiceSource.includes("String((tipo === 'FOTO' ? access.row.photo_url : access.row.adjunto_url) || '')"), 'La compatibilidad histórica no convierte valores NULL en la cadena "null".');

const dataControllerSource = fs.readFileSync(path.join(root, 'src/controllers/data.controller.legacy.js'), 'utf8');
check(!dataControllerSource.includes("pu_auth.tipo_relacion = 'RESPONSABLE'"), 'El bootstrap reconoce cualquier relación explícita autorizada en tareas colaborativas.');
check(!dataControllerSource.includes("access.row.empresa || user.empresa || 'general'"), 'Los adjuntos usan la empresa persistida de la tarea, no la empresa circunstancial del actor.');
check(dataControllerSource.includes('PENDIENTE_EMPRESA_NOT_DEFINED'), 'Las tareas históricas sin empresa bloquean la carga antes de clasificar el blob incorrectamente.');

const liveHomeServiceSource = fs.readFileSync(path.join(root, 'src/modules/home/home.service.js'), 'utf8');
check(liveHomeServiceSource.includes('sanitizePendienteForClient_gnral'), 'El bootstrap modular de Home sanitiza referencias de archivos antes de responder.');
check(!liveHomeServiceSource.includes("pu_auth.tipo_relacion = 'RESPONSABLE'"), 'El bootstrap modular reconoce cualquier relacion explicita autorizada.');

const liveHomeRepositorySource = fs.readFileSync(path.join(root, 'src/modules/home/home.repository.js'), 'utf8');
check(liveHomeRepositorySource.includes('FROM pendientes_archivos'), 'El bootstrap modular contabiliza evidencias directas activas.');

const liveHomeRoutesSource = fs.readFileSync(path.join(root, 'src/modules/home/home.routes.js'), 'utf8');
check(liveHomeRoutesSource.includes('requireHomeStorage'), 'El bootstrap modular valida el esquema CFFAA-02 antes de consultar archivos.');
check(!liveHomeRoutesSource.includes('optionalAuth'), 'Las rutas modulares de Home requieren sesion.');

const notificationsServiceSource = fs.readFileSync(path.join(root, 'src/modules/notificaciones/notificaciones.service.js'), 'utf8');
check(!notificationsServiceSource.includes("pu_auth.tipo_relacion = 'RESPONSABLE'"), 'Las notificaciones de tareas reconocen responsables y usuarios en seguimiento.');

const notificationsRoutesSource = fs.readFileSync(path.join(root, 'src/modules/notificaciones/notificaciones.routes.js'), 'utf8');
check(notificationsRoutesSource.includes("router.get('/notificaciones', requireAuth"), 'El listado modular de notificaciones exige sesion.');
check(!notificationsRoutesSource.includes('optionalAuth'), 'El listado modular de notificaciones no permite consultas anonimas.');

const routerSource = fs.readFileSync(path.join(projectRoot, 'core/router.js'), 'utf8');
check(routerSource.includes("focus:focusChat ? 'chat' : null"), 'Las notificaciones de comentarios de tareas conservan el enfoque directo al chat.');

const homeSource = fs.readFileSync(path.join(projectRoot, 'modules/home/home.js'), 'utf8');
check(!homeSource.includes('readAsDataURL('), 'Home ya no convierte archivos a Base64.');
check(homeSource.includes("payload.append('photo_file'"), 'Home envía imágenes como multipart.');
check(homeSource.includes("payload.append('adjunto_file'"), 'Home envía documentos como multipart.');
check(homeSource.includes("payload.append('archivo'"), 'Comentarios envían adjuntos como multipart.');
check(homeSource.includes('access_endpoint'), 'Home abre archivos mediante endpoints autenticados.');
check(homeSource.includes('[task.responsables, task.seguimiento]'), 'El filtro defensivo del frontend reconoce relaciones colaborativas autorizadas.');

for (const relative of [
  'sql/20260803_CFFAA_02_HOME_PENDIENTES_AZURE.sql',
  'sql/20260803_CFFAA_02_POSTFLIGHT.sql'
]) {
  check(fs.existsSync(path.join(root, relative)), `${relative} incluido.`);
}

if (failed) process.exit(1);
console.log('CFFAA-02 validado correctamente.');
process.exit(0);
