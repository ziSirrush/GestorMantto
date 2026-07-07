const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.get('/', requireAuth, usuariosController.listUsuarios);
router.get('/directorio', requireAuth, usuariosController.directorio);
router.get('/:id/detalle', requireAuth, usuariosController.detalle);
router.get('/:id/roles', requireAuth, usuariosController.rolesUsuario);
router.get('/:id/zonas', requireAuth, usuariosController.zonasUsuario);
router.get('/:id', requireAuth, usuariosController.detalle);
router.post('/', requireAuth, usuariosController.createUsuario);
router.put('/:id', requireAuth, usuariosController.updateUsuario);

module.exports = router;
