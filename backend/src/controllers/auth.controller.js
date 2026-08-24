const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { loadUserRoles } = require('../middleware/auth.middleware');
const {
  createRefreshSession,
  rotateRefreshSession,
  revokeCurrentSession,
  revokeUserSessions
} = require('../services/auth-session.service');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MAX_SESSION_SECONDS = 12 * 60 * 60;

function timestampMarker(value) {
  if (!value) return 'never';
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function sessionExpiryTimestamp(absoluteExpiresAt) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessExpiresAt = nowSeconds + MAX_SESSION_SECONDS;
  if (!absoluteExpiresAt) return accessExpiresAt;

  const absoluteSeconds = Math.floor(new Date(absoluteExpiresAt).getTime() / 1000);
  if (!Number.isFinite(absoluteSeconds) || absoluteSeconds <= nowSeconds) {
    const error = new Error('La sesión alcanzó su duración máxima de 90 días.');
    error.status = 401;
    error.code = 'SESSION_ABSOLUTE_EXPIRED';
    throw error;
  }

  return Math.min(accessExpiresAt, absoluteSeconds);
}

function signSessionToken(user, explicitRoles, absoluteExpiresAt) {
  const roles = Array.isArray(explicitRoles)
    ? explicitRoles
    : Array.isArray(user.roles) ? user.roles : [];
  const isProgramador = roles.includes('Programador') || user.rol === 'Programador';
  const expiresAt = sessionExpiryTimestamp(absoluteExpiresAt);
  const absoluteExpiresAtSeconds = absoluteExpiresAt
    ? Math.floor(new Date(absoluteExpiresAt).getTime() / 1000)
    : null;

  return jwt.sign(
    {
      id_SB: user.id_SB,
      correo: user.correo,
      rol_id: user.rol_id,
      rol: user.rol,
      roles,
      empresa: user.empresa,
      is_programador: isProgramador,
      session_version: timestampMarker(user.password_changed_at),
      session_absolute_expires_at: absoluteExpiresAtSeconds,
      exp: expiresAt
    },
    process.env.JWT_SECRET
  );
}

function publicSessionUser(user) {
  return {
    id_SB: user.id_SB,
    nombre: user.nombre,
    iniciales: user.iniciales,
    correo: user.correo,
    empresa: user.empresa,
    puesto: user.puesto,
    area: user.area,
    reporta_a: user.reporta_a,
    rol_id: user.rol_id,
    rol: user.rol,
    role: user.rol,
    roles: user.roles || [],
    roles_detalle: user.roles_detalle || [],
    zonas: user.zonas || [],
    zonas_detalle: user.zonas_detalle || [],
    is_programador: Boolean(user.is_programador),
    criticos_fallas: Number(user.criticos_fallas || 3),
    criticos_periodo: Number(user.criticos_periodo || 35)
  };
}

function validatePasswordRules(password) {
  const value = String(password || '');

  if (value.length < 10) {
    return 'La contraseña debe tener mínimo 10 caracteres.';
  }

  return null;
}

async function audit(usuarioId, eventType, eventDetails, ipAddress) {
  try {
    await db.query(
      `INSERT INTO auth_audit (
        usuario_id,
        event_type,
        event_details,
        ip_address
      )
      VALUES (?, ?, ?, ?)`,
      [
        usuarioId,
        eventType,
        eventDetails || null,
        ipAddress || null
      ]
    );
  } catch (error) {
    console.warn('[AUTH AUDIT]', error.message);
  }
}

