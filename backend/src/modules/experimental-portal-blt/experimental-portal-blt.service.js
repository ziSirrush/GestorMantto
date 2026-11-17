'use strict';

// Pase de 2 minutos para abrir vistas del Portal BLT. Audiencia propia: no sirve como sesión de BLT NOW.
const jwt = require('jsonwebtoken');

const PASS_AUDIENCE = 'portal-blt-embed';
const PASS_ISSUER = 'blt-now-api';
const PASS_USE = 'portal_blt_embed';
const PASS_SECONDS = 120;
const PORTAL_EMBED_BASE = 'https://bltmexico.duckdns.org/embed/';

const VIEWS = Object.freeze({
  movimientos: 'EXPERIMENTAL_PORTAL_BLT_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL'
});

function invalid(message, status = 400, code = 'PORTAL_BLT_PASS_INVALID') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function permissionFor(view) {
  const code = VIEWS[String(view || '')];
  if (!code) throw invalid('Vista del Portal BLT no reconocida.', 400, 'PORTAL_BLT_VIEW_UNKNOWN');
  return code;
}

function issuePass(user, view) {
  permissionFor(view);
  const id = Number(user && user.id_SB);
  if (!Number.isSafeInteger(id) || id <= 0) throw invalid('Sesión sin usuario válido.', 401, 'PORTAL_BLT_SESSION_REQUIRED');
  const pase = jwt.sign({
    token_use: PASS_USE,
    vista: view,
    usuario: { id, nombre: String(user.nombre || ''), correo: String(user.correo || '') }
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256', audience: PASS_AUDIENCE, issuer: PASS_ISSUER,
    subject: String(id), expiresIn: PASS_SECONDS
  });
  return {
    pase,
    expires_in: PASS_SECONDS,
    url: PORTAL_EMBED_BASE + encodeURIComponent(view) + '/#pase=' + encodeURIComponent(pase)
  };
}

function verifyPass(pase) {
  let decoded;
  try {
    decoded = jwt.verify(String(pase || ''), process.env.JWT_SECRET, {
      algorithms: ['HS256'], audience: PASS_AUDIENCE, issuer: PASS_ISSUER,
      maxAge: PASS_SECONDS + 's', clockTolerance: 5
    });
  } catch (error) {
    throw invalid('Pase inválido o vencido.', 401);
  }
  if (decoded.token_use !== PASS_USE || !VIEWS[decoded.vista] || !decoded.usuario) {
    throw invalid('Pase inválido o vencido.', 401);
  }
  return { vista: decoded.vista, usuario: decoded.usuario };
}

module.exports = { VIEWS, PASS_SECONDS, permissionFor, issuePass, verifyPass };
