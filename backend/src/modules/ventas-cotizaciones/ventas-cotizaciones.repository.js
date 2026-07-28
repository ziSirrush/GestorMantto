const db = require('../../config/db');

async function getConnection() {
  return db.getConnection();
}

async function findExistingCotizacionIds(connection, cotizacionIds) {
  if (!cotizacionIds.length) return new Set();

  const placeholders = cotizacionIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_cotizacion
       FROM ventas_cotizaciones_cor
      WHERE id_cotizacion IN (${placeholders})`,
    cotizacionIds
  );

  return new Set(rows.map((row) => Number(row.id_cotizacion)));
}

async function findExistingUserIds(connection, userIds) {
  if (!userIds.length) return new Set();

  const placeholders = userIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_SB
       FROM usuarios
      WHERE id_SB IN (${placeholders})`,
    userIds
  );

  return new Set(rows.map((row) => Number(row.id_SB)));
}

async function upsertMany(connection, records) {
  if (!records.length) return { affectedRows: 0 };

  const columns = [
    'id_cotizacion',
    'nombre_proyecto',
    'cliente',
    'contacto',
    'telefono',
    'correo',
    'ciudad',
    'estado',
    'tipo_proyecto',
    'numero_equipos',
    'tipo_equipos',
    'informacion_envia',
    'asesor',
    'id_asesor',
    'visualiza',
    'anio_mes_cotizacion',
    'mx',
    'fecha_cotizacion',
    'fecha_solicitud',
    'zona',
    'estatus_proyecto',
    'razon_perdido',
    'admin',
    'id_admin',
    'fecha_cambio_estatus',
    'fecha_cierre',
    'comentario',
    'empresa_vs_perdido',
    'id_equipo_vendido',
    'anio_actual',
    'activo',
    'created_by',
    'updated_by'
  ];

  const placeholders = records
    .map(() => `(${columns.map(() => '?').join(', ')})`)
    .join(', ');

  const values = [];
  for (const record of records) {
    for (const column of columns) values.push(record[column]);
  }

  const updateColumns = columns.filter(
    (column) => !['id_cotizacion', 'created_by'].includes(column)
  );

  const updateSql = updateColumns
    .map((column) => `${column} = VALUES(${column})`)
    .concat('updated_at = CURRENT_TIMESTAMP')
    .join(',\n        ');

  const [result] = await connection.query(
    `INSERT INTO ventas_cotizaciones_cor (${columns.join(', ')})
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
        ${updateSql}`,
    values
  );

  return result;
}

module.exports = {
  getConnection,
  findExistingCotizacionIds,
  findExistingUserIds,
  upsertMany
};