async function login(req, res) {
  const { correo, pass } = req.body;
  const ipAddress = req.ip;

  if (!correo || !pass) {
    return res.status(400).json({
      ok: false,
      message: 'Correo y contraseña son obligatorios.'
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT
        u.id_SB,
        u.nombre,
        u.iniciales,
        u.empresa,
        u.rol_id,
        r.rol,
        u.correo,
        u.pass,
        u.estado,
        u.must_change_password,
        u.failed_login_attempts,
        u.locked_until,
        u.password_changed_at,
        u.criticos_fallas,
        u.criticos_periodo
      FROM usuarios u
      LEFT JOIN roles r
        ON r.id_rol = u.rol_id
      WHERE u.correo = ?
      LIMIT 1`,
      [correo]
    );

    if (!rows.length) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas.'
      });
    }

    const user = rows[0];

    if (Number(user.estado) !== 1) {
      await audit(
        user.id_SB,
        'LOGIN_FAILED',
        'Usuario inactivo',
        ipAddress
      );

      return res.status(403).json({
        ok: false,
        message: 'Usuario inactivo.'
      });
    }

    if (
      user.locked_until &&
      new Date(user.locked_until) > new Date()
    ) {
      return res.status(423).json({
        ok: false,
        message: 'Usuario bloqueado temporalmente.',
        locked_until: user.locked_until
      });
    }

    const validPassword = await bcrypt.compare(
      pass,
      user.pass
    );

    if (!validPassword) {
      const attempts =
        Number(user.failed_login_attempts || 0) + 1;

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await db.query(
          `UPDATE usuarios
          SET failed_login_attempts = ?,
              locked_until = DATE_ADD(
                NOW(),
                INTERVAL ? MINUTE
              )
          WHERE id_SB = ?`,
          [
            attempts,
            LOCK_MINUTES,
            user.id_SB
          ]
        );

        await audit(
          user.id_SB,
          'ACCOUNT_LOCKED',
          'Bloqueo por intentos fallidos',
          ipAddress
        );

        return res.status(423).json({
          ok: false,
          message:
            'Usuario bloqueado temporalmente por intentos fallidos.'
        });
      }

      await db.query(
        `UPDATE usuarios
        SET failed_login_attempts = ?
        WHERE id_SB = ?`,
        [
          attempts,
          user.id_SB
        ]
      );

      await audit(
        user.id_SB,
        'LOGIN_FAILED',
        'Contraseña incorrecta',
        ipAddress
      );

      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas.'
      });
    }

    await db.query(
      `UPDATE usuarios
      SET failed_login_attempts = 0,
          locked_until = NULL,
          ultimo_acceso = NOW(),
          last_login_ip = ?
      WHERE id_SB = ?`,
      [
        ipAddress,
        user.id_SB
      ]
    );

    await audit(
      user.id_SB,
      'LOGIN_SUCCESS',
      'Login correcto',
      ipAddress
    );

    const rolesDetalle = await loadUserRoles(user.id_SB);

    const roles = rolesDetalle
      .map(row => row.rol)
      .filter(Boolean);

    const isProgramador =
      roles.includes('Programador') ||
      user.rol === 'Programador';

    const refreshState = await createRefreshSession(req, res, user);
    const token = signSessionToken(user, roles, refreshState.absoluteExpiresAt);

    return res.json({
      ok: true,
      message: 'Login correcto.',
      token,
      session_csrf_token: refreshState.csrfToken,
      session_absolute_expires_at: new Date(refreshState.absoluteExpiresAt).toISOString(),
      must_change_password:
        Number(user.must_change_password) === 1,
      user: {
        id_SB: user.id_SB,
        nombre: user.nombre,
        iniciales: user.iniciales,
        correo: user.correo,
        empresa: user.empresa,
        rol_id: user.rol_id,
        rol: user.rol,
        role: user.rol,
        roles,
        roles_detalle: rolesDetalle,
        is_programador: isProgramador,
        criticos_fallas: Number(user.criticos_fallas || 3),
        criticos_periodo: Number(user.criticos_periodo || 35)
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

async function refreshSession(req, res) {
  try {
    const { user, absoluteExpiresAt, csrfToken } = await rotateRefreshSession(req, res);
    const token = signSessionToken(user, user.roles, absoluteExpiresAt);

    return res.json({
      ok: true,
      token,
      session_csrf_token: csrfToken,
      user: publicSessionUser(user),
      session_absolute_expires_at: new Date(absoluteExpiresAt).toISOString()
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      code: error.code || 'SESSION_REFRESH_FAILED',
      message: error.message || 'No fue posible renovar la sesión.'
    });
  }
}

async function logout(req, res) {
  try {
    await revokeCurrentSession(req, res);
    return res.json({ ok: true, message: 'Sesión cerrada correctamente.' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible cerrar la sesión.',
      error: error.message
    });
  }
}

async function firstLoginPassword(req, res) {
  const {
    new_password,
    password
  } = req.body;

  const userId = Number(req.user && req.user.id_SB);
  const newPassword = new_password || password;
  const ipAddress = req.ip;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      ok: false,
      message: 'Sesión requerida.'
    });
  }

  if (!newPassword) {
    return res.status(400).json({
      ok: false,
      message:
        'La nueva contraseña es obligatoria.'
    });
  }

  const passwordError =
    validatePasswordRules(newPassword);

  if (passwordError) {
    return res.status(400).json({
      ok: false,
      message: passwordError
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT id_SB, correo, estado, must_change_password
      FROM usuarios
      WHERE id_SB = ?
      LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const user = rows[0];

    if (Number(user.estado) !== 1 || Number(user.must_change_password) !== 1) {
      return res.status(409).json({
        ok: false,
        message: 'El primer acceso ya fue completado o no está disponible para esta cuenta.'
      });
    }

    const hash = await bcrypt.hash(
      newPassword,
      10
    );

    const [result] = await db.query(
      `UPDATE usuarios
      SET pass = ?,
          must_change_password = 0,
          password_changed_at = NOW(),
          first_login_completed_at =
            COALESCE(
              first_login_completed_at,
              NOW()
            ),
          failed_login_attempts = 0,
          locked_until = NULL
      WHERE id_SB = ?
        AND must_change_password = 1`,
      [
        hash,
        user.id_SB
      ]
    );

    if (Number(result.affectedRows) !== 1) {
      return res.status(409).json({
        ok: false,
        message: 'El primer acceso ya fue completado.'
      });
    }

    const [[sessionState]] = await db.query(
      `SELECT password_changed_at
      FROM usuarios
      WHERE id_SB = ?
      LIMIT 1`,
      [user.id_SB]
    );
    const refreshedUser = {
      ...req.user,
      password_changed_at: sessionState && sessionState.password_changed_at
    };
    await revokeUserSessions(user.id_SB);
    const refreshState = await createRefreshSession(req, res, refreshedUser);
    const token = signSessionToken(refreshedUser, undefined, refreshState.absoluteExpiresAt);

    await audit(
      user.id_SB,
      'FIRST_PASSWORD_CHANGED',
      'Contraseña inicial actualizada',
      ipAddress
    );

    return res.json({
      ok: true,
      token,
      session_csrf_token: refreshState.csrfToken,
      session_absolute_expires_at: new Date(refreshState.absoluteExpiresAt).toISOString(),
      message:
        'Contraseña actualizada correctamente.'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        'Error guardando contraseña.',
      error: error.message
    });
  }
}

async function securityQuestions(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT
        id_pregunta,
        pregunta
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
      message:
        'Error consultando preguntas de seguridad.',
      error: error.message
    });
  }
}

async function firstLoginSecurityQuestion(req, res) {
  const {
    id_pregunta,
    question_id,
    answer,
    respuesta
  } = req.body;

  const userId = Number(req.user && req.user.id_SB);
  const preguntaId = Number(id_pregunta || question_id);
  const respuestaFinal =
    answer || respuesta;
  const ipAddress = req.ip;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      ok: false,
      message: 'Sesión requerida.'
    });
  }

  if (!Number.isInteger(preguntaId) || preguntaId <= 0 || !String(respuestaFinal || '').trim()) {
    return res.status(400).json({
      ok: false,
      message:
        'Pregunta y respuesta son obligatorias.'
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT id_SB, estado, must_change_password
      FROM usuarios
      WHERE id_SB = ?
      LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const user = rows[0];

    if (Number(user.estado) !== 1 || Number(user.must_change_password) !== 1) {
      return res.status(409).json({
        ok: false,
        message: 'El primer acceso ya fue completado o no está disponible para esta cuenta.'
      });
    }

    const [questions] = await db.query(
      `SELECT id_pregunta
      FROM preguntas_seguridad
      WHERE id_pregunta = ?
        AND estado = 1
      LIMIT 1`,
      [preguntaId]
    );

    if (!questions.length) {
      return res.status(400).json({
        ok: false,
        message: 'La pregunta de seguridad no es válida.'
      });
    }

    const respuestaHash = await bcrypt.hash(
      String(respuestaFinal)
        .trim()
        .toLowerCase(),
      10
    );

    const [result] = await db.query(
      `UPDATE usuarios
      SET id_pregunta = ?,
          respuesta_recuperacion = ?
      WHERE id_SB = ?
        AND must_change_password = 1`,
      [
        preguntaId,
        respuestaHash,
        user.id_SB
      ]
    );

    if (Number(result.affectedRows) !== 1) {
      return res.status(409).json({
        ok: false,
        message: 'El primer acceso ya fue completado.'
      });
    }

    await audit(
      user.id_SB,
      'SECURITY_QUESTION_SET',
      'Pregunta de seguridad configurada',
      ipAddress
    );

    return res.json({
      ok: true,
      message:
        'Pregunta de seguridad guardada correctamente.'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        'Error guardando pregunta de seguridad.',
      error: error.message
    });
  }
}

async function recoveryStart(req, res) {
  const { correo } = req.body;

  if (!correo) {
    return res.status(400).json({
      ok: false,
      message:
        'El correo es obligatorio.'
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT
        u.id_SB,
        u.correo,
        u.id_pregunta,
        u.respuesta_recuperacion,
        u.password_changed_at,
        u.locked_until,
        ps.pregunta
      FROM usuarios u
      LEFT JOIN preguntas_seguridad ps
        ON ps.id_pregunta = u.id_pregunta
      WHERE u.correo = ?
        AND u.estado = 1
      LIMIT 1`,
      [correo]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message:
          'No se encontró un usuario activo con ese correo.'
      });
    }

    const user = rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        ok: false,
        message: 'La cuenta está bloqueada temporalmente. Intenta más tarde.'
      });
    }

    if (
      !user.id_pregunta ||
      !user.respuesta_recuperacion ||
      Number(user.id_pregunta) === 11
    ) {
      return res.status(400).json({
        ok: false,
        message:
          'Este usuario no tiene pregunta de recuperación configurada.'
      });
    }

    const recoveryToken = jwt.sign(
      {
        type: 'password_recovery',
        user_id: Number(user.id_SB),
        correo: String(user.correo).trim().toLowerCase(),
        password_changed_at: timestampMarker(user.password_changed_at)
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m', audience: 'mantto-password-recovery' }
    );

    return res.json({
      ok: true,
      id_pregunta: user.id_pregunta,
      pregunta: user.pregunta,
      recovery_token: recoveryToken,
      expires_in_seconds: 600
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        'Error iniciando recuperación.',
      error: error.message
    });
  }
}

