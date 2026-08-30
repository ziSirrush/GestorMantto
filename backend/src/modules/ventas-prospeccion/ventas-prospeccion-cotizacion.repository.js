'use strict';

async function lockProspection(connection, idPros) {
  const [rows] = await connection.query(
    `SELECT
       p.id_pros,
       p.id_cotizacion,
       p.id_cliente,
       p.id_contacto,
       p.nuevo,
       p.proyecto_cotizado,
       COALESCE(p.estatus, pe.nombre) AS estatus
     FROM ventas_prospecciones p
     LEFT JOIN ventas_prospeccion_estatus pe ON pe.id_estatus = p.id_estatus
     WHERE p.id_pros = ?
       AND p.activo = 1
     LIMIT 1
     FOR UPDATE`,
    [idPros]
  );
  return rows[0] || null;
}

async function linkQuotation(connection, idPros, quotation) {
  const [result] = await connection.query(
    `UPDATE ventas_prospecciones
        SET id_cotizacion = ?,
            id_cliente = COALESCE(id_cliente, ?),
            id_contacto = COALESCE(id_contacto, ?),
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id_pros = ?
        AND activo = 1`,
    [quotation.id_cotizacion, quotation.id_cliente, quotation.id_contacto, idPros]
  );
  return Number(result.affectedRows || 0);
}

module.exports = {
  lockProspection,
  linkQuotation
};
