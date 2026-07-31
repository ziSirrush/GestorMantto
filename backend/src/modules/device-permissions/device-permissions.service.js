const repository = require('./device-permissions.repository');

const ALLOWED_STATES = new Set(['PENDIENTE', 'PERMITIDO', 'DENEGADO', 'NO_DISPONIBLE']);
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function actorUser(req) {
  return req.actorUser || req.user || {};
}

function normalizeState(value) {
  const state = String(value || 'PENDIENTE').trim().toUpperCase();
  return ALLOWED_STATES.has(state) ? state : 'PENDIENTE';
}

function normalizeDeviceToken(value) {
  const token = String(value || '').trim();
  if (!TOKEN_PATTERN.test(token)) {
    const error = new Error('El token del dispositivo no es valido.');
    error.status = 400;
    throw error;
  }
  return token.toLowerCase();
}

function normalizeDeviceName(value) {
  return String(value || '').trim().slice(0, 150) || null;
}

function permissionMap(device) {
  return {
    GPS: device ? device.gps_estado : 'PENDIENTE',
    CAMARA: device ? device.camara_estado : 'PENDIENTE',
    MICROFONO: device ? device.microfono_estado : 'PENDIENTE',
    PUSH: device ? device.push_estado : 'PENDIENTE'
  };
}

function calculateAccess(requirements, states) {
  const missing = requirements
    .filter(row => Number(row.requerido_login) === 1)
    .filter(row => states[row.permiso] !== 'PERMITIDO')
    .map(row => ({ permiso: row.permiso, estado: states[row.permiso] || 'PENDIENTE' }));

  return {
    acceso_general: missing.length === 0,
    permisos_faltantes: missing
  };
}

async function status(req) {
  const user = actorUser(req);
  const deviceToken = normalizeDeviceToken(req.query.device_token);
  const [requirements, device] = await Promise.all([
    repository.listRequirements(),
    repository.getDevice({ userId: user.id_SB, deviceToken })
  ]);
  const states = permissionMap(device);
  return {
    device_token: deviceToken,
    dispositivo: device,
    requisitos: requirements,
    permisos: states,
    ...calculateAccess(requirements, states)
  };
}

async function sync(req) {
  const user = actorUser(req);
  const body = req.body || {};
  const deviceToken = normalizeDeviceToken(body.device_token);
  const permissions = body.permisos || {};

  const device = await repository.upsertDevice({
    userId: user.id_SB,
    deviceToken,
    deviceName: normalizeDeviceName(body.device_name),
    userAgent: String(req.get('user-agent') || '').slice(0, 500) || null,
    gpsState: normalizeState(permissions.gps),
    cameraState: normalizeState(permissions.camara),
    microphoneState: normalizeState(permissions.microfono),
    pushState: normalizeState(permissions.push)
  });

  const requirements = await repository.listRequirements();
  const states = permissionMap(device);
  return {
    device_token: deviceToken,
    dispositivo: device,
    requisitos: requirements,
    permisos: states,
    ...calculateAccess(requirements, states)
  };
}

module.exports = { status, sync };
