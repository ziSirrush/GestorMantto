// [Aster | 2026-08-19 | ASTER-MG | FASE 4: Guard General por modulo]
const express = require('express');
const multer = require('multer');
const router = express.Router();
const insFlController = require('../controllers/ins-fl.controller');
const insFlReadController = require('../controllers/ins-fl-read-cor.controller');
const { protectManualAltasCor } = require('../modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard');
const filePolicy = require('../services/storage/storage-file-policy.service');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../middleware/information-access-gnral.middleware');
const {
  requireProjectPhotoManager_gnral,
  requireCorellianProjectPhotoScope_gnral
} = require('../middleware/project-photo.middleware');

const requireInsFlIntegration = requireIntegrationAuthFor('INTEGRATION_INS_FL_ID');

const uploadProjectPhotoMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: filePolicy.getLimits_gnral().maxFileBytes
  }
}).single('foto');

function uploadProjectPhoto(req, res, next) {
  uploadProjectPhotoMulter(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, message: 'La fotografia supera el tamano maximo permitido.' });
    }
    return res.status(400).json({ ok: false, message: error.message || 'No fue posible leer la fotografia.' });
  });
}

function instalacionesGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['INSTALACIONES']
  });
}

// [BLT NOW | 2026-10-20 | ALTAS FASE 5 V001]
// Un cierre prematuro de HTTP no libera el candado mientras GAS sigue escribiendo.
async function syncWithHeldAltasLockCor(req,res,next) {
  try {
    return await insFlController.syncInsFl(req,res);
  } catch(error) {
    return next(error);
  } finally {
    if(typeof req.bltnowInsFlGuardReleaseCor === 'function') {
      await req.bltnowInsFlGuardReleaseCor();
    }
  }
}
router.post('/sync', requireInsFlIntegration, protectManualAltasCor, syncWithHeldAltasLockCor);

const PROJECT_DETAIL_PHOTO_ACCESS = Object.freeze([
  'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.ABRIR_DETALLE',
  'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'
]);

router.get('/', ...instalacionesGuard('INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'), insFlReadController.getInsFl_cor);
router.get('/proyectos', ...instalacionesGuard('INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'), insFlReadController.getInsFlProjects_cor);
router.get(
  '/proyectos/fotografias',
  ...instalacionesGuard(PROJECT_DETAIL_PHOTO_ACCESS),
  insFlReadController.getInsFlProjectPhotos_cor
);
// Consulta ligera para el rol Gestor de Fotografias (sin exponer fotos ni alterar datos).
router.get(
  '/proyectos/fotografias-gestion',
  ...instalacionesGuard(PROJECT_DETAIL_PHOTO_ACCESS),
  requireProjectPhotoManager_gnral,
  insFlReadController.getInsFlProjectPhotoManagementScope_cor
);
router.post(
  '/proyectos/fotografias/:id_ppns',
  ...instalacionesGuard(PROJECT_DETAIL_PHOTO_ACCESS),
  requireCorellianProjectPhotoScope_gnral,
  requireProjectPhotoManager_gnral,
  uploadProjectPhoto,
  insFlController.uploadInsFlProjectPhoto
);
router.delete(
  '/proyectos/fotografias/:id_ppns/:campo',
  ...instalacionesGuard(PROJECT_DETAIL_PHOTO_ACCESS),
  requireCorellianProjectPhotoScope_gnral,
  requireProjectPhotoManager_gnral,
  insFlController.deleteInsFlProjectPhoto
);
router.patch(
  '/proyectos/fotografias/:id_ppns/principal',
  ...instalacionesGuard(PROJECT_DETAIL_PHOTO_ACCESS),
  requireCorellianProjectPhotoScope_gnral,
  requireProjectPhotoManager_gnral,
  insFlController.updateInsFlProjectMainPhoto
);
router.get('/proyectos/concentrado-clientes', ...instalacionesGuard('INSTALACIONES_CONCENTRADO_CLIENTE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), insFlReadController.getInsFlClientConcentrate_cor);
router.get('/:id', ...instalacionesGuard([
  'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.ABRIR_DETALLE',
  'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'
]), insFlReadController.getInsFlById_cor);

module.exports = router;