async function recoveryReset(req, res) {
  const {
    correo,
    respuesta,
    answer,
    new_password,
    password,
    recovery_token,
    recoveryToken
  } = req.body;

  const finalAnswer =
    respuesta || answer;
  const newPassword =
    new_password || password;
  const challengeToken = recovery_token || recoveryToken;
  const ipAddress = req.ip;

  if (
    !correo ||
    !finalAnswer ||
    !newPassword ||
    !challengeToken
  ) {
    return res.status(400).json({
      ok: false,
      message:
        'Correo, desafío de recuperación, respuesta y nueva contraseña son obligatorios.'
    });
  }

  const passwordError =
    validatePasswordRules(newPassword);

  if (passwordError) {
    return res.status(400).json({
      ok: false,
      message: passwordError
    });
  }

  try {
    let challenge;
    try {
      challenge = jwt.verify(String(challengeToken), process.env.JWT_SECRET, {
        audience: 'mantto-password-recovery'
      });
    } catch (_error) {
      return res.status(401).json({
        ok: false,
        message: 'El desafío de recuperación expiró o no es válido.'
      });
    }

    const normalizedEmail = String(correo).trim().toLowerCase();
    if (
      challenge?.type !== 'password_recovery' ||
      String(challenge.correo || '').trim().toLowerCase() !== normalizedEmail
    ) {
      return res.status(401).json({
        ok: false,
        message: 'El desafío de recuperación no corresponde a esta cuenta.'
      });
    }

    const [rows] = await db.query(
      `SELECT
        id_SB,
        respuesta_recuperacion,
        password_changed_at,
        failed_login_attempts,
        locked_until
      FROM usuarios
      WHERE correo = ?
        AND estado = 1
      LIMIT 1`,
      [correo]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const user = rows[0];

    if (Number(challenge.user_id) !== Number(user.id_SB) ||
        String(challenge.password_changed_at) !== timestampMarker(user.password_changed_at)) {
      return res.status(401).json({
        ok: false,
        message: 'El desafío de recuperación ya no es válido.'
      });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        ok: false,
        message: 'La cuenta está bloqueada temporalmente. Intenta más tarde.'
      });
    }

    if (!user.respuesta_recuperacion) {
      return res.status(400).json({
        ok: false,
        message:
          'No hay respuesta de recuperación configurada.'
      });
    }

    const validAnswer = await bcrypt.compare(
      String(finalAnswer)
        .trim()
        .toLowerCase(),
      user.respuesta_recuperacion
    );

    if (!validAnswer) {
      const attempts = Number(user.failed_login_attempts || 0) + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await db.query(
          `UPDATE usuarios
          SET failed_login_attempts = ?,
              locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
          WHERE id_SB = ?`,
          [attempts, LOCK_MINUTES, user.id_SB]
        );
      } else {
        await db.query(
          `UPDATE usuarios
          SET failed_login_attempts = ?
          WHERE id_SB = ?`,
          [attempts, user.id_SB]
        );
      }

      await audit(
        user.id_SB,
        'RECOVERY_FAILED',
        'Respuesta de seguridad incorrecta',
        ipAddress
      );

      return res.status(attempts >= MAX_FAILED_ATTEMPTS ? 423 : 401).json({
        ok: false,
        message: attempts >= MAX_FAILED_ATTEMPTS
          ? 'Cuenta bloqueada temporalmente por intentos fallidos.'
          : 'Respuesta incorrecta.'
      });
    }

    const hash = await bcrypt.hash(
      newPassword,
      10
    );

    await db.query(
      `UPDATE usuarios
      SET pass = ?,
          must_change_password = 0,
          password_changed_at = NOW(),
          failed_login_attempts = 0,
          locked_until = NULL
      WHERE id_SB = ?`,
      [
        hash,
        user.id_SB
      ]
    );

    await revokeUserSessions(user.id_SB);

    await audit(
      user.id_SB,
      'PASSWORD_RECOVERY_RESET',
      'Contraseña actualizada por recuperación',
      ipAddress
    );

    return res.json({
      ok: true,
      message:
        'Contraseña actualizada correctamente.'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        'Error actualizando contraseña.',
      error: error.message
    });
  }
}

