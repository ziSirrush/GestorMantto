const db = require('../config/db');

async function roles(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT id_rol, rol, descripcion, estado
       FROM roles
       WHERE estado = 1
       ORDER BY id_rol ASC`
    );
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando roles.', error: error.message });
  }
}

async function zonas(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT id_zona, zona, nombre, estado
       FROM z_op
       WHERE estado = 1
       ORDER BY zona ASC`
    );
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando zonas.', error: error.message });
  }
}

async function preguntasSeguridad(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT id_pregunta, pregunta
       FROM preguntas_seguridad
       WHERE estado = 1
       ORDER BY id_pregunta ASC`
    );
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando preguntas de seguridad.', error: error.message });
  }
}

async function superiores(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT u.id_SB, u.nombre, u.iniciales, u.puesto, u.area, u.correo, r.rol
       FROM usuarios u
       LEFT JOIN roles r ON r.id_rol = u.rol_id
       WHERE u.estado = 1
       ORDER BY r.id_rol ASC, u.nombre ASC`
    );
    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Error consultando superiores.', error: error.message });
  }
}

module.exports = { roles, zonas, preguntasSeguridad, superiores };
