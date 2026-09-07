'use strict';

// [Aster | 2026-09-07 | ASTER-MG | FASE 4 ALMACEN NO REQUIERE REABASTO V001]
// Persistencia append-only del estado operativo de reabasto.
// La alerta tecnica de Stock NO se altera: critico/reorden/exceso/ok se calcula siempre
// desde el cierre INVENTARIO activo. Esta tabla solo decide si una alerta de bajo stock
// requiere o no una accion operativa de reabastecimiento.

const db = require('../../config/db');
const sourceEngine = require('./almacen.source-engine');

const OVERRIDE_TABLE = 'almacen_stock_reabasto_excepciones';
const INVENTORY_TABLE = sourceEngine.TABLE;
const INVENTORY_TYPE = sourceEngine.RECORD_TYPES.INVENTORY;
const PAGE_SIZE = 30;
const REABASTO_FILTERS = new Set(['todas', 'requiere', 'no_requiere', 'sin_necesidad']);
const TECHNICAL_NEED = new Set(['critico', 'reorden']);

function serviceError(message, status = 400, code = 'ALMACEN_REABASTO_ERROR', details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function translateSchemaError(error) {
  if (error && error.code === 'ER_NO_SUCH_TABLE') {
    return serviceError(
      'Falta aplicar el SQL de Fase 4 para No requiere reabasto.',
      503,
      'ALMACEN_REABASTO_SCHEMA_MISSING'
    );
  }
  return error;
}

function normalizeUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw serviceError('Usuario de sesión inválido.', 401, 'ALMACEN_REABASTO_USER_INVALID');
  }
  return id;
}

function normalizeStockKey(value) {
  const key = String(value == null ? '' : value).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw serviceError('La referencia de Stock es inválida.', 400, 'ALMACEN_REABASTO_KEY_INVALID');
  }
  return key;
}

function normalizeReason(value) {
  const reason = String(value == null ? '' : value).trim();
  if (reason.length < 5) {
    throw serviceError('Captura un motivo de al menos 5 caracteres.', 422, 'ALMACEN_REABASTO_REASON_REQUIRED');
  }
  if (reason.length > 1000) {
    throw serviceError('El motivo no puede exceder 1,000 caracteres.', 422, 'ALMACEN_REABASTO_REASON_TOO_LONG');
  }
  return reason;
}

function normalizeFlag(value) {
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
  throw serviceError('Estado de reabasto inválido.', 400, 'ALMACEN_REABASTO_FLAG_INVALID');
}

function articleIdentitySql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `COALESCE(NULLIF(TRIM(${p}articulo),''),NULLIF(TRIM(${p}codigo),''),CONCAT('Fila ',${p}fila_origen))`;
}

function technicalAlertSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `CASE
    WHEN ${p}stockSeguridad IS NOT NULL AND ${p}fisico IS NOT NULL AND ${p}fisico <= ${p}stockSeguridad THEN 'critico'
    WHEN ${p}puntoReorden IS NOT NULL AND ${p}fisico IS NOT NULL AND ${p}fisico <= ${p}puntoReorden THEN 'reorden'
    WHEN ${p}maximo IS NOT NULL AND ${p}fisico IS NOT NULL AND ${p}fisico > ${p}maximo THEN 'exceso'
    ELSE 'ok' END`;
}

function stockKeySql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `LOWER(SHA2(CONCAT(
      UPPER(TRIM(COALESCE(${p}empresa,''))),
      '|',
      CASE
        WHEN NULLIF(TRIM(${p}codigo),'') IS NOT NULL THEN CONCAT('CODIGO:',UPPER(TRIM(${p}codigo)))
        ELSE CONCAT('ARTICULO:',UPPER(TRIM(COALESCE(${p}articulo,''))))
      END
    ),256))`;
}


function groupedStockSql(source, query = {}, applyUserFilters = true) {
  const base = sourceEngine.buildDatasetFilter(source, INVENTORY_TYPE);
  const where = [base.sql, 'stock_seguridad IS NOT NULL'];
  const params = [...base.params];

  if (applyUserFilters) {
    const q = String(query.q || '').trim();
    if (q) {
      const like = `%${q}%`;
      where.push('(codigo LIKE ? OR articulo LIKE ?)');
      params.push(like, like);
    }
    const company = String(query.company || '').trim();
    if (company && company !== 'todas') {
      where.push('empresa=?');
      params.push(company);
    }
  }

  const identity = articleIdentitySql();
  const sql = `SELECT MIN(id) AS id,
      MAX(codigo) AS codigo,
      MAX(articulo) AS articulo,
      empresa,
      UPPER(NULLIF(TRIM(MAX(abc)),'')) AS abc,
      MAX(criticidad) AS criticidad,
      MAX(demanda) AS demanda,
      COALESCE(SUM(COALESCE(fisico,0)),0) AS fisico,
      MAX(stock_seguridad) AS stockSeguridad,
      MAX(punto_reorden) AS puntoReorden,
      MAX(minimo) AS minimo,
      MAX(maximo) AS maximo
    FROM ${INVENTORY_TABLE}
    WHERE ${where.join(' AND ')}
    GROUP BY empresa,${identity}`;

  return { sql, params };
}

function keyedStockSql(groupedSql) {
  return `SELECT g.*,
      ${stockKeySql('g')} AS stockKey,
      ${technicalAlertSql('g')} AS alertaTecnica
    FROM (${groupedSql}) g`;
}

function latestOverrideSql() {
  return `SELECT e.clave_articulo,
      e.no_requiere_reabasto,
      e.motivo,
      e.lote_importacion,
      e.fecha_corte,
      e.alerta_tecnica_al_cambio,
      e.creado_por,
      e.created_at,
      e.id_excepcion
    FROM ${OVERRIDE_TABLE} e
    INNER JOIN (
      SELECT clave_articulo, MAX(id_excepcion) AS id_excepcion
      FROM ${OVERRIDE_TABLE}
      GROUP BY clave_articulo
    ) latest ON latest.id_excepcion=e.id_excepcion`;
}

function decoratedStockSql(keyedSql) {
  return `SELECT k.*,
      COALESCE(o.no_requiere_reabasto,0) AS noRequiereReabasto,
      o.motivo AS motivoReabasto,
      o.creado_por AS reabastoUpdatedBy,
      o.created_at AS reabastoUpdatedAt,
      o.id_excepcion AS idExcepcionReabasto,
      CASE
        WHEN k.alertaTecnica IN ('critico','reorden') AND COALESCE(o.no_requiere_reabasto,0)=1 THEN 'no_requiere_reabasto'
        WHEN k.alertaTecnica IN ('critico','reorden') THEN 'requiere_reabasto'
        ELSE 'sin_necesidad_reabasto'
      END AS estadoOperativo
    FROM (${keyedSql}) k
    LEFT JOIN (${latestOverrideSql()}) o ON o.clave_articulo=k.stockKey`;
}

function normalizedRow(row) {
  return {
    ...row,
    demanda: row.demanda == null ? null : Number(row.demanda),
    fisico: row.fisico == null ? null : Number(row.fisico),
    stockSeguridad: row.stockSeguridad == null ? null : Number(row.stockSeguridad),
    puntoReorden: row.puntoReorden == null ? null : Number(row.puntoReorden),
    minimo: row.minimo == null ? null : Number(row.minimo),
    maximo: row.maximo == null ? null : Number(row.maximo),
    noRequiereReabasto: Number(row.noRequiereReabasto || 0) === 1,
    reabastoUpdatedBy: row.reabastoUpdatedBy == null ? null : Number(row.reabastoUpdatedBy),
    idExcepcionReabasto: row.idExcepcionReabasto == null ? null : Number(row.idExcepcionReabasto)
  };
}

async function getStockReabasto(query = {}) {
  try {
    const source = await sourceEngine.resolveSource(query);
    const requestedPage = Number(query.page || 1);
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const offset = (page - 1) * PAGE_SIZE;
    if (!source) {
      return {
        ok: true,
        source: null,
        rows: [],
        operationalKpis: { requierenReabasto:0, excluidosReabasto:0, excepcionesActivas:0, criticosAccionables:0, reordenAccionables:0 },
        pagination: { page:1, pageSize:PAGE_SIZE, total:0, pages:1 },
        identityVersion: 'empresa+codigo|articulo-v1'
      };
    }

    const grouped = groupedStockSql(source, query, true);
    const decorated = decoratedStockSql(keyedStockSql(grouped.sql));
    const outer = [];
    const outerParams = [];

    const abc = String(query.abc || '').trim();
    if (abc && abc !== 'todas') {
      outer.push('UPPER(TRIM(abc))=?');
      outerParams.push(abc.toUpperCase());
    }

    const alert = String(query.alert || '').trim();
    if (alert && alert !== 'todas') {
      outer.push('alertaTecnica=?');
      outerParams.push(alert);
    }

    const reabasto = String(query.reabasto || 'todas').trim().toLowerCase();
    if (!REABASTO_FILTERS.has(reabasto)) {
      throw serviceError('Filtro de reabasto inválido.', 400, 'ALMACEN_REABASTO_FILTER_INVALID');
    }
    if (reabasto === 'requiere') outer.push("alertaTecnica IN ('critico','reorden') AND noRequiereReabasto=0");
    if (reabasto === 'no_requiere') outer.push('noRequiereReabasto=1');
    if (reabasto === 'sin_necesidad') outer.push("alertaTecnica NOT IN ('critico','reorden') AND noRequiereReabasto=0");

    const outerWhere = outer.length ? `WHERE ${outer.join(' AND ')}` : '';

    const allGrouped = groupedStockSql(source, {}, false);
    const allDecorated = decoratedStockSql(keyedStockSql(allGrouped.sql));

    const [[rows], [countRows], [summaryRows]] = await Promise.all([
      db.query(
        `SELECT * FROM (${decorated}) d ${outerWhere}
         ORDER BY COALESCE(NULLIF(TRIM(articulo),''),codigo)
         LIMIT ? OFFSET ?`,
        [...grouped.params, ...outerParams, PAGE_SIZE, offset]
      ),
      db.query(
        `SELECT COUNT(*) AS total FROM (${decorated}) d ${outerWhere}`,
        [...grouped.params, ...outerParams]
      ),
      db.query(
        `SELECT
           SUM(CASE WHEN alertaTecnica IN ('critico','reorden') AND noRequiereReabasto=0 THEN 1 ELSE 0 END) AS requierenReabasto,
           SUM(CASE WHEN alertaTecnica IN ('critico','reorden') AND noRequiereReabasto=1 THEN 1 ELSE 0 END) AS excluidosReabasto,
           SUM(CASE WHEN noRequiereReabasto=1 THEN 1 ELSE 0 END) AS excepcionesActivas,
           SUM(CASE WHEN alertaTecnica='critico' AND noRequiereReabasto=0 THEN 1 ELSE 0 END) AS criticosAccionables,
           SUM(CASE WHEN alertaTecnica='reorden' AND noRequiereReabasto=0 THEN 1 ELSE 0 END) AS reordenAccionables
         FROM (${allDecorated}) d`,
        allGrouped.params
      )
    ]);

    const total = Number(countRows[0]?.total || 0);
    const summary = summaryRows[0] || {};
    return {
      ok: true,
      source,
      rows: rows.map(normalizedRow),
      operationalKpis: {
        requierenReabasto: Number(summary.requierenReabasto || 0),
        excluidosReabasto: Number(summary.excluidosReabasto || 0),
        excepcionesActivas: Number(summary.excepcionesActivas || 0),
        criticosAccionables: Number(summary.criticosAccionables || 0),
        reordenAccionables: Number(summary.reordenAccionables || 0)
      },
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE))
      },
      identityVersion: 'empresa+codigo|articulo-v1'
    };
  } catch (error) {
    throw translateSchemaError(error);
  }
}

async function findStockRowByKey(source, stockKey, conn = db) {
  const grouped = groupedStockSql(source, {}, false);
  const keyed = keyedStockSql(grouped.sql);
  const [rows] = await conn.query(
    `SELECT * FROM (${keyed}) k WHERE stockKey=? LIMIT 2`,
    [...grouped.params, stockKey]
  );
  if (!rows.length) {
    throw serviceError('El artículo ya no existe en el cierre activo de Stock.', 404, 'ALMACEN_REABASTO_STOCK_NOT_FOUND');
  }
  if (rows.length > 1) {
    throw serviceError(
      'La referencia de Stock no es única. No se aplicó ningún cambio.',
      409,
      'ALMACEN_REABASTO_STOCK_AMBIGUOUS'
    );
  }
  return rows[0];
}

async function latestOverride(stockKey, conn = db, forUpdate = false) {
  const suffix = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await conn.query(
    `SELECT id_excepcion AS idExcepcion,
            clave_articulo AS stockKey,
            empresa,
            codigo,
            articulo,
            no_requiere_reabasto AS noRequiereReabasto,
            motivo,
            lote_importacion AS loteImportacion,
            fecha_corte AS fechaCorte,
            alerta_tecnica_al_cambio AS alertaTecnicaAlCambio,
            fisico_al_cambio AS fisicoAlCambio,
            stock_seguridad_al_cambio AS stockSeguridadAlCambio,
            punto_reorden_al_cambio AS puntoReordenAlCambio,
            creado_por AS creadoPor,
            created_at AS createdAt
       FROM ${OVERRIDE_TABLE}
      WHERE clave_articulo=?
      ORDER BY id_excepcion DESC
      LIMIT 1${suffix}`,
    [stockKey]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ...row,
    idExcepcion: Number(row.idExcepcion),
    noRequiereReabasto: Number(row.noRequiereReabasto || 0) === 1,
    creadoPor: Number(row.creadoPor),
    fisicoAlCambio: row.fisicoAlCambio == null ? null : Number(row.fisicoAlCambio),
    stockSeguridadAlCambio: row.stockSeguridadAlCambio == null ? null : Number(row.stockSeguridadAlCambio),
    puntoReordenAlCambio: row.puntoReordenAlCambio == null ? null : Number(row.puntoReordenAlCambio)
  };
}

async function setStockReabasto(input = {}, userIdValue, query = {}) {
  const userId = normalizeUserId(userIdValue);
  const stockKey = normalizeStockKey(input.stockKey || input.claveArticulo);
  const noRequiereReabasto = normalizeFlag(input.noRequiereReabasto);
  const motivo = normalizeReason(input.motivo);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    const source = await sourceEngine.resolveSource(query, conn);
    if (!source) {
      throw serviceError('No existe un cierre activo de inventario.', 409, 'ALMACEN_REABASTO_SOURCE_MISSING');
    }

    const row = await findStockRowByKey(source, stockKey, conn);
    const current = await latestOverride(stockKey, conn, true);
    const currentActive = Boolean(current?.noRequiereReabasto);

    if (current && currentActive === noRequiereReabasto) {
      throw serviceError(
        noRequiereReabasto ? 'El artículo ya está marcado como No requiere reabasto.' : 'El artículo ya requiere reabasto normalmente.',
        409,
        'ALMACEN_REABASTO_NO_CHANGE'
      );
    }
    if (!current && noRequiereReabasto === false) {
      throw serviceError('El artículo no tiene una excepción activa que retirar.', 409, 'ALMACEN_REABASTO_NO_ACTIVE_EXCEPTION');
    }

    const technicalAlert = String(row.alertaTecnica || '').toLowerCase();
    if (noRequiereReabasto && !TECHNICAL_NEED.has(technicalAlert)) {
      throw serviceError(
        'Solo se puede marcar No requiere reabasto cuando la alerta técnica es Crítico o Punto de reorden.',
        422,
        'ALMACEN_REABASTO_NOT_LOW_STOCK',
        { alertaTecnica: technicalAlert || 'ok' }
      );
    }

    const [insert] = await conn.query(
      `INSERT INTO ${OVERRIDE_TABLE}
        (clave_articulo,empresa,codigo,articulo,no_requiere_reabasto,motivo,
         lote_importacion,fecha_corte,alerta_tecnica_al_cambio,fisico_al_cambio,
         stock_seguridad_al_cambio,punto_reorden_al_cambio,creado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        stockKey,
        row.empresa,
        row.codigo || null,
        row.articulo || null,
        noRequiereReabasto ? 1 : 0,
        motivo,
        source.loteImportacion || null,
        source.fechaCorte || null,
        technicalAlert || 'ok',
        row.fisico == null ? null : Number(row.fisico),
        row.stockSeguridad == null ? null : Number(row.stockSeguridad),
        row.puntoReorden == null ? null : Number(row.puntoReorden),
        userId
      ]
    );

    await conn.commit();
    return {
      ok: true,
      event: {
        idExcepcion: Number(insert.insertId),
        stockKey,
        empresa: row.empresa,
        codigo: row.codigo || null,
        articulo: row.articulo || null,
        noRequiereReabasto,
        motivo,
        loteImportacion: source.loteImportacion || null,
        fechaCorte: source.fechaCorte || null,
        alertaTecnicaAlCambio: technicalAlert || 'ok',
        creadoPor: userId
      }
    };
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw translateSchemaError(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  OVERRIDE_TABLE,
  getStockReabasto,
  setStockReabasto,
  // Exportacion pura para pruebas unitarias posteriores.
  technicalAlertSql
};