async function me(req, res) {
  const authUser = req.user;

  try {
    const [rows] = await db.query(
      `SELECT
        u.id_SB,
        u.nombre,
        u.iniciales,
        u.puesto,
        u.area,
        u.empresa,
        u.rol_id,
        r.rol,
        r.descripcion AS rol_descripcion,
        u.correo,
        u.reporta_a,
        jefe.nombre AS reporta_a_nombre,
        u.estado,
        u.id_pregunta,
        ps.pregunta AS pregunta_seguridad,
        u.ultimo_acceso,
        u.password_changed_at,
        u.first_login_completed_at,
        u.two_factor_enabled,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id_rol', rr.id_rol,
              'rol', rr.rol,
              'principal', ur.principal,
              'activo', ur.activo
            )
          )
          FROM usuario_roles ur
          INNER JOIN roles rr
            ON rr.id_rol = ur.id_rol
          WHERE ur.id_usuario = u.id_SB
            AND ur.activo = 1
            AND rr.estado = 1
        ), JSON_ARRAY()) AS roles_detalle,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id_zona', z.id_zona,
              'zona', z.zona,
              'nombre', z.nombre
            )
          )
          FROM usuario_zop uz
          INNER JOIN z_op z
            ON z.id_zona = uz.zona_id
          WHERE uz.usuario_id = u.id_SB
            AND uz.estado = 1
            AND z.estado = 1
        ), JSON_ARRAY()) AS zonas_detalle
      FROM usuarios u
      LEFT JOIN roles r
        ON r.id_rol = u.rol_id
      LEFT JOIN usuarios jefe
        ON jefe.id_SB = u.reporta_a
      LEFT JOIN preguntas_seguridad ps
        ON ps.id_pregunta = u.id_pregunta
      WHERE u.id_SB = ?
      LIMIT 1`,
      [authUser.id_SB]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const profile = {
      ...rows[0],
      role: rows[0].rol,
      roles: Array.isArray(authUser.roles)
        ? authUser.roles
        : [],
      roles_detalle:
        authUser.roles_detalle ||
        rows[0].roles_detalle ||
        [],
      is_programador: Boolean(
        authUser.is_programador ||
        rows[0].rol === 'Programador' ||
        (
          Array.isArray(authUser.roles) &&
          authUser.roles.includes('Programador')
        )
      )
    };

    return res.json({
      ok: true,
      source: 'aiven',
      data: profile,
      user: profile
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        'Error consultando perfil.',
      error: error.message
    });
  }
}

async function changePassword(req, res) {
  const {
    current_password,
    currentPassword,
    new_password,
    newPassword,
    confirm_password,
    confirmPassword
  } = req.body;

  const current =
    current_password || currentPassword;
  const next =
    new_password || newPassword;
  const confirm =
    confirm_password || confirmPassword;
  const ipAddress = req.ip;

  if (!current || !next || !confirm) {
    return res.status(400).json({
      ok: false,
      message:
        'Contraseña actual, nueva y confirmación son obligatorias.'
    });
  }

  if (next !== confirm) {
    return res.status(400).json({
      ok: false,
      message:
        'La contraseña nueva y su confirmación no coinciden.'
    });
  }

  const passwordError =
    validatePasswordRules(next);

  if (passwordError) {
    return res.status(400).json({
      ok: false,
      message: passwordError
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT
        id_SB,
        pass
      FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
      [req.user.id_SB]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const validCurrent =
      await bcrypt.compare(
        current,
        rows[0].pass
      );

    if (!validCurrent) {
      await audit(
        req.user.id_SB,
        'PROFILE_PASSWORD_CHANGE_FAILED',
        'Contraseña actual incorrecta',
        ipAddress
      );

      return res.status(401).json({
        ok: false,
        message:
          'Los datos actuales no coinciden. Contacta a soporte.'
      });
    }

    const hash = await bcrypt.hash(
      next,
      10
    );

    await db.query(
      `UPDATE usuarios
      SET pass = ?,
          must_change_password = 0,
          password_changed_at = NOW(),
          failed_login_attempts = 0,
          locked_until = NULL
      WHERE id_SB = ?`,
      [
        hash,
        req.user.id_SB
      ]
    );

    await audit(
      req.user.id_SB,
      'PROFILE_PASSWORD_CHANGED',
      'Contraseña actualizada desde Mi Perfil',
      ipAddress
    );

    const [[sessionState]] = await db.query(
      `SELECT password_changed_at
      FROM usuarios
      WHERE id_SB = ?
      LIMIT 1`,
      [req.user.id_SB]
    );
    const refreshedUser = {
      ...req.user,
      password_changed_at: sessionState && sessionState.password_changed_at
    };
    await revokeUserSessions(req.user.id_SB);
    const refreshState = await createRefreshSession(req, res, refreshedUser);
    const token = signSessionToken(refreshedUser, undefined, refreshState.absoluteExpiresAt);

    return res.json({
      ok: true,
      token,
      session_csrf_token: refreshState.csrfToken,
      session_absolute_expires_at: new Date(refreshState.absoluteExpiresAt).toISOString(),
      message:
        'Contraseña actualizada correctamente.'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        'Error actualizando contraseña.',
      error: error.message
    });
  }
}

async function changeSecurityQuestion(req, res) {
  const {
    current_password,
    currentPassword,
    current_answer,
    currentAnswer,
    id_pregunta,
    question_id,
    new_answer,
    newAnswer
  } = req.body;

  const currentPass =
    current_password || currentPassword;

  const currentAnswerValue =
    current_answer || currentAnswer;

  const preguntaId =
    id_pregunta || question_id;

  const newAnswerValue =
    new_answer || newAnswer;

  const ipAddress = req.ip;

  if (
    !currentPass ||
    !currentAnswerValue ||
    !preguntaId ||
    !newAnswerValue
  ) {
    return res.status(400).json({
      ok: false,
      message:
        'Contraseña actual, respuesta actual, nueva pregunta y nueva respuesta son obligatorias.'
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT
        id_SB,
        pass,
        respuesta_recuperacion
      FROM usuarios
      WHERE id_SB = ?
        AND estado = 1
      LIMIT 1`,
      [req.user.id_SB]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.'
      });
    }

    const user = rows[0];

    if (!user.respuesta_recuperacion) {
      return res.status(400).json({
        ok: false,
        message:
          'No hay respuesta actual configurada. Contacta a soporte.'
      });
    }

    const validPass = await bcrypt.compare(
      currentPass,
      user.pass
    );

    const validAnswer = await bcrypt.compare(
      String(currentAnswerValue)
        .trim()
        .toLowerCase(),
      user.respuesta_recuperacion
    );

    if (!validPass || !validAnswer) {
      await audit(
        req.user.id_SB,
        'PROFILE_SECURITY_QUESTION_CHANGE_FAILED',
        'Datos actuales incorrectos',
        ipAddress
      );

      return res.status(401).json({
        ok: false,
        message:
          'Los datos actuales no coinciden. Contacta a soporte.'
      });
    }

    const newAnswerHash = await bcrypt.hash(
      String(newAnswerValue)
        .trim()
        .toLowerCase(),
      10
    );

    await db.query(
      `UPDATE usuarios
      SET id_pregunta = ?,
          respuesta_recuperacion = ?
      WHERE id_SB = ?`,
      [
        preguntaId,
        newAnswerHash,
        req.user.id_SB
      ]
    );

    await audit(
      req.user.id_SB,
      'PROFILE_SECURITY_QUESTION_CHANGED',
      'Pregunta de seguridad actualizada desde Mi Perfil',
      ipAddress
    );

    return res.json({
      ok: true,
      message:
        'Pregunta de seguridad actualizada correctamente.'
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        'Error actualizando pregunta de seguridad.',
      error: error.message
    });
  }
}

module.exports = {
  login,
  refreshSession,
  logout,
  me,
  changePassword,
  changeSecurityQuestion,
  firstLoginPassword,
  securityQuestions,
  firstLoginSecurityQuestion,
  recoveryStart,
  recoveryReset
};
