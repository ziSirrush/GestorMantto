'use strict';

const db = require('../../config/db');

async function findByUserId(userId) {
  const [rows] = await db.query(
    `SELECT
       id_google_oauth,
       usuario_id,
       google_email,
       google_user_id,
       access_token,
       refresh_token,
       token_type,
       scope,
       expiry_date,
       estado,
       connected_at,
       last_refresh_at,
       disconnected_at,
       created_at,
       updated_at
     FROM usuario_google_oauth
     WHERE usuario_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function saveConnection({
  userId,
  googleEmail,
  googleUserId,
  accessToken,
  refreshToken,
  tokenType,
  scope,
  expiryDate
}) {
  await db.query(
    `INSERT INTO usuario_google_oauth (
       usuario_id,
       google_email,
       google_user_id,
       access_token,
       refresh_token,
       token_type,
       scope,
       expiry_date,
       estado,
       connected_at,
       last_refresh_at,
       disconnected_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NULL, NULL)
     ON DUPLICATE KEY UPDATE
       google_email = VALUES(google_email),
       google_user_id = VALUES(google_user_id),
       access_token = VALUES(access_token),
       refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
       token_type = VALUES(token_type),
       scope = VALUES(scope),
       expiry_date = VALUES(expiry_date),
       estado = 1,
       connected_at = NOW(),
       disconnected_at = NULL`,
    [
      userId,
      googleEmail,
      googleUserId,
      accessToken,
      refreshToken,
      tokenType,
      scope,
      expiryDate
    ]
  );

  return findByUserId(userId);
}

async function disconnectByUserId(userId) {
  const [result] = await db.query(
    `UPDATE usuario_google_oauth
     SET access_token = '',
         refresh_token = NULL,
         estado = 0,
         disconnected_at = NOW()
     WHERE usuario_id = ?`,
    [userId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  findByUserId,
  saveConnection,
  disconnectByUserId
};
