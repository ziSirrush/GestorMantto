const db = require('../../config/db');

async function listRequirements() {
  const [rows] = await db.query(`
    SELECT permiso, activo, requerido_login
    FROM sistema_permisos_dispositivo
    WHERE activo = 1
    ORDER BY FIELD(permiso, 'GPS', 'CAMARA', 'MICROFONO', 'PUSH'), permiso
  `);
  return rows;
}

async function getDevice({ userId, deviceToken }) {
  const [rows] = await db.query(`
    SELECT
      id_dispositivo,
      id_usuario,
      device_token,
      nombre_dispositivo,
      user_agent,
      gps_estado,
      camara_estado,
      microfono_estado,
      push_estado,
      activo,
      ultimo_acceso_at,
      permisos_revisados_at,
      created_at,
      updated_at
    FROM usuarios_dispositivos
    WHERE id_usuario = ?
      AND device_token = ?
    LIMIT 1
  `, [userId, deviceToken]);
  return rows[0] || null;
}

async function upsertDevice({
  userId,
  deviceToken,
  deviceName,
  userAgent,
  gpsState = 'PENDIENTE',
  cameraState = 'PENDIENTE',
  microphoneState = 'PENDIENTE',
  pushState = 'PENDIENTE'
}) {
  await db.query(`
    INSERT INTO usuarios_dispositivos (
      id_usuario,
      device_token,
      nombre_dispositivo,
      user_agent,
      gps_estado,
      camara_estado,
      microfono_estado,
      push_estado,
      activo,
      ultimo_acceso_at,
      permisos_revisados_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      nombre_dispositivo = VALUES(nombre_dispositivo),
      user_agent = VALUES(user_agent),
      gps_estado = VALUES(gps_estado),
      camara_estado = VALUES(camara_estado),
      microfono_estado = VALUES(microfono_estado),
      push_estado = VALUES(push_estado),
      activo = 1,
      ultimo_acceso_at = NOW(),
      permisos_revisados_at = NOW(),
      updated_at = NOW()
  `, [
    userId,
    deviceToken,
    deviceName || null,
    userAgent || null,
    gpsState,
    cameraState,
    microphoneState,
    pushState
  ]);

  return getDevice({ userId, deviceToken });
}

module.exports = {
  listRequirements,
  getDevice,
  upsertDevice
};
