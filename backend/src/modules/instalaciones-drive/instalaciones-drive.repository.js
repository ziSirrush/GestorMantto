// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_4_BACKEND_FLEXIBLE_REGISTRO_V001]
const db = require('../../config/db');

function comparable(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim();
}

function changed(existing, incoming) {
  return (
    comparable(existing.nombre_carpeta) !== comparable(incoming.nombre_carpeta) ||
    comparable(existing.enlace) !== comparable(incoming.enlace) ||
    Number(existing.activo) !== Number(incoming.activo)
  );
}

async function syncCarpetas(registros) {
  if (!registros.length) {
    return { insertados: 0, actualizados: 0, sin_cambios: 0, detalles_errores: [] };
  }

  const conn = await db.getConnection();
  const summary = {
    insertados: 0,
    actualizados: 0,
    sin_cambios: 0,
    detalles_errores: []
  };

  try {
    await conn.beginTransaction();

    for (let position = 0; position < registros.length; position += 1) {
      const incoming = registros[position];
      const savepoint = `drive_folder_${position}`;

      try {
        await conn.query(`SAVEPOINT ${savepoint}`);

        const [existingRows] = await conn.query(
          `SELECT id_carpeta, nombre_carpeta, carpeta_id, enlace, activo
             FROM instalaciones_drive_carpetas
            WHERE carpeta_id = ?
            LIMIT 1`,
          [incoming.carpeta_id]
        );

        if (!existingRows.length) {
          await conn.query(
            `INSERT INTO instalaciones_drive_carpetas
               (nombre_carpeta, carpeta_id, enlace, activo, fecha_sincronizacion)
             VALUES (?, ?, ?, ?, COALESCE(?, NOW()))`,
            [
              incoming.nombre_carpeta,
              incoming.carpeta_id,
              incoming.enlace,
              incoming.activo,
              incoming.fecha_sincronizacion
            ]
          );

          summary.insertados += 1;
          await conn.query(`RELEASE SAVEPOINT ${savepoint}`);
          continue;
        }

        const existing = existingRows[0];

        if (!changed(existing, incoming)) {
          await conn.query(
            `UPDATE instalaciones_drive_carpetas
                SET fecha_sincronizacion = COALESCE(?, NOW())
              WHERE id_carpeta = ?`,
            [incoming.fecha_sincronizacion, existing.id_carpeta]
          );

          summary.sin_cambios += 1;
          await conn.query(`RELEASE SAVEPOINT ${savepoint}`);
          continue;
        }

        await conn.query(
          `UPDATE instalaciones_drive_carpetas
              SET nombre_carpeta = ?,
                  enlace = ?,
                  activo = ?,
                  fecha_sincronizacion = COALESCE(?, NOW())
            WHERE id_carpeta = ?`,
          [
            incoming.nombre_carpeta,
            incoming.enlace,
            incoming.activo,
            incoming.fecha_sincronizacion,
            existing.id_carpeta
          ]
        );

        summary.actualizados += 1;
        await conn.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (rowError) {
        try { await conn.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_rollbackError) {}
        try { await conn.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_releaseError) {}
        summary.detalles_errores.push({
          index: incoming._index ?? position,
          carpeta_id: incoming.carpeta_id || null,
          message: rowError.message
        });
      }
    }

    await conn.commit();
    return summary;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  syncCarpetas
};
