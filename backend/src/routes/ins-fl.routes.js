// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_2_BACKEND_M2M_GUARDS_V001]
const express = require('express');
const router = express.Router();
const insFlController = require('../controllers/ins-fl.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../middleware/integration-auth.middleware');

const requireInsFlIntegration = requireIntegrationAuthFor('INTEGRATION_INS_FL_ID');

router.post('/sync', requireInsFlIntegration, insFlController.syncInsFl);
router.get('/', insFlController.getInsFl);
router.get('/proyectos', insFlController.getInsFlProjects);
router.get('/proyectos/fotografias', insFlController.getInsFlProjectPhotos);
router.patch('/proyectos/fotografias/:id_ppns/principal', requireAuth, requireRole('Programador'), insFlController.updateInsFlProjectMainPhoto);
router.get('/proyectos/concentrado-clientes', insFlController.getInsFlClientConcentrate);
router.get('/:id', insFlController.getInsFlById);

module.exports = router;