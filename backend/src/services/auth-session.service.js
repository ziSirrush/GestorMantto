'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const { hydrateAuthUser } = require('../middleware/auth.middleware');

const IDLE_DAYS = 90;
const ABSOLUTE_DAYS = 90;
const COOKIE_NAME = 'mantto_refresh';
const DAY_MS = 24 * 60 * 60 * 1000;

function timestampMarker(value) {
  if (!value) return 'never';
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function matchesHash(value, expectedHash) {
  const actual = Buffer.from(tokenHash(value), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readCsrfToken(req) {
  return String(req.get?.('X-Session-CSRF') || '').trim();
}

function readCookie(req) {
  const raw = String(req.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch (_error) {
      return '';
    }
  }
  return '';
}

function isSecureRequest(req) {
  return Boolean(req.secure) ||
    String(req.get?.('X-Forwarded-Proto') || '').toLowerCase() === 'https' ||
    process.env.NODE_ENV === 'production';
}

function cookieValue(req, token, maxAgeSeconds) {
  const secure = isSecureRequest(req);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/api/auth',
    'HttpOnly',
    `SameSite=${secure ? 'None' : 'Lax'}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function setRefreshCookie(req, res, token, absoluteExpiresAt) {
  const remainingAbsolute = Math.max(0, new Date(absoluteExpiresAt).getTime() - Date.now());
  const maxAgeSeconds = Math.min(IDLE_DAYS * 86400, Math.floor(remainingAbsolute / 1000));
  res.append('Set-Cookie', cookieValue(req, token, maxAgeSeconds));
}

function clearRefreshCookie(req, res) {
  res.append('Set-Cookie', cookieValue(req, '', 0));
}

function requestMetadata(req) {
  return {
    ip: String(req.ip || '').slice(0, 64) || null,
    userAgent: String(req.get?.('User-Agent') || '').slice(0, 255) || null
  };
}

async function createRefreshSession(req, res, user, sessionStartedAt = new Date()) {
  const now = new Date();
  const startedAt = new Date(sessionStartedAt);
  const absoluteExpiresAt = new Date(startedAt.getTime() + ABSOLUTE_DAYS * DAY_MS);
  if (absoluteExpiresAt <= now) {
    const error = new Error('La sesión alcanzó su duración máxima de 90 días.');
    error.status = 401;
    error.code = 'SESSION_ABSOLUTE_EXPIRED';
    throw error;
  }

  const idleExpiresAt = new Date(Math.min(
    now.getTime() + IDLE_DAYS * DAY_MS,
    absoluteExpiresAt.getTime()
  ));
  const refreshToken = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const metadata = requestMetadata(req);

  await db.query(
    `INSERT INTO auth_sessions (
      usuario_id, token_hash, csrf_hash, session_version, session_started_at,
      last_activity_at, idle_expires_at, absolute_expires_at,
      created_ip, user_agent
    ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
    [
      user.id_SB,
      tokenHash(refreshToken),
      tokenHash(csrfToken),
      timestampMarker(user.password_changed_at),
      startedAt,
      idleExpiresAt,
      absoluteExpiresAt,
      metadata.ip,
      metadata.userAgent
    ]
  );

  setRefreshCookie(req, res, refreshToken, absoluteExpiresAt);
  return { absoluteExpiresAt, idleExpiresAt, csrfToken };
}

async function rotateRefreshSession(req, res) {
  const currentToken = readCookie(req);
  if (!currentToken) {
    const error = new Error('No existe una sesión renovable.');
    error.status = 401;
    error.code = 'SESSION_REFRESH_MISSING';
    throw error;
  }

  const currentHash = tokenHash(currentToken);
  const [rows] = await db.query(
    `SELECT id_session, usuario_id, token_hash, csrf_hash, session_version, session_started_at,
            idle_expires_at, absolute_expires_at
     FROM auth_sessions
     WHERE token_hash = ? AND revoked_at IS NULL
     LIMIT 1`,
    [currentHash]
  );
  const session = rows[0];
  const now = new Date();

  if (!session || new Date(session.idle_expires_at) <= now ||
      new Date(session.absolute_expires_at) <= now) {
    clearRefreshCookie(req, res);
    const error = new Error('La sesión expiró por inactividad o alcanzó los 90 días.');
    error.status = 401;
    error.code = 'SESSION_REFRESH_EXPIRED';
    throw error;
  }

  const csrfToken = readCsrfToken(req);
  if (!csrfToken || !matchesHash(csrfToken, session.csrf_hash)) {
    const error = new Error('La validación CSRF de la sesión no es válida.');
    error.status = 403;
    error.code = 'SESSION_CSRF_INVALID';
    throw error;
  }

  const user = await hydrateAuthUser({ id_SB: session.usuario_id });
  if (!user || session.session_version !== timestampMarker(user.password_changed_at)) {
    await db.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id_session = ?', [session.id_session]);
    clearRefreshCookie(req, res);
    const error = new Error('La sesión fue revocada.');
    error.status = 401;
    error.code = 'SESSION_REFRESH_REVOKED';
    throw error;
  }

  const nextToken = crypto.randomBytes(32).toString('base64url');
  const nextIdleExpiresAt = new Date(Math.min(
    now.getTime() + IDLE_DAYS * DAY_MS,
    new Date(session.absolute_expires_at).getTime()
  ));
  const metadata = requestMetadata(req);
  const [result] = await db.query(
    `UPDATE auth_sessions
     SET token_hash = ?, last_activity_at = NOW(), idle_expires_at = ?,
         last_ip = ?, user_agent = ?
     WHERE id_session = ? AND token_hash = ? AND revoked_at IS NULL
       AND idle_expires_at > NOW() AND absolute_expires_at > NOW()`,
    [tokenHash(nextToken), nextIdleExpiresAt, metadata.ip, metadata.userAgent,
      session.id_session, currentHash]
  );

  if (Number(result.affectedRows) !== 1) {
    const error = new Error('La sesión ya fue renovada o revocada.');
    error.status = 401;
    error.code = 'SESSION_REFRESH_REPLAYED';
    throw error;
  }

  setRefreshCookie(req, res, nextToken, session.absolute_expires_at);
  return { user, absoluteExpiresAt: session.absolute_expires_at, csrfToken };
}

async function revokeCurrentSession(req, res) {
  const currentToken = readCookie(req);
  if (currentToken) {
    const csrfToken = readCsrfToken(req);
    const [rows] = await db.query(
      'SELECT id_session, csrf_hash FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1',
      [tokenHash(currentToken)]
    );
    if (!rows.length || !csrfToken || !matchesHash(csrfToken, rows[0].csrf_hash)) {
      const error = new Error('La validación CSRF de la sesión no es válida.');
      error.status = 403;
      error.code = 'SESSION_CSRF_INVALID';
      throw error;
    }
    await db.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id_session = ?', [rows[0].id_session]);
  }
  clearRefreshCookie(req, res);
}

async function revokeUserSessions(userId) {
  await db.query(
    'UPDATE auth_sessions SET revoked_at = NOW() WHERE usuario_id = ? AND revoked_at IS NULL',
    [userId]
  );
}

module.exports = {
  IDLE_DAYS,
  ABSOLUTE_DAYS,
  createRefreshSession,
  rotateRefreshSession,
  revokeCurrentSession,
  revokeUserSessions
};
