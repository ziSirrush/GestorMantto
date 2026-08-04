const express = require('express');
const router = express.Router();

router.use(require('./data/catalogos.routes'));
router.use(require('./data/tickets.routes'));
router.use(require('./data/portafolio.routes'));
router.use(require('./data/proyectos.routes'));
router.use(require('./data/dashboard-operativo.routes'));
router.use(require('./data/criticos.routes'));
router.use(require('./data/home.routes'));
router.use(require('./data/pendientes.routes'));
router.use(require('./data/notificaciones.routes'));

module.exports = router;
