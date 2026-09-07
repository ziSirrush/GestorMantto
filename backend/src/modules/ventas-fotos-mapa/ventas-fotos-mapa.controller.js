'use strict';

const db = require('../../config/db');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');

function normalizedLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 5000;
  return Math.min(parsed, 5000);
}

async function getUnitedProjectPhotos(req, res, next) {
  const scope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');
  const limit = normalizedLimit(req.query?.limit);

  try {
    const [rows] = await db.query(
      `SELECT
         pf.id_photo,
         pf.proyecto AS proyecto_united,
         pe.proyecto_corellian,
         pe.nombre_publico,
         visible.ciudad,
         visible.estado,
         visible.cliente,
         pf.foto_1,
         pf.foto_2,
         pf.foto_3,
         pf.foto_4,
         pf.foto_5,
         pf.foto_6,
         pf.foto_7,
         pf.foto_principal
       FROM portafolio_proyecto_fotos pf
       INNER JOIN (
         SELECT
           p.proyecto,
           MAX(NULLIF(TRIM(p.ciudad), '')) AS ciudad,
           MAX(NULLIF(TRIM(p.estado), '')) AS estado,
           MAX(NULLIF(TRIM(p.cliente), '')) AS cliente
         FROM portafolio p
         WHERE p.estado_registro = 1
           AND ${scope.sql}
         GROUP BY p.proyecto
       ) visible
         ON TRIM(visible.proyecto) = TRIM(pf.proyecto)
       LEFT JOIN proyecto_equivalencias pe
         ON pe.activo = 1
        AND TRIM(pe.proyecto_united) = TRIM(pf.proyecto)
       WHERE pf.activo = 1
       ORDER BY pf.proyecto ASC, pf.id_photo ASC
       LIMIT ?`,
      [...scope.params, limit]
    );

    return res.json({
      ok: true,
      source: 'aiven',
      domain: 'UNITED',
      data: rows
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getUnitedProjectPhotos
};
