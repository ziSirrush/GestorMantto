const db = require('../../config/db');

async function findEstadosVisuales(codigos = []) {
  const clauses = ['activo = 1'];
  const params = [];

  if (codigos.length) {
    clauses.push(`UPPER(codigo) IN (${codigos.map(() => '?').join(', ')})`);
    params.push(...codigos);
  }

  const [rows] = await db.query(`
    SELECT
      id_estado_visual,
      codigo,
      nombre,
      descripcion,
      categoria,
      emoji,
      icono,
      color_texto,
      color_fondo,
      color_borde,
      prioridad,
      activo
    FROM estados_visuales
    WHERE ${clauses.join(' AND ')}
    ORDER BY prioridad ASC, nombre ASC
  `, params);

  return rows;
}

async function findPermisos() {
  const [rows] = await db.query(`
    SELECT
      p.*,
      r.rol
    FROM permisos p
    LEFT JOIN roles r
      ON r.id_rol = p.rol_id
    ORDER BY p.rol_id ASC
  `);

  return rows;
}

async function findRoles() {
  const [rows] = await db.query(`
    SELECT *
    FROM roles
    WHERE estado = 1
    ORDER BY id_rol ASC
  `);

  return rows;
}

async function findZonas() {
  const [rows] = await db.query(`
    SELECT *
    FROM z_op
    WHERE estado = 1
    ORDER BY zona ASC
  `);

  return rows;
}

async function findUsuarioZop() {
  const [rows] = await db.query(`
    SELECT
      uz.id_usuario_zop,
      uz.usuario_id,
      u.nombre AS usuario_nombre,
      uz.zona_id,
      z.zona,
      z.nombre AS zona_nombre,
      uz.estado
    FROM usuario_zop uz
    LEFT JOIN usuarios u
      ON u.id_SB = uz.usuario_id
    LEFT JOIN z_op z
      ON z.id_zona = uz.zona_id
    ORDER BY u.nombre ASC, z.zona ASC
  `);

  return rows;
}

module.exports = {
  findEstadosVisuales,
  findPermisos,
  findRoles,
  findZonas,
  findUsuarioZop
};
