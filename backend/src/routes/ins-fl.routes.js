// [Aster | 2026-08-19 | ASTER-MG | FASE 4: Guard General por modulo]
const express = require('express');
const multer = require('multer');
const router = express.Router();
const insFlController = require('../controllers/ins-fl.controller');
const insFlReadController = require('../controllers/ins-fl-read-cor.controller');
const { requireRole } = require('../middleware/auth.middleware');
const filePolicy = require('../services/storage/storage-file-policy.service');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');
const { humanInformationGuard_gnral } = require('../middleware/information-access-gnral.middleware');

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

function requireProjectPhotoManager(req, res, next) {
  const roles = new Set([
    req.user && req.user.rol,
    ...((req.user && Array.isArray(req.user.roles)) ? req.user.roles : [])
  ].filter(Boolean));

  if (roles.has('Programador') || roles.has('Director General')) return next();
  return res.status(403).json({
    ok: false,
    message: 'No tienes permisos para agregar fotografias de proyecto.'
  });
}

function instalacionesGuard(permissionCodesAny) {
  return humanInformationGuard_gnral({
    permissionCodesAny: Array.isArray(permissionCodesAny) ? permissionCodesAny : [permissionCodesAny],
    domain: 'CORELLIAN',
    groupingCodesAny: ['INSTALACIONES']
  });
}

router.post('/sync', requireInsFlIntegration, insFlController.syncInsFl);

router.get('/', ...instalacionesGuard('INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'), insFlReadController.getInsFl_cor);
router.get('/proyectos', ...instalacionesGuard('INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'), insFlReadController.getInsFlProjects_cor);
router.get('/proyectos/fotografias', ...instalacionesGuard('INSTALACIONES_PROYECTOS_REDIRECCIONES_FOTOGRAFIAS.VER'), insFlReadController.getInsFlProjectPhotos_cor);
router.post(
  '/proyectos/fotografias/:id_ppns',
  ...instalacionesGuard([
    'INSTALACIONES_PROYECTOS_REDIRECCIONES_FOTOGRAFIAS.VER',
    'INSTALACIONES_PROYECTOS_REDIRECCIONES_FOTOGRAFIAS.ABRIR_SECCION'
  ]),
  requireProjectPhotoManager,
  uploadProjectPhoto,
  insFlController.uploadInsFlProjectPhoto
);
router.patch(
  '/proyectos/fotografias/:id_ppns/principal',
  ...instalacionesGuard('INSTALACIONES_PROYECTOS_REDIRECCIONES_FOTOGRAFIAS.VER'),
  requireRole('Programador'),
  insFlController.updateInsFlProjectMainPhoto
);
router.get('/proyectos/concentrado-clientes', ...instalacionesGuard('INSTALACIONES_CONCENTRADO_CLIENTE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'), insFlReadController.getInsFlClientConcentrate_cor);
router.get('/:id', ...instalacionesGuard([
  'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.ABRIR_DETALLE',
  'INSTALACIONES_PROYECTOS_TABLA_ACTIVOS_REGISTROS.VER'
]), insFlReadController.getInsFlById_cor);

module.exports = router;
