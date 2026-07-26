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
    return { insertados: 0, actualizados: 0, sin_cambios: 0 };
  }

  const conn = await db.getConnection();
  const summary = {
    insertados: 0,
    actualizados: 0,
    sin_cambios: 0
  };

  try {
    await conn.beginTransaction();

    for (const incoming of registros) {
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
