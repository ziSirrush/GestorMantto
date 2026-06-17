const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function audit(usuarioId, eventType, eventDetails, ipAddress) {
  try {
    await db.query(
      `INSERT INTO auth_audit (usuario_id, event_type, event_details, ip_address)
       VALUES (?, ?, ?, ?)`,
      [usuarioId, eventType, eventDetails || null, ipAddress || null]
    );
  } catch (error) {
    console.warn('[AUTH AUDIT]', error.message);
  }
}

async function login(req, res) {
  const { correo, pass } = req.body;
  const ipAddress = req.ip;

  if (!correo || !pass) {
    return res.status(400).json({ ok: false, message: 'Correo y contraseña son obligatorios.' });
  }

  try {
    const [rows] = await db.query(
      `SELECT id_SB, nombre, iniciales, rol_id, correo, pass, estado,
              must_change_password, failed_login_attempts, locked_until
       FROM usuarios
       WHERE correo = ?
       LIMIT 1`,
      [correo]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
    }

    const user = rows[0];

    if (Number(user.estado) !== 1) {
      await audit(user.id_SB, 'LOGIN_FAILED', 'Usuario inactivo', ipAddress);
      return res.status(403).json({ ok: false, message: 'Usuario inactivo.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        ok: false,
        message: 'Usuario bloqueado temporalmente.',
        locked_until: user.locked_until
      });
    }

    const validPassword = await bcrypt.compare(pass, user.pass);

    if (!validPassword) {
      const attempts = Number(user.failed_login_attempts || 0) + 1;

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await db.query(
          `UPDATE usuarios
           SET failed_login_attempts = ?,
               locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
           WHERE id_SB = ?`,
          [attempts, LOCK_MINUTES, user.id_SB]
        );

        await audit(user.id_SB, 'ACCOUNT_LOCKED', 'Bloqueo por intentos fallidos', ipAddress);

        return res.status(423).json({
          ok: false,
          message: 'Usuario bloqueado temporalmente por intentos fallidos.'
        });
      }

      await db.query(
        `UPDATE usuarios SET failed_login_attempts = ? WHERE id_SB = ?`,
        [attempts, user.id_SB]
      );

      await audit(user.id_SB, 'LOGIN_FAILED', 'Contraseña incorrecta', ipAddress);

      return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
    }

    await db.query(
      `UPDATE usuarios
       SET failed_login_attempts = 0,
           locked_until = NULL,
           ultimo_acceso = NOW(),
           last_login_ip = ?
       WHERE id_SB = ?`,
      [ipAddress, user.id_SB]
    );

    await audit(user.id_SB, 'LOGIN_SUCCESS', 'Login correcto', ipAddress);

    const token = jwt.sign(
      {
        id_SB: user.id_SB,
        correo: user.correo,
        rol_id: user.rol_id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({
      ok: true,
      message: 'Login correcto.',
      token,
      must_change_password: Number(user.must_change_password) === 1,
      user: {
        id_SB: user.id_SB,
        nombre: user.nombre,
        iniciales: user.iniciales,
        correo: user.correo,
        rol_id: user.rol_id
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error en login.',
      error: error.message
    });
  }
}

async function firstLoginPassword(req, res) {
  const { user_id, id_SB, correo, new_password, password } = req.body;
  const userId = user_id || id_SB;
  const newPassword = new_password || password;
  const ipAddress = req.ip;

  if (!newPassword) {
    return res.status(400).json({ ok: false, message: 'La nueva contraseña es obligatoria.' });
  }

  if (String(newPassword).length < 10) {
    return res.status(400).json({ ok: false, message: 'La contraseña debe tener mínimo 10 caracteres.' });
  }

  try {
    let rows;

    if (userId) {
      [rows] = await db.query(
        `SELECT id_SB, correo FROM usuarios WHERE id_SB = ? LIMIT 1`,
        [userId]
      );
    } else if (correo) {
      [rows] = await db.query(
        `SELECT id_SB, correo FROM usuarios WHERE correo = ? LIMIT 1`,
        [correo]
      );
    } else {
      return res.status(400).json({ ok: false, message: 'No se recibió usuario.' });
    }

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    const user = rows[0];
    const hash = await bcrypt.hash(newPassword, 10);

    await db.query(
      `UPDATE usuarios
       SET pass = ?,
           must_change_password = 0,
           password_changed_at = NOW(),
           first_login_completed_at = COALESCE(first_login_completed_at, NOW()),
           failed_login_attempts = 0,
           locked_until = NULL
       WHERE id_SB = ?`,
      [hash, user.id_SB]
    );

    await audit(user.id_SB, 'FIRST_PASSWORD_CHANGED', 'Contraseña inicial actualizada', ipAddress);

    return res.json({
      ok: true,
      message: 'Contraseña actualizada correctamente.'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error guardando contraseña.',
      error: error.message
    });
  }
}

async function securityQuestions(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT id_pregunta, pregunta
       FROM preguntas_seguridad
       WHERE estado = 1
       ORDER BY id_pregunta ASC`
    );

    return res.json({
      ok: true,
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando preguntas de seguridad.',
      error: error.message
    });
  }
}

async function firstLoginSecurityQuestion(req, res) {
  const { user_id, id_SB, correo, id_pregunta, question_id, answer, respuesta } = req.body;
  const userId = user_id || id_SB;
  const preguntaId = id_pregunta || question_id;
  const respuestaFinal = answer || respuesta;
  const ipAddress = req.ip;

  if (!preguntaId || !respuestaFinal) {
    return res.status(400).json({
      ok: false,
      message: 'Pregunta y respuesta son obligatorias.'
    });
  }

  try {
    let rows;

    if (userId) {
      [rows] = await db.query(
        `SELECT id_SB FROM usuarios WHERE id_SB = ? LIMIT 1`,
        [userId]
      );
    } else if (correo) {
      [rows] = await db.query(
        `SELECT id_SB FROM usuarios WHERE correo = ? LIMIT 1`,
        [correo]
      );
    } else {
      return res.status(400).json({ ok: false, message: 'No se recibió usuario.' });
    }

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    const user = rows[0];
    const respuestaHash = await bcrypt.hash(String(respuestaFinal).trim().toLowerCase(), 10);

    await db.query(
      `UPDATE usuarios
       SET id_pregunta = ?,
           respuesta_recuperacion = ?
       WHERE id_SB = ?`,
      [preguntaId, respuestaHash, user.id_SB]
    );

    await audit(user.id_SB, 'SECURITY_QUESTION_SET', 'Pregunta de seguridad configurada', ipAddress);

    return res.json({
      ok: true,
      message: 'Pregunta de seguridad guardada correctamente.'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error guardando pregunta de seguridad.',
      error: error.message
    });
  }
}

module.exports = {
  login,
  firstLoginPassword,
  securityQuestions,
  firstLoginSecurityQuestion
};