const repository = require('./push-notifications.repository');
const { getVapidConfig, validateVapidConfig } = require('./push-notifications.sender');

function actorUser(req) {
  return req.actorUser || req.user || {};
}

function normalizeSubscription(body) {
  const subscription = body && body.subscription ? body.subscription : body || {};
  return {
    endpoint: String(subscription.endpoint || '').trim(),
    p256dh: String(subscription.keys && subscription.keys.p256dh || '').trim(),
    auth: String(subscription.keys && subscription.keys.auth || '').trim(),
    deviceName: String(body && body.device_name || '').trim().slice(0, 150) || null,
    deviceToken: String(body && body.device_token || '').trim().toLowerCase()
  };
}

function assertSubscription(subscription) {
  if (!/^[a-f0-9]{64}$/i.test(subscription.deviceToken || '')) {
    const error = new Error('El token del dispositivo no es valido.');
    error.status = 400;
    throw error;
  }
  if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
    const error = new Error('La suscripcion push esta incompleta.');
    error.status = 400;
    throw error;
  }

  let endpointUrl;
  try {
    endpointUrl = new URL(subscription.endpoint);
  } catch (error) {
    const invalid = new Error('El endpoint push no es valido.');
    invalid.status = 400;
    throw invalid;
  }

  if (endpointUrl.protocol !== 'https:') {
    const error = new Error('El endpoint push debe usar HTTPS.');
    error.status = 400;
    throw error;
  }
}

function getConfig() {
  const config = getVapidConfig();
  const validation = validateVapidConfig(config);
  return {
    enabled: Boolean(validation.ok),
    public_key: validation.ok ? config.publicKey : null,
    reason: validation.ok ? null : validation.reason
  };
}

async function subscribe(req) {
  const user = actorUser(req);
  const subscription = normalizeSubscription(req.body || {});
  assertSubscription(subscription);

  await repository.upsertSubscription({
    userId: user.id_SB,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    userAgent: String(req.get('user-agent') || '').slice(0, 500) || null,
    deviceName: subscription.deviceName,
    deviceToken: subscription.deviceToken
  });

  return { active: true };
}

async function unsubscribe(req) {
  const user = actorUser(req);
  const endpoint = String(req.body && req.body.endpoint || '').trim();
  if (!endpoint) {
    const error = new Error('No se recibio el endpoint de la suscripcion.');
    error.status = 400;
    throw error;
  }

  await repository.deactivateSubscription({ userId: user.id_SB, endpoint });
  return { active: false };
}

async function status(req) {
  const user = actorUser(req);
  const endpoint = String(req.query.endpoint || '').trim();
  if (!endpoint) return { active: false };
  const row = await repository.getSubscriptionStatus({ userId: user.id_SB, endpoint });
  return { active: Boolean(row && Number(row.activo) === 1) };
}

module.exports = {
  getConfig,
  subscribe,
  unsubscribe,
  status
};
