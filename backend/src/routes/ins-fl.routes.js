const express = require('express');
const router = express.Router();
const insFlController = require('../controllers/ins-fl.controller');

router.post('/sync', insFlController.syncInsFl);
router.get('/', insFlController.getInsFl);
router.get('/proyectos', insFlController.getInsFlProjects);
router.get('/proyectos/fotografias', insFlController.getInsFlProjectPhotos);
router.get('/proyectos/concentrado-clientes', insFlController.getInsFlClientConcentrate);
router.get('/:id', insFlController.getInsFlById);

module.exports = router;