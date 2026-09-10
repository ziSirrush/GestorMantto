'use strict';

// [Aster | 2026-09-08 | ASTER-MG | FIX CATALOGO GENERAL GUARDS V001]
// Catálogo General lee ambas fuentes fotográficas sin aplicar los alcances de
// registro CORELLIAN/UNITED. La puerta funcional GENERAL se aplica en routes.
// Los endpoints históricos por origen conservan sus guards y sirven para
// determinar si el usuario puede navegar al proyecto correspondiente.

const db = require('../../config/db');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');
const azureStorage = require('../../services/storage/azure-storage.service');

const CORE_PHOTO_ALIASES = Object.freeze([
  ['foto_blt_1', 'FOTO BLT'],
  ['foto_blt_2', 'FOTO BLT 2'],
  ['foto_blt_3', 'FOTO BLT 3'],
  ['foto_blt_4', 'FOTO BLT 4'],
  ['foto_blt_5', 'FOTO BLT 5'],
  ['foto_blt_6', 'FOTO BLT 6'],
  ['foto_blt_7', 'FOTO BLT 7']
]);
const UNITED_PHOTO_FIELDS = Object.freeze([
  'foto_1', 'foto_2', 'foto_3', 'foto_4', 'foto_5', 'foto_6', 'foto_7'
]);

function normalizedLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 5000;
  return Math.min(parsed, 5000);
}

function azureBlobNameFromStableUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw) || !/\.blob\.core\.windows\.net\//i.test(raw)) return null;

  try {
    const parsed = new URL(raw);
    const container = String(process.env.AZURE_STORAGE_BLOB_CONTAINER_NAME || '').trim();
    if (!container) return null;

    const prefix = '/' + container + '/';
    const decodedPath = decodeURIComponent(parsed.pathname || '');
    if (!decodedPath.startsWith(prefix)) return null;
    return decodedPath.slice(prefix.length);
  } catch (_error) {
    return null;
  }
}

async function presentCorePhotoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const blobName = azureBlobNameFromStableUrl(raw);
  if (!blobName) return raw;

  try {
    const access = await azureStorage.createReadSas_gnral(blobName);
    return access.url;
  } catch (_error) {
    return raw;
  }
}

async function presentCorePhotoRow(row) {
  const copy = { ...row };

  for (const [field, alias] of CORE_PHOTO_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(copy, field)) {
      copy[field] = await presentCorePhotoUrl(copy[field]);
    }
    if (Object.prototype.hasOwnProperty.call(copy, alias)) {
      copy[alias] = await presentCorePhotoUrl(copy[alias]);
    }
  }

  const selected = String(copy.foto_principal || '').trim();
  const selectedAlias = CORE_PHOTO_ALIASES.find(([field]) => field === selected);
  const selectedUrl = selectedAlias
    ? (copy[selectedAlias[1]] || copy[selectedAlias[0]] || null)
    : null;

  copy.foto_portada = selectedUrl ||
    copy['FOTO BLT'] || copy.foto_blt_1 ||
    copy['FOTO BLT 2'] || copy.foto_blt_2 ||
    copy['FOTO BLT 3'] || copy.foto_blt_3 ||
    copy['FOTO BLT 4'] || copy.foto_blt_4 ||
    copy['FOTO BLT 5'] || copy.foto_blt_5 ||
    copy['FOTO BLT 6'] || copy.foto_blt_6 ||
    copy['FOTO BLT 7'] || copy.foto_blt_7 || null;

  return copy;
}

async function presentUnitedPhotoRow(row) {
  const copy = { ...row };
  for (const field of UNITED_PHOTO_FIELDS) {
    copy[field] = await presentCorePhotoUrl(copy[field]);
  }
  return copy;
}

async function listGeneralCorePhotos(limit) {
  const [rows] = await db.query(
    `SELECT
       p.id_photo,
       p.id_ppns AS \`ID Proyecto\`,
       MAX(f.proyecto) AS \`Proyecto\`,
       MAX(f.ciudad) AS \`Ciudad\`,
       MAX(f.estado) AS \`Estado\`,
       MAX(f.cliente) AS \`Cliente\`,
       MAX(f.vendedor) AS \`Asesor\`,
       MAX(f.supervisor_fl) AS \`Supervisor\`,
       p.carpeta AS \`Carpeta\`,
       p.foto_blt_1 AS \`FOTO BLT\`,
       p.foto_blt_2 AS \`FOTO BLT 2\`,
       p.foto_blt_3 AS \`FOTO BLT 3\`,
       p.foto_blt_4 AS \`FOTO BLT 4\`,
       p.foto_blt_5 AS \`FOTO BLT 5\`,
       p.foto_blt_6 AS \`FOTO BLT 6\`,
       p.foto_blt_7 AS \`FOTO BLT 7\`,
       p.foto_principal AS foto_principal,
       p.imagen_drive AS \`Imagen Drive\`,
       p.imagen_p_g AS \`Imagen P G\`
     FROM ins_proyecto_fotos p
     LEFT JOIN ins_fl f
       ON TRIM(f.id_proyecto) = TRIM(p.id_ppns)
     WHERE (
       NULLIF(TRIM(p.foto_blt_1), '') IS NOT NULL OR
       NULLIF(TRIM(p.foto_blt_2), '') IS NOT NULL OR
       NULLIF(TRIM(p.foto_blt_3), '') IS NOT NULL OR
       NULLIF(TRIM(p.foto_blt_4), '') IS NOT NULL OR
       NULLIF(TRIM(p.foto_blt_5), '') IS NOT NULL OR
       NULLIF(TRIM(p.foto_blt_6), '') IS NOT NULL OR
       NULLIF(TRIM(p.foto_blt_7), '') IS NOT NULL
     )
     GROUP BY
       p.id_photo, p.id_ppns, p.carpeta,
       p.foto_blt_1, p.foto_blt_2, p.foto_blt_3,
       p.foto_blt_4, p.foto_blt_5, p.foto_blt_6,
       p.foto_blt_7, p.foto_principal, p.imagen_drive, p.imagen_p_g
     ORDER BY Proyecto ASC, p.id_ppns ASC
     LIMIT ?`,
    [limit]
  );

  const presentedRows = [];
  for (const row of rows) {
    presentedRows.push(await presentCorePhotoRow(row));
  }
  return presentedRows;
}

async function listGeneralUnitedPhotos(limit) {
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
     LEFT JOIN (
       SELECT
         p.proyecto,
         MAX(NULLIF(TRIM(p.ciudad), '')) AS ciudad,
         MAX(NULLIF(TRIM(p.estado), '')) AS estado,
         MAX(NULLIF(TRIM(p.cliente), '')) AS cliente
       FROM portafolio p
       WHERE p.estado_registro = 1
       GROUP BY p.proyecto
     ) visible
       ON TRIM(visible.proyecto) = TRIM(pf.proyecto)
     LEFT JOIN proyecto_equivalencias pe
       ON pe.activo = 1
      AND TRIM(pe.proyecto_united) = TRIM(pf.proyecto)
     WHERE pf.activo = 1
       AND (
         NULLIF(TRIM(pf.foto_1), '') IS NOT NULL OR
         NULLIF(TRIM(pf.foto_2), '') IS NOT NULL OR
         NULLIF(TRIM(pf.foto_3), '') IS NOT NULL OR
         NULLIF(TRIM(pf.foto_4), '') IS NOT NULL OR
         NULLIF(TRIM(pf.foto_5), '') IS NOT NULL OR
         NULLIF(TRIM(pf.foto_6), '') IS NOT NULL OR
         NULLIF(TRIM(pf.foto_7), '') IS NOT NULL
       )
     ORDER BY pf.proyecto ASC, pf.id_photo ASC
     LIMIT ?`,
    [limit]
  );

  const presentedRows = [];
  for (const row of rows) {
    presentedRows.push(await presentUnitedPhotoRow(row));
  }
  return presentedRows;
}

async function getGeneralProjectPhotos(req, res, next) {
  const limit = normalizedLimit(req.query?.limit);

  try {
    const [corellian, united] = await Promise.all([
      listGeneralCorePhotos(limit),
      listGeneralUnitedPhotos(limit)
    ]);

    return res.json({
      ok: true,
      source: 'aiven',
      domain: 'GENERAL',
      data: {
        corellian,
        united
      }
    });
  } catch (error) {
    return next(error);
  }
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

    const presentedRows = [];
    for (const row of rows) {
      presentedRows.push(await presentUnitedPhotoRow(row));
    }

    return res.json({
      ok: true,
      source: 'aiven',
      domain: 'UNITED',
      data: presentedRows
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getGeneralProjectPhotos,
  getUnitedProjectPhotos
};
