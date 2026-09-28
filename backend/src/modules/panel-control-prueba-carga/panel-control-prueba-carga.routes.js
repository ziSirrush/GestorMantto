'use strict';

const express = require('express');
const { requireAuth } = require('../../middleware/auth.middleware');
const controller = require('./panel-control-prueba-carga.controller');

const router = express.Router();

// Operación administrativa desde Panel de Control: siempre exige sesión autenticada.
router.get('/capabilities', requireAuth, controller.getCapabilities);
router.post('/session', requireAuth, controller.createSession);
router.get('/session/:id', requireAuth, controller.getSession);
router.post('/session/:id/runner-claim', requireAuth, controller.claimRunner);
router.post('/session/:id/start', requireAuth, controller.startSession);
router.post('/session/:id/stop', requireAuth, controller.stopSession);
router.get('/session/:id/report', requireAuth, controller.getReport);
router.delete('/session/:id', requireAuth, controller.deleteSession);

// Canal efímero del runner: no usa JWT por request. Se autentica exclusivamente
// con el token aleatorio de 256 bits reclamado una sola vez y almacenado como hash.
router.get('/session/:id/runner-control', controller.getRunnerControl);
router.post('/session/:id/runner-sample', controller.postRunnerSample);
router.post('/session/:id/runner-stop-ack', controller.postRunnerStopAck);
router.post('/session/:id/runner-abort', controller.postRunnerAbort);
router.post('/session/:id/runner-finish', controller.postRunnerFinish);
router.post('/session/:id/runner-summary', controller.postRunnerSummary);

module.exports = router;
