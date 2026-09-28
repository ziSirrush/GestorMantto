'use strict';

const service = require('./panel-control-prueba-carga.service');

function actorUser(req) {
  return req.user;
}


function runnerToken(req) {
  return String(req.get('X-Mantto-Load-Test-Token') || '').trim();
}

function assertRunnerToken(req) {
  const token = runnerToken(req);
  if (token) return token;
  const error = new Error('Falta el token efímero del runner.');
  error.status = 401;
  error.code = 'LOAD_TEST_TOKEN_REQUIRED';
  throw error;
}

function assertViewerWriteAllowed(req) {
  if (!req.viewerContext?.active) return;
  const error = new Error('Acción no disponible en modo visor. La vista es únicamente de consulta.');
  error.status = 403;
  error.code = 'VIEWER_READ_ONLY';
  throw error;
}

function sendError(error, res, next, fallbackCode) {
  if (error.status) {
    return res.status(error.status).json({
      ok: false,
      code: error.code || fallbackCode,
      message: error.message
    });
  }
  return next(error);
}

async function getCapabilities(req, res, next) {
  try {
    const data = await service.getCapabilities(actorUser(req));
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_CAPABILITIES_ERROR');
  }
}

async function createSession(req, res, next) {
  try {
    assertViewerWriteAllowed(req);
    const data = await service.createSession(actorUser(req), req.body || {});
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_SESSION_CREATE_ERROR');
  }
}

async function getSession(req, res, next) {
  try {
    const data = await service.getSession(actorUser(req), req.params.id);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_SESSION_READ_ERROR');
  }
}


async function claimRunner(req, res, next) {
  try {
    assertViewerWriteAllowed(req);
    const data = await service.claimRunner(actorUser(req), req.params.id);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_RUNNER_CLAIM_ERROR');
  }
}

async function startSession(req, res, next) {
  try {
    assertViewerWriteAllowed(req);
    const data = await service.startSession(actorUser(req), req.params.id);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_SESSION_START_ERROR');
  }
}

async function stopSession(req, res, next) {
  try {
    const reason = String(req.body?.reason || 'MANUAL').slice(0, 80);
    assertViewerWriteAllowed(req);
    const data = await service.stopSession(actorUser(req), req.params.id, reason);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_SESSION_STOP_ERROR');
  }
}


async function getRunnerControl(req, res, next) {
  try {
    const data = service.runnerControl(req.params.id, assertRunnerToken(req));
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_RUNNER_CONTROL_ERROR');
  }
}

async function postRunnerSample(req, res, next) {
  try {
    const data = service.runnerSample(req.params.id, assertRunnerToken(req), req.body || {});
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_RUNNER_SAMPLE_ERROR');
  }
}

async function postRunnerStopAck(req, res, next) {
  try {
    const data = service.runnerAcknowledgeStop(req.params.id, assertRunnerToken(req));
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_RUNNER_STOP_ACK_ERROR');
  }
}

async function postRunnerAbort(req, res, next) {
  try {
    const reason = String(req.body?.reason || 'RUNNER_ABORT').slice(0, 120);
    const data = service.runnerSignalAbort(req.params.id, assertRunnerToken(req), reason);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_RUNNER_ABORT_ERROR');
  }
}

async function postRunnerFinish(req, res, next) {
  try {
    const reason = String(req.body?.reason || 'RUNNER_TEARDOWN').slice(0, 120);
    const data = await service.runnerFinish(req.params.id, assertRunnerToken(req), reason);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_RUNNER_FINISH_ERROR');
  }
}


async function postRunnerSummary(req, res, next) {
  try {
    const data = service.runnerSummary(req.params.id, assertRunnerToken(req), req.body || {});
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_RUNNER_SUMMARY_ERROR');
  }
}

async function getReport(req, res, next) {
  try {
    const data = await service.getReport(actorUser(req), req.params.id);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_REPORT_ERROR');
  }
}

async function deleteSession(req, res, next) {
  try {
    assertViewerWriteAllowed(req);
    const data = await service.deleteSession(actorUser(req), req.params.id);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(error, res, next, 'LOAD_TEST_SESSION_DELETE_ERROR');
  }
}

module.exports = {
  getCapabilities,
  createSession,
  getSession,
  claimRunner,
  startSession,
  stopSession,
  getRunnerControl,
  postRunnerSample,
  postRunnerStopAck,
  postRunnerAbort,
  postRunnerFinish,
  postRunnerSummary,
  getReport,
  deleteSession
};
