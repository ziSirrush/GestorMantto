'use strict';

const express = require('express');
const { requireAuth } = require('../../middleware/auth.middleware');
const controller = require('./panel-control-prueba-carga.controller');
const { desktopOnly } = require('./panel-control-prueba-carga.desktop');

const router = express.Router();

// Operación administrativa desde Panel de Control: siempre exige sesión autenticada.
router.get('/capabilities', desktopOnly, requireAuth, controller.getCapabilities);
router.post('/session', desktopOnly, requireAuth, controller.createSession);
router.get('/session/:id', desktopOnly, requireAuth, controller.getSession);
router.post('/session/:id/dispatch', desktopOnly, requireAuth, controller.dispatchSession);
router.post('/session/:id/stop', desktopOnly, requireAuth, controller.stopSession);
router.get('/session/:id/report', desktopOnly, requireAuth, controller.getReport);
router.delete('/session/:id', desktopOnly, requireAuth, controller.deleteSession);

router.post('/runner/heartbeat', controller.runnerHeartbeat);
router.post('/runner/lease', controller.runnerLease);
router.get('/runner/test-identity', requireAuth, controller.validateTestIdentity);
router.post('/session/:id/runner-start', controller.runnerStart);

// Canal efímero del runner: no usa JWT por request. Se autentica exclusivamente
// con el token aleatorio de 256 bits reclamado una sola vez y almacenado como hash.
router.get('/session/:id/runner-control', controller.getRunnerControl);
router.post('/session/:id/runner-sample', controller.postRunnerSample);
router.post('/session/:id/runner-stop-ack', controller.postRunnerStopAck);
router.post('/session/:id/runner-abort', controller.postRunnerAbort);
router.post('/session/:id/runner-finish', controller.postRunnerFinish);
router.post('/session/:id/runner-summary', controller.postRunnerSummary);

module.exports = router;
