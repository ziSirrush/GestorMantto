'use strict';
// BLT NOW: servicio usado por Usuarios. Sin CLI ni exportacion CSV de claves.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/db');

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generarPassword() {
  let body = '';
  for (let index = 0; index < 12; index += 1) {
    body += PASSWORD_ALPHABET[crypto.randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return `Mg!${body}9`;
}

async function resetUserPasswordById(userId, options = {}) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    const error = new Error('ID de usuario inválido.');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  const updatedBy = String(options.updatedBy || 'reset_individual_script').slice(0, 255);
  const actorId = Number(options.actorId || 0);
  const ipAddress = options.ipAddress ? String(options.ipAddress).slice(0, 64) : null;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [usuarios] = await conn.query(
      `SELECT id_SB, nombre, correo
       FROM usuarios
       WHERE id_SB = ?
       LIMIT 1
       FOR UPDATE`,
      [normalizedUserId]
    );

    if (!usuarios.length) {
      const error = new Error(`No se encontró el usuario con id_SB = ${normalizedUserId}`);
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    const usuario = usuarios[0];
    const passwordTemporal = generarPassword();
    const hash = await bcrypt.hash(passwordTemporal, 10);

    const [updateResult] = await conn.query(
      `UPDATE usuarios
       SET pass = ?,
           must_change_password = 1,
           first_login_completed_at = NULL,
           failed_login_attempts = 0,
           locked_until = NULL,
           respuesta_recuperacion = NULL,
           password_changed_at = NOW(),
           updated_at = NOW(),
           updated_by = ?
       WHERE id_SB = ?`,
      [hash, updatedBy, usuario.id_SB]
    );

    if (Number(updateResult.affectedRows) !== 1) {
      const error = new Error('No fue posible actualizar exactamente un usuario.');
      error.code = 'RESET_UPDATE_FAILED';
      throw error;
    }

    const [[storedCredential]] = await conn.query(
      `SELECT pass, must_change_password, password_changed_at
       FROM usuarios
       WHERE id_SB = ?
       LIMIT 1`,
      [usuario.id_SB]
    );

    const credentialVerified = Boolean(storedCredential) &&
      Number(storedCredential.must_change_password) === 1 &&
      Boolean(storedCredential.password_changed_at) &&
      await bcrypt.compare(passwordTemporal, storedCredential.pass);

    if (!credentialVerified) {
      const error = new Error('La contraseña temporal generada no coincide con el hash guardado.');
      error.code = 'RESET_VERIFICATION_FAILED';
      throw error;
    }

    const [sessionResult] = await conn.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW()
       WHERE usuario_id = ?
         AND revoked_at IS NULL`,
      [usuario.id_SB]
    );

    if (Number.isInteger(actorId) && actorId > 0) {
      await conn.query(
        `INSERT INTO auth_audit (usuario_id, event_type, event_details, ip_address)
         VALUES (?, ?, ?, ?)`,
        [
          actorId,
          'ADMIN_USER_CREDENTIALS_RESET',
          JSON.stringify({
            target_user_id: usuario.id_SB,
            target_email: usuario.correo,
            preserved_operational_data: true,
            credential_hash_verified: true,
            sessions_revoked: Number(sessionResult.affectedRows || 0)
          }),
          ipAddress
        ]
      );
    }

    await conn.commit();

    return {
      usuario,
      passwordTemporal,
      credentialVerified: true,
      sessionsRevoked: Number(sessionResult.affectedRows || 0)
    };
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { generarPassword, resetUserPasswordById };
