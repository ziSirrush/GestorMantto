const db = require('../config/db');

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function listRelaciones(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        ura.id_rel_admin,
        ura.id_asesor,
        asesor.nombre AS asesor_nombre,
        asesor.iniciales AS asesor_iniciales,
        ura.id_admin,
        admin.nombre AS admin_nombre,
        admin.iniciales AS admin_iniciales,
        ura.created_at,
        ura.updated_at
      FROM usuarios_rel_admin ura
      INNER JOIN usuarios asesor ON asesor.id_SB = ura.id_asesor
      INNER JOIN usuarios admin ON admin.id_SB = ura.id_admin
      ORDER BY asesor.nombre ASC, admin.nombre ASC
    `);

    return res.json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando relaciones asesor-administrador.',
      error: error.message
    });
  }
}

async function createRelacion(req, res) {
  const idAsesor = validId(req.body?.id_asesor);
  const idAdmin = validId(req.body?.id_admin);

  if (!idAsesor || !idAdmin) {
    return res.status(400).json({
      ok: false,
      message: 'id_asesor e id_admin son obligatorios y deben ser IDs válidos.'
    });
  }

  if (idAsesor === idAdmin) {
    return res.status(400).json({
      ok: false,
      message: 'Un usuario no puede relacionarse consigo mismo como administrador.'
    });
  }

  try {
    const [users] = await db.query(
      'SELECT id_SB FROM usuarios WHERE id_SB IN (?, ?)',
      [idAsesor, idAdmin]
    );

    if (users.length !== 2) {
      return res.status(400).json({
        ok: false,
        message: 'El asesor o el administrador no existe en usuarios.'
      });
    }

    const [result] = await db.query(
      `INSERT INTO usuarios_rel_admin (id_asesor, id_admin)
       VALUES (?, ?)`,
      [idAsesor, idAdmin]
    );

    return res.status(201).json({
      ok: true,
      message: 'Relación creada correctamente.',
      data: {
        id_rel_admin: result.insertId,
        id_asesor: idAsesor,
        id_admin: idAdmin
      }
    });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({
      ok: false,
      message: error.code === 'ER_DUP_ENTRY'
        ? 'La relación asesor-administrador ya existe.'
        : 'Error creando la relación asesor-administrador.',
      error: error.message
    });
  }
}

async function deleteRelacion(req, res) {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'ID inválido.' });

  try {
    const [result] = await db.query(
      'DELETE FROM usuarios_rel_admin WHERE id_rel_admin = ?',
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, message: 'Relación no encontrada.' });
    }

    return res.json({ ok: true, message: 'Relación eliminada correctamente.' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error eliminando la relación asesor-administrador.',
      error: error.message
    });
  }
}

module.exports = {
  listRelaciones,
  createRelacion,
  deleteRelacion
};
