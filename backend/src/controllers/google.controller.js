'use strict';

const jwt = require('jsonwebtoken');

const oauthService = require('../services/google/oauth.service');
const cryptoService = require('../services/google/crypto.service');
const googleOAuthRepository = require('../services/google/google-oauth.repository');
const logger = require('../shared/logger');

const STATE_PURPOSE = 'google-oauth-connect';
const STATE_EXPIRES_IN = '10m';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function createState(user) {
  return jwt.sign(
    {
      purpose: STATE_PURPOSE,
      userId: Number(user.id_SB),
      email: normalizeEmail(user.correo)
    },
    process.env.JWT_SECRET,
    { expiresIn: STATE_EXPIRES_IN }
  );
}

function verifyState(state) {
  const payload = jwt.verify(String(state || ''), process.env.JWT_SECRET);

  if (
    payload.purpose !== STATE_PURPOSE ||
    !Number.isInteger(Number(payload.userId)) ||
    !normalizeEmail(payload.email)
  ) {
    const error = new Error('El estado OAuth es inválido.');
    error.status = 400;
    throw error;
  }

  return {
    userId: Number(payload.userId),
    email: normalizeEmail(payload.email)
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sendCallbackPage(res, { ok, message, status = 200 }) {
  const safeMessage = escapeHtml(message);
  const payload = JSON.stringify({
    source: 'mantto-gestor-google-oauth',
    ok: Boolean(ok),
    message: String(message || '')
  }).replace(/</g, '\\u003c');

  return res.status(status).type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Google OAuth | Mantto Gestor</title>
</head>
<body>
  <main>
    <h1>${ok ? 'Google conectado' : 'No fue posible conectar Google'}</h1>
    <p>${safeMessage}</p>
    <p>Ya puedes cerrar esta ventana.</p>
  </main>
  <script>
    (function () {
      var payload = ${payload};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
      window.setTimeout(function () { window.close(); }, 1200);
    }());
  </script>
</body>
</html>`);
}

async function login(req, res, next) {
  try {
    const state = createState(req.user);
    const authorizationUrl = oauthService.generateAuthorizationUrl({
      state,
      loginHint: req.user.correo,
      forceConsent: true
    });

    return res.json({
      ok: true,
      authorization_url: authorizationUrl
    });
  } catch (error) {
    return next(error);
  }
}

async function callback(req, res) {
  try {
    if (req.query.error) {
      const description = req.query.error_description || req.query.error;
      return sendCallbackPage(res, {
        ok: false,
        message: `Google canceló o rechazó la autorización: ${description}`,
        status: 400
      });
    }

    const state = verifyState(req.query.state);
    const { client, tokens } = await oauthService.exchangeCodeForTokens(req.query.code);
    const identity = await oauthService.getGoogleIdentity(client);

    if (!identity.verifiedEmail) {
      return sendCallbackPage(res, {
        ok: false,
        message: 'La cuenta de Google no tiene un correo verificado.',
        status: 403
      });
    }

    if (normalizeEmail(identity.email) !== state.email) {
      logger.warn('Google OAuth rechazado por correo distinto.', {
        userId: state.userId,
        expectedEmail: state.email,
        receivedEmail: identity.email
      });

      return sendCallbackPage(res, {
        ok: false,
        message: 'Debes autorizar con el mismo correo registrado en Mantto Gestor.',
        status: 403
      });
    }

    const normalizedTokens = oauthService.normalizeTokens(tokens);
    const currentConnection = await googleOAuthRepository.findByUserId(state.userId);
    const encryptedRefreshToken = normalizedTokens.refreshToken
      ? cryptoService.encrypt(normalizedTokens.refreshToken)
      : currentConnection && currentConnection.refresh_token
        ? currentConnection.refresh_token
        : null;

    await googleOAuthRepository.saveConnection({
      userId: state.userId,
      googleEmail: identity.email,
      googleUserId: identity.googleUserId,
      accessToken: cryptoService.encrypt(normalizedTokens.accessToken),
      refreshToken: encryptedRefreshToken,
      tokenType: normalizedTokens.tokenType,
      scope: normalizedTokens.scope,
      expiryDate: normalizedTokens.expiryDate
    });

    logger.info('Cuenta Google conectada correctamente.', {
      userId: state.userId,
      googleEmail: identity.email
    });

    return sendCallbackPage(res, {
      ok: true,
      message: `La cuenta ${identity.email} quedó conectada correctamente.`
    });
  } catch (error) {
    logger.error('Error en callback de Google OAuth.', error);

    let status = Number(error.status || 500);
    let message = 'No fue posible completar la conexión con Google.';

    if (error.name === 'TokenExpiredError') {
      status = 400;
      message = 'La solicitud de conexión expiró. Inicia el proceso nuevamente.';
    } else if (error.name === 'JsonWebTokenError') {
      status = 400;
      message = 'La solicitud de conexión no es válida.';
    } else if (error.code === 'ER_DUP_ENTRY') {
      status = 409;
      message = 'Esta cuenta de Google ya está vinculada con otro usuario.';
    } else if (status < 500 && error.message) {
      message = error.message;
    }

    return sendCallbackPage(res, { ok: false, message, status });
  }
}

async function status(req, res, next) {
  try {
    const connection = await googleOAuthRepository.findByUserId(req.user.id_SB);
    const connected = Boolean(connection && Number(connection.estado) === 1);

    return res.json({
      ok: true,
      connected,
      connection: connected
        ? {
            google_email: connection.google_email,
            google_user_id: connection.google_user_id,
            scope: connection.scope,
            expiry_date: connection.expiry_date,
            connected_at: connection.connected_at,
            updated_at: connection.updated_at
          }
        : null
    });
  } catch (error) {
    return next(error);
  }
}

async function disconnect(req, res, next) {
  try {
    const disconnected = await googleOAuthRepository.disconnectByUserId(req.user.id_SB);

    logger.info('Cuenta Google desconectada.', {
      userId: req.user.id_SB,
      existed: disconnected
    });

    return res.json({
      ok: true,
      message: disconnected
        ? 'Cuenta de Google desconectada correctamente.'
        : 'No había una cuenta de Google conectada.'
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  callback,
  status,
  disconnect
};
