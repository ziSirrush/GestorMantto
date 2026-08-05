'use strict';

const jwt = require('jsonwebtoken');
const db = require('../config/db');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_VIEWER_MUTATIONS = new Set([
  '/api/panel-control/viewer-close'
]);

function parseBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header || !String(header).startsWith('Bearer ')) return null;
  return String(header).slice(7).trim();
}

function cleanPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function viewerHeader(req) {
  const token = String(req.get('X-Viewer-Token') || '').trim();
  const targetId = Number(req.get('X-View-User-ID') || 0);
  return {
    token,
    targetId: Number.isInteger(targetId) && targetId > 0 ? targetId : null,
    active: Boolean(token || targetId)
  };
}

function decodeActor(req) {
  const token = parseBearer(req);
  if (!token) return null;
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const actorId = Number(payload?.id_SB || payload?.id || payload?.user_id || 0);
  return Number.isInteger(actorId) && actorId > 0 ? actorId : null;
}

function decodeViewerContext(req, actorId, header) {
  if (!header.token) {
    return {
      actorId,
      targetId: header.targetId,
      readOnly: true
    };
  }

  const payload = jwt.verify(header.token, process.env.JWT_SECRET);
  const tokenActorId = Number(payload?.actor_id || 0);
  const targetId = Number(payload?.target_id || 0);

  if (
    payload?.type !== 'user_viewer' ||
    payload?.read_only !== true ||
    !Number.isInteger(tokenActorId) ||
    tokenActorId <= 0 ||
    tokenActorId !== actorId ||
    !Number.isInteger(targetId) ||
    targetId <= 0
  ) {
    const error = new Error('El contexto temporal del Visor de usuarios no es válido.');
    error.code = 'VIEWER_CONTEXT_INVALID';
    throw error;
  }

  return {
    actorId,
    targetId,
    readOnly: true
  };
}

async function auditBlockedMutation(req, context) {
  try {
    await db.query(
      `INSERT INTO auth_audit (
        usuario_id,
        event_type,
        event_details,
        ip_address
      ) VALUES (?, ?, ?, ?)`,
      [
        context.actorId,
        'VIEWER_MUTATION_BLOCKED',
        JSON.stringify({
          target_user_id: context.targetId,
          method: String(req.method || '').toUpperCase(),
          path: cleanPath(req),
          user_agent: String(req.get('user-agent') || '').slice(0, 240)
        }),
        req.ip || null
      ]
    );
  } catch (error) {
    console.warn('[VIEWER AUDIT]', error.message);
  }
}

async function viewerReadOnlyGuard(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return next();

  const header = viewerHeader(req);
  if (!header.active) return next();

  const path = cleanPath(req);
  if (ALLOWED_VIEWER_MUTATIONS.has(path)) return next();

  try {
    const actorId = decodeActor(req);
    if (!actorId) {
      return res.status(401).json({
        ok: false,
        code: 'VIEWER_ACTOR_SESSION_REQUIRED',
        message: 'La sesión real del Visor de usuarios no es válida.'
      });
    }

    const context = decodeViewerContext(req, actorId, header);
    await auditBlockedMutation(req, context);

    return res.status(403).json({
      ok: false,
      code: 'VIEWER_READ_ONLY',
      message: 'Acción no disponible en modo visor. La vista es únicamente de consulta.'
    });
  } catch (error) {
    return res.status(403).json({
      ok: false,
      code: error.code || 'VIEWER_CONTEXT_INVALID',
      message: error.message || 'El contexto del Visor de usuarios no es válido.'
    });
  }
}

module.exports = {
  viewerReadOnlyGuard
};
