'use strict';

const { google } = require('googleapis');

const DEFAULT_SCOPES = Object.freeze([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly'
]);

function getRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    const error = new Error(`Falta la variable de entorno obligatoria: ${name}`);
    error.code = 'GOOGLE_OAUTH_CONFIG_ERROR';
    throw error;
  }

  return value;
}

function getOAuthScopes() {
  const configured = String(process.env.GOOGLE_OAUTH_SCOPES || '').trim();

  if (!configured) {
    return [...DEFAULT_SCOPES];
  }

  const scopes = configured
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return [...new Set(scopes)];
}

function getOAuthConfig() {
  return {
    clientId: getRequiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: getRequiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    redirectUri: getRequiredEnv('GOOGLE_OAUTH_REDIRECT_URI'),
    scopes: getOAuthScopes()
  };
}

function createOAuthClient(credentials = null) {
  const config = getOAuthConfig();
  const client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  if (credentials && typeof credentials === 'object') {
    client.setCredentials(credentials);
  }

  return client;
}

function generateAuthorizationUrl(options = {}) {
  const state = String(options.state || '').trim();

  if (!state) {
    const error = new Error('El parámetro OAuth state es obligatorio.');
    error.code = 'GOOGLE_OAUTH_STATE_REQUIRED';
    throw error;
  }

  const config = getOAuthConfig();
  const params = {
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: options.forceConsent === false ? 'select_account' : 'consent',
    scope: config.scopes,
    state
  };

  const loginHint = String(options.loginHint || '').trim();
  if (loginHint) {
    params.login_hint = loginHint;
  }

  return createOAuthClient().generateAuthUrl(params);
}

async function exchangeCodeForTokens(code) {
  const authorizationCode = String(code || '').trim();

  if (!authorizationCode) {
    const error = new Error('El código de autorización de Google es obligatorio.');
    error.code = 'GOOGLE_OAUTH_CODE_REQUIRED';
    throw error;
  }

  const client = createOAuthClient();
  const response = await client.getToken(authorizationCode);
  const tokens = response && response.tokens ? response.tokens : null;

  if (!tokens || !tokens.access_token) {
    const error = new Error('Google no devolvió un access token válido.');
    error.code = 'GOOGLE_OAUTH_TOKEN_MISSING';
    throw error;
  }

  client.setCredentials(tokens);

  return {
    client,
    tokens
  };
}

async function getGoogleIdentity(credentialsOrClient) {
  const client =
    credentialsOrClient && typeof credentialsOrClient.getAccessToken === 'function'
      ? credentialsOrClient
      : createOAuthClient(credentialsOrClient);

  const oauth2 = google.oauth2({
    version: 'v2',
    auth: client
  });

  const response = await oauth2.userinfo.get();
  const data = response && response.data ? response.data : {};

  const identity = {
    googleUserId: data.id ? String(data.id) : null,
    email: data.email ? String(data.email).trim().toLowerCase() : null,
    verifiedEmail: Boolean(data.verified_email),
    name: data.name ? String(data.name) : null,
    picture: data.picture ? String(data.picture) : null
  };

  if (!identity.googleUserId || !identity.email) {
    const error = new Error('Google no devolvió una identidad completa del usuario.');
    error.code = 'GOOGLE_OAUTH_IDENTITY_INCOMPLETE';
    throw error;
  }

  return identity;
}

function normalizeTokens(tokens = {}) {
  return {
    accessToken: tokens.access_token || null,
    refreshToken: tokens.refresh_token || null,
    tokenType: tokens.token_type || null,
    scope: tokens.scope || null,
    expiryDate: Number.isFinite(Number(tokens.expiry_date))
      ? Number(tokens.expiry_date)
      : null,
    idToken: tokens.id_token || null
  };
}

module.exports = {
  DEFAULT_SCOPES,
  getOAuthScopes,
  getOAuthConfig,
  createOAuthClient,
  generateAuthorizationUrl,
  exchangeCodeForTokens,
  getGoogleIdentity,
  normalizeTokens
};
