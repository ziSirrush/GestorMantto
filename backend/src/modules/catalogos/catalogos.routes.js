// [Aster | 2026-08-12 | ASTER-MG | FIX: FIX_SYNCS_TICKETS_PORTAFOLIO_V001]
const express = require('express');
const catalogosController = require('./catalogos.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = express.Router();

// IMPORTANTE:
// La autenticacion de Catalogos debe aplicarse solo a sus propias rutas.
// Un router.use(requireAuth) global aqui intercepta cualquier request que
// atraviese data.routes.js antes de llegar a Tickets, Portafolio y otros
// modulos montados despues de Catalogos.
router.get('/estados-visuales', requireAuth, catalogosController.getEstadosVisuales);
router.get('/permisos', requireAuth, catalogosController.getPermisos);
router.get('/roles', requireAuth, catalogosController.getRoles);
router.get('/zonas', requireAuth, catalogosController.getZonas);
router.get('/usuario-zop', requireAuth, catalogosController.getUsuarioZop);

module.exports = router;
