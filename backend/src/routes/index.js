const express = require('express');

const healthRoutes = require('../modules/health/health.routes');
const authRoutes = require('./auth.routes');
const dataRoutes = require('./data.routes');
const supportRoutes = require('./support.routes');
const usuariosRoutes = require('./usuarios.routes');
const catalogosRoutes = require('./catalogos.routes');
const devRoutes = require('./dev.routes');
const logisticaRoutes = require('./logistica.routes');
const usuariosRelAdminRoutes = require('./usuarios-rel-admin.routes');
const insFlRoutes = require('./ins-fl.routes');
const panelControlRoutes = require('./panel-control.routes');

const router = express.Router();

router.use(healthRoutes);
router.use('/auth', authRoutes);
router.use('/support', supportRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/catalogos', catalogosRoutes);
router.use('/dev', devRoutes);
router.use('/logistica', logisticaRoutes);
router.use('/ins-fl', insFlRoutes);
router.use('/usuarios-rel-admin', usuariosRelAdminRoutes);
router.use('/panel-control', panelControlRoutes);
router.use(dataRoutes);

module.exports = router;
