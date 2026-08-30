'use strict';

// FASE 9/11 - Portafolio > Movimientos de Portafolio por cuartos UNITED.
// Autoridad territorial unica:
// usuario_zop -> portafolio.zona_id -> z_op.id_zona -> z_op.zona.
// Los textos legacy zona_operativa y los valores zona dentro de snapshots JSON
// se conservan solo como referencia historica; nunca conceden acceso.

const db = require('../../config/db');
const {
  latestDueSunday,
  runWeeklyClose
} = require('../../jobs/portafolioCierreSemanal.job');
const {
  hasUnrestrictedUnitedScope_gnral,
  buildPortafolioScopeSql_gnral,
  zoneIds_gnral
} = require('../../services/information-record-scope-gnral.service');

function normalizeText_uni(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeUpper_uni(value) {
  return normalizeText_uni(value).toUpperCase();
}

function likeParam_uni(value) {
  const text = normalizeText_uni(value);
  return text ? `%${text}%` : null;
}

function parseJsonArray_uni(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function equipmentCodeFromJson_uni(row) {
  return normalizeText_uni(
    row?.equipo
    ?? row?.numero_equipo
    ?? row?.codigo_equipo
    ?? row?.codigo
    ?? row?.cod
    ?? ''
  );
}

function equipmentKey_uni(value) {
  return normalizeUpper_uni(value);
}

async function latestWeeklySnapshotEquipmentKeys_uni() {
  const [cuts] = await db.query(`
    SELECT id_corte
    FROM portafolio_cortes_semanales FORCE INDEX (uq_portafolio_semana)
    WHERE estado = 'CERRADO'
    ORDER BY anio_iso DESC, semana_iso DESC
    LIMIT 1
  `);
  if (!cuts.length) return null;

  const [snapshots] = await db.query(`
    SELECT snapshot_json
    FROM portafolio_cortes_semanales
    WHERE id_corte = ?
      AND estado = 'CERRADO'
    LIMIT 1
  `, [cuts[0].id_corte]);
  if (!snapshots.length) return null;

  let snapshot = snapshots[0].snapshot_json;
  if (Buffer.isBuffer(snapshot)) snapshot = snapshot.toString('utf8');
  if (!Array.isArray(snapshot)) {
    try { snapshot = JSON.parse(snapshot); } catch (error) { return null; }
  }
  if (!Array.isArray(snapshot)) return null;

  return new Set(
    snapshot
      .map(row => equipmentKey_uni(equipmentCodeFromJson_uni(row)))
      .filter(Boolean)
  );
}

function movementType_uni(row) {
  return normalizeUpper_uni(row?.tipo ?? row?.tipo_movimiento ?? 'CAMBIO') || 'CAMBIO';
}

function classifyMovementSql_uni(alias = 'p') {
  return `CASE
    WHEN NULLIF(TRIM(COALESCE(${alias}.estatus_ul_mes, '')), '') IS NULL
      AND LOWER(TRIM(${alias}.estatus_servicio)) IN ('en servicio','servicio') THEN 'NUEVO_INGRESO'
    WHEN LOWER(TRIM(${alias}.estatus_ul_mes)) IN ('en servicio','servicio')
      AND LOWER(TRIM(${alias}.estatus_servicio)) NOT IN ('en servicio','servicio') THEN 'DEGRADADO'
    WHEN LOWER(TRIM(${alias}.estatus_ul_mes)) NOT IN ('en servicio','servicio')
      AND LOWER(TRIM(${alias}.estatus_servicio)) IN ('en servicio','servicio') THEN 'RECUPERADO'
    ELSE 'CAMBIO'
  END`;
}

function commercialClassificationSql_uni(alias = 'p') {
  return `CASE
    WHEN UPPER(TRIM(COALESCE(${alias}.estatus_servicio,''))) LIKE '%NO EN SERVICIO%' THEN 'No en Servicio'
    WHEN UPPER(TRIM(COALESCE(${alias}.estatus_cobranza,''))) = 'EN COBRANZA' THEN 'En Cobranza'
    WHEN UPPER(TRIM(COALESCE(${alias}.estatus_cobranza,''))) = 'GRATUITO' THEN 'Gratuito/Garantía'
    ELSE NULL
  END`;
}

const latestTicketJoin_uni = `
  LEFT JOIN (
    SELECT *
    FROM (
      SELECT
        t.*,
        ROW_NUMBER() OVER (
          PARTITION BY TRIM(COALESCE(t.codigo_equipo, ''))
          ORDER BY t.fecha_reporte DESC, t.id DESC
        ) AS rn
      FROM tickets t
      WHERE NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
    ) ranked
    WHERE ranked.rn = 1
  ) lt
    ON TRIM(COALESCE(lt.codigo_equipo, '')) = TRIM(COALESCE(p.numero_equipo, ''))
`;

async function authorizedZoneRows_uni(req) {
  if (hasUnrestrictedUnitedScope_gnral(req)) {
    const [rows] = await db.query(`
      SELECT id_zona, zona
      FROM z_op
      WHERE estado = 1
      ORDER BY zona ASC, id_zona ASC
    `);
    return rows;
  }
  const ids = zoneIds_gnral(req);
  if (!ids.length) return [];
  const [rows] = await db.query(`
    SELECT id_zona, zona
    FROM z_op
    WHERE estado = 1
      AND id_zona IN (?)
    ORDER BY zona ASC, id_zona ASC
  `, [ids]);
  return rows;
}

function alcanceFromZoneRows_uni(rows) {
  return {
    zona_ids: (rows || []).map(row => Number(row.id_zona)).filter(Number.isInteger),
    zonas: (rows || []).map(row => normalizeText_uni(row.zona)).filter(Boolean)
  };
}

async function alcancePayload_uni(req) {
  return alcanceFromZoneRows_uni(await authorizedZoneRows_uni(req));
}

async function movementColumns_uni() {
  const [cols] = await db.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'portafolio'
      AND COLUMN_NAME IN ('estatus_ul_mes','estatus_ul_mes_fecha')
  `);
  return new Set(cols.map(row => row.COLUMN_NAME));
}

function monthlyFilters_uni(req, alias = 'p', zoneAlias = 'z') {
  const access = buildPortafolioScopeSql_gnral(req, alias);
  const clauses = [
    `${alias}.estado_registro = 1`,
    `(${alias}.inactivo IS NULL OR UPPER(${alias}.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))`,
    `${alias}.estatus_servicio IS NOT NULL`,
    `TRIM(${alias}.estatus_servicio) <> ''`,
    `(
      (
        NULLIF(TRIM(COALESCE(${alias}.estatus_ul_mes, '')), '') IS NULL
        AND LOWER(TRIM(${alias}.estatus_servicio)) IN ('en servicio','servicio')
      )
      OR (
        NULLIF(TRIM(COALESCE(${alias}.estatus_ul_mes, '')), '') IS NOT NULL
        AND LOWER(TRIM(${alias}.estatus_ul_mes)) <> LOWER(TRIM(${alias}.estatus_servicio))
      )
    )`,
    access.sql
  ];
  const params = [...(access.params || [])];

  const zona = normalizeText_uni(req.query?.zona);
  const search = likeParam_uni(req.query?.search || req.query?.buscar);
  const tipo = normalizeUpper_uni(req.query?.tipo);
  const tipoExpr = classifyMovementSql_uni(alias);

  if (zona) {
    clauses.push(`UPPER(TRIM(${zoneAlias}.zona)) = UPPER(TRIM(?))`);
    params.push(zona);
  }

  if (search) {
    clauses.push(`(
      ${alias}.numero_equipo LIKE ?
      OR ${alias}.proyecto LIKE ?
      OR ${alias}.proyecto_cc_x_port LIKE ?
      OR ${alias}.ciudad LIKE ?
      OR ${alias}.estado LIKE ?
      OR ${alias}.identificacion_sitio LIKE ?
      OR ${alias}.supervisor_zona LIKE ?
      OR ${zoneAlias}.zona LIKE ?
    )`);
    params.push(search, search, search, search, search, search, search, search);
  }

  if (['DEGRADADO', 'RECUPERADO', 'CAMBIO', 'NUEVO_INGRESO'].includes(tipo)) {
    clauses.push(`${tipoExpr} = ?`);
    params.push(tipo);
  }

  return { where: clauses.join(' AND '), params, tipoExpr };
}

async function buildMonthlyPayload_uni(req) {
  const alcance = await alcancePayload_uni(req);
  const available = await movementColumns_uni();

  if (!available.has('estatus_ul_mes')) {
    return {
      ok: true,
      source: 'aiven',
      warning: 'Movimientos pendiente: la tabla portafolio no tiene estatus_ul_mes para comparar contra el corte mensual.',
      alcance,
      kpis: { total: 0, degradados: 0, recuperados: 0, cambios: 0, ingresos: 0 },
      corte: null,
      filters: { zonas: alcance.zonas },
      data: []
    };
  }

  const filters = monthlyFilters_uni(req, 'p', 'z');
  const fechaCorteExpr = available.has('estatus_ul_mes_fecha') ? 'p.estatus_ul_mes_fecha' : 'NULL';

  const [candidateRows] = await db.query(`
    SELECT
      p.id_portafolio,
      p.numero_equipo,
      p.proyecto,
      p.proyecto AS proyecto_codigo,
      COALESCE(NULLIF(TRIM(p.proyecto_cc_x_port), ''), p.proyecto) AS proyecto_nombre,
      p.ciudad,
      p.estado,
      p.identificacion_sitio,
      p.zona_id AS zona_id_oficial,
      z.zona AS zona,
      z.zona AS zona_oficial,
      p.zona_operativa AS zona_legacy,
      p.supervisor_zona AS supervisor,
      p.superintendente,
      p.estatus_ul_mes AS estatus_anterior,
      p.estatus_servicio AS estatus_actual,
      ${fechaCorteExpr} AS fecha_corte,
      ${filters.tipoExpr} AS tipo_movimiento
    FROM portafolio p
    INNER JOIN z_op z
      ON z.id_zona = p.zona_id
     AND z.estado = 1
    WHERE ${filters.where}
  `, filters.params);

  const latestSnapshotKeys = await latestWeeklySnapshotEquipmentKeys_uni();
  const visibleRows = candidateRows.filter(row => {
    if (row.tipo_movimiento !== 'NUEVO_INGRESO') return true;
    return latestSnapshotKeys instanceof Set
      && !latestSnapshotKeys.has(equipmentKey_uni(row.numero_equipo));
  });
  visibleRows.sort((left, right) => [
    'tipo_movimiento',
    'zona',
    'proyecto',
    'numero_equipo'
  ].reduce((result, key) => result || normalizeText_uni(left[key]).localeCompare(
    normalizeText_uni(right[key]),
    'es-MX',
    { sensitivity: 'base' }
  ), 0));
  const rows = visibleRows.slice(0, 1000);

  const kpis = visibleRows.reduce((acc, row) => {
    acc.total += 1;
    if (row.tipo_movimiento === 'DEGRADADO') acc.degradados += 1;
    else if (row.tipo_movimiento === 'RECUPERADO') acc.recuperados += 1;
    else if (row.tipo_movimiento === 'NUEVO_INGRESO') acc.ingresos += 1;
    else acc.cambios += 1;
    return acc;
  }, { total: 0, degradados: 0, recuperados: 0, cambios: 0, ingresos: 0 });

  const corte = visibleRows.map(row => row.fecha_corte).filter(Boolean).sort().pop() || null;

  return {
    ok: true,
    source: 'aiven',
    alcance,
    kpis,
    corte,
    filters: { zonas: alcance.zonas },
    data: rows
  };
}

async function getPortafolioMovimientosInicial_uni(req, res) {
  try {
    return res.json(await buildMonthlyPayload_uni(req));
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando carga inicial de Movimientos de Portafolio.',
      error: error.message
    });
  }
}

async function getPortafolioMovimientos_uni(req, res) {
  try {
    return res.json(await buildMonthlyPayload_uni(req));
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando movimientos de portafolio.',
      error: error.message
    });
  }
}

async function authorizedEquipmentMap_uni(req) {
  const access = buildPortafolioScopeSql_gnral(req, 'p');
  const [rows] = await db.query(`
    SELECT
      p.numero_equipo,
      p.zona_id,
      z.zona AS zona_oficial
    FROM portafolio p
    INNER JOIN z_op z
      ON z.id_zona = p.zona_id
     AND z.estado = 1
    WHERE p.estado_registro = 1
      AND NULLIF(TRIM(COALESCE(p.numero_equipo, '')), '') IS NOT NULL
      AND ${access.sql}
  `, access.params || []);

  const map = new Map();
  for (const row of rows) {
    const key = equipmentKey_uni(row.numero_equipo);
    if (!key) continue;
    map.set(key, {
      numero_equipo: normalizeText_uni(row.numero_equipo),
      zona_id: Number(row.zona_id),
      zona: normalizeText_uni(row.zona_oficial)
    });
  }
  return map;
}

function canonicalizeWeeklyMovement_uni(row, authorizedEquipmentMap, authorizedZoneMap) {
  const code = equipmentCodeFromJson_uni(row);
  const historicalZoneId = Number(row?.zona_id ?? row?.zona_id_oficial);

  // Cortes generados desde FASE 9 conservan zona_id historica dentro del JSON.
  // Esa zona es la primera autoridad para conservar exactitud temporal.
  if (Number.isInteger(historicalZoneId) && historicalZoneId > 0) {
    const historicalZone = authorizedZoneMap.get(historicalZoneId);
    if (!historicalZone) return null;
    return {
      ...row,
      equipo: code,
      numero_equipo: code,
      zona_legacy: row?.zona_legacy ?? row?.zona_operativa ?? null,
      zona_id_oficial: historicalZoneId,
      zona_oficial: historicalZone,
      zona: historicalZone
    };
  }

  // Compatibilidad fail-closed con cortes anteriores a FASE 9: si el JSON no
  // guardo zona_id, se valida el equipo contra su zona estructurada actual.
  const auth = authorizedEquipmentMap.get(equipmentKey_uni(code));
  if (!auth) return null;
  return {
    ...row,
    equipo: code || auth.numero_equipo,
    numero_equipo: code || auth.numero_equipo,
    zona_legacy: row?.zona ?? row?.zona_operativa ?? null,
    zona_id_oficial: auth.zona_id,
    zona_oficial: auth.zona,
    zona: auth.zona
  };
}

function countScopedSnapshot_uni(snapshotRows, authorizedEquipmentMap, authorizedZoneMap) {
  let total = 0;
  for (const row of snapshotRows) {
    const historicalZoneId = Number(row?.zona_id ?? row?.zona_id_oficial);
    if (Number.isInteger(historicalZoneId) && historicalZoneId > 0) {
      if (authorizedZoneMap.has(historicalZoneId)) total += 1;
      continue;
    }
    const key = equipmentKey_uni(equipmentCodeFromJson_uni(row));
    if (key && authorizedEquipmentMap.has(key)) total += 1;
  }
  return total;
}

function scopedMovementTotals_uni(rows) {
  return rows.reduce((acc, row) => {
    const type = movementType_uni(row);
    acc.total_movimientos += 1;
    if (type === 'DEGRADADO') acc.total_salidas += 1;
    else if (type === 'RECUPERADO') acc.total_regresos += 1;
    else if (type === 'NUEVO_INGRESO') acc.total_ingresos += 1;
    else acc.total_cambios += 1;
    return acc;
  }, {
    total_movimientos: 0,
    total_salidas: 0,
    total_regresos: 0,
    total_cambios: 0,
    total_ingresos: 0
  });
}

async function getPortafolioSemanasDisponibles_uni(req, res) {
  try {
    const alcance = await alcancePayload_uni(req);
    if (!alcance.zona_ids.length) {
      return res.json({ ok: true, source: 'aiven', alcance, total: 0, data: [] });
    }

    // El catalogo no expone conteos globales del snapshot; solo metadatos del corte.
    const [rows] = await db.query(`
      SELECT
        id_corte,
        anio_iso,
        semana_iso,
        fecha_inicio,
        fecha_fin,
        fecha_corte,
        estado
      FROM portafolio_cortes_semanales
      WHERE estado = 'CERRADO'
      ORDER BY anio_iso DESC, semana_iso DESC
    `);

    return res.json({
      ok: true,
      source: 'aiven',
      alcance,
      total: rows.length,
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando el catalogo de cortes semanales.',
      error: error.message
    });
  }
}

async function getPortafolioMovimientosSemanales_uni(req, res) {
  try {
    const anio = Number.parseInt(req.query?.anio, 10);
    const semana = Number.parseInt(req.query?.semana, 10);

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return res.status(400).json({ ok: false, message: 'El anio ISO es obligatorio y debe ser valido.' });
    }
    if (!Number.isInteger(semana) || semana < 1 || semana > 53) {
      return res.status(400).json({ ok: false, message: 'La semana ISO es obligatoria y debe estar entre 1 y 53.' });
    }

    const [rows] = await db.query(`
      SELECT
        id_corte,
        anio_iso,
        semana_iso,
        fecha_inicio,
        fecha_fin,
        fecha_corte,
        id_corte_anterior,
        total_portafolio,
        total_movimientos,
        total_salidas,
        total_regresos,
        total_cambios,
        total_ingresos,
        snapshot_json,
        movimientos_json,
        estado,
        hash_contenido,
        generado_por,
        created_at,
        updated_at
      FROM portafolio_cortes_semanales
      WHERE anio_iso = ?
        AND semana_iso = ?
        AND estado = 'CERRADO'
      LIMIT 1
    `, [anio, semana]);

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'No existe un corte semanal cerrado para el periodo solicitado.' });
    }

    const authorizedEquipmentMap = await authorizedEquipmentMap_uni(req);
    const authorizedZoneRows = await authorizedZoneRows_uni(req);
    const authorizedZoneMap = new Map(
      authorizedZoneRows.map(row => [Number(row.id_zona), normalizeText_uni(row.zona)])
    );
    const alcance = alcanceFromZoneRows_uni(authorizedZoneRows);
    const rawCut = rows[0];
    const allScoped = parseJsonArray_uni(rawCut.movimientos_json)
      .map(row => canonicalizeWeeklyMovement_uni(row, authorizedEquipmentMap, authorizedZoneMap))
      .filter(Boolean);
    const snapshotScoped = countScopedSnapshot_uni(
      parseJsonArray_uni(rawCut.snapshot_json),
      authorizedEquipmentMap,
      authorizedZoneMap
    );
    const totals = scopedMovementTotals_uni(allScoped);

    const search = normalizeText_uni(req.query?.search || req.query?.buscar).toLowerCase();
    const tipo = normalizeUpper_uni(req.query?.tipo);
    const tiposValidos = new Set(['DEGRADADO', 'RECUPERADO', 'CAMBIO', 'NUEVO_INGRESO']);

    let movimientos = allScoped;
    if (search) {
      movimientos = movimientos.filter(row => {
        const values = [
          row.proyecto,
          row.proyecto_codigo,
          row.equipo,
          row.numero_equipo,
          row.zona,
          row.supervisor
        ];
        return values.some(value => normalizeText_uni(value).toLowerCase().includes(search));
      });
    }
    if (tiposValidos.has(tipo)) {
      movimientos = movimientos.filter(row => movementType_uni(row) === tipo);
    }

    const corte = {
      ...rawCut,
      total_portafolio: snapshotScoped,
      ...totals
    };
    delete corte.snapshot_json;
    delete corte.movimientos_json;

    return res.json({
      ok: true,
      source: 'aiven',
      alcance,
      corte,
      total_filtrado: movimientos.length,
      data: movimientos
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando movimientos semanales de portafolio.',
      error: error.message
    });
  }
}

async function ejecutarCorteSemanalManual_uni(req, res) {
  try {
    const actor = req.actorUser || req.user || {};
    const generatedBy = Number(actor.id_SB || actor.id || actor.user_id) || null;
    const now = new Date();
    const due = latestDueSunday(now);
    const result = await runWeeklyClose(now, generatedBy, due);
    const alreadyClosed = result?.skipped && result.reason === 'already_closed';

    return res.json({
      ok: true,
      created: !result?.skipped,
      message: alreadyClosed
        ? `El corte de la semana ${result.semana_iso} ya estaba cerrado.`
        : `Corte semanal ${result.semana_iso} generado correctamente.`,
      corte: result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible generar el corte semanal manual.',
      error: error.message
    });
  }
}

async function getPortafolioMovimientoDetalle_uni(req, res) {
  const codigo = normalizeText_uni(req.params?.codigo);
  if (!codigo) {
    return res.status(400).json({ ok: false, message: 'No se recibio numero de equipo.' });
  }

  try {
    const access = buildPortafolioScopeSql_gnral(req, 'p');
    const [equipos] = await db.query(`
      SELECT
        p.id_portafolio,
        p.numero_equipo,
        p.proyecto,
        p.proyecto AS proyecto_codigo,
        COALESCE(NULLIF(TRIM(p.proyecto_cc_x_port), ''), p.proyecto) AS proyecto_nombre,
        p.ciudad,
        p.estado,
        p.id_equipo_ns,
        p.identificacion_sitio,
        p.estatus_servicio,
        p.estatus_cobranza,
        p.estatus_ul_mes,
        p.estatus_ul_mes_fecha,
        p.zona_id AS zona_id_oficial,
        z.zona AS zona,
        z.zona AS zona_oficial,
        p.zona_operativa AS zona_legacy,
        p.supervisor_zona AS supervisor,
        p.superintendente,
        p.direccion,
        p.fecha_instalacion,
        p.fecha_entrega,
        p.termino_garantia,
        ${commercialClassificationSql_uni('p')} AS contrato,
        CASE
          WHEN UPPER(COALESCE(lt.estatus_equipo_final,'')) LIKE '%NO FUNC%' THEN 'Parado'
          ELSE 'Funcionando'
        END AS estado_operativo
      FROM portafolio p
      INNER JOIN z_op z
        ON z.id_zona = p.zona_id
       AND z.estado = 1
      ${latestTicketJoin_uni}
      WHERE p.estado_registro = 1
        AND TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)
        AND ${access.sql}
      ORDER BY p.id_portafolio DESC
      LIMIT 1
    `, [codigo, ...(access.params || [])]);

    if (!equipos.length) {
      return res.status(404).json({
        ok: false,
        message: 'Equipo no encontrado dentro de los cuartos autorizados.'
      });
    }

    const equipo = equipos[0];
    const projectScope = buildPortafolioScopeSql_gnral(req, 'p');
    const [proyectos] = await db.query(`
      SELECT
        p.proyecto,
        p.proyecto AS proyecto_codigo,
        COALESCE(NULLIF(MAX(TRIM(p.proyecto_cc_x_port)), ''), p.proyecto) AS proyecto_nombre,
        MAX(p.ciudad) AS ciudad,
        MAX(p.estado) AS estado,
        GROUP_CONCAT(DISTINCT z.zona ORDER BY z.zona SEPARATOR ' / ') AS zona,
        GROUP_CONCAT(DISTINCT z.zona ORDER BY z.zona SEPARATOR ' / ') AS zona_oficial,
        GROUP_CONCAT(DISTINCT CAST(p.zona_id AS CHAR) ORDER BY p.zona_id SEPARATOR ',') AS zona_ids_oficiales,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(p.supervisor_zona), '') ORDER BY p.supervisor_zona SEPARATOR ' / ') AS supervisor,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(p.superintendente), '') ORDER BY p.superintendente SEPARATOR ' / ') AS superintendente,
        COUNT(*) AS equipos,
        SUM(CASE WHEN UPPER(COALESCE(p.estatus_servicio,'')) LIKE '%NO EN SERVICIO%' THEN 1 ELSE 0 END) AS no_en_servicio,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(p.estatus_servicio,''))) IN ('en servicio','servicio') THEN 1 ELSE 0 END) AS en_servicio
      FROM portafolio p
      INNER JOIN z_op z
        ON z.id_zona = p.zona_id
       AND z.estado = 1
      WHERE p.estado_registro = 1
        AND ${projectScope.sql}
        AND UPPER(TRIM(COALESCE(p.proyecto, ''))) = UPPER(TRIM(?))
      GROUP BY p.proyecto
      LIMIT 1
    `, [...(projectScope.params || []), equipo.proyecto]);

    const [tickets] = await db.query(`
      SELECT
        t.ticket,
        t.codigo_equipo,
        t.equipo,
        t.folio,
        t.estado_ticket,
        t.estado,
        t.proyecto,
        t.descripcion,
        t.fecha_reporte,
        t.fecha_cierre,
        t.responsabilidad,
        t.causa_falla,
        t.causa,
        t.tiempo_llegada,
        t.tiempo_solucion,
        t.estatus_equipo_final,
        t.zona AS zona_legacy
      FROM tickets t
      WHERE TRIM(COALESCE(t.codigo_equipo, '')) = TRIM(?)
      ORDER BY t.fecha_reporte DESC, t.id DESC
      LIMIT 300
    `, [equipo.numero_equipo]);

    const canonicalTickets = tickets.map(ticket => ({
      ...ticket,
      zona_id_oficial: equipo.zona_id_oficial,
      zona_oficial: equipo.zona_oficial,
      zona: equipo.zona_oficial
    }));

    return res.json({
      ok: true,
      source: 'aiven',
      alcance: await alcancePayload_uni(req),
      data: {
        equipo,
        proyecto: proyectos[0] || null,
        tickets: canonicalTickets
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando detalle de movimiento de portafolio.',
      error: error.message
    });
  }
}

module.exports = {
  getPortafolioMovimientosInicial_uni,
  getPortafolioMovimientos_uni,
  getPortafolioSemanasDisponibles_uni,
  getPortafolioMovimientosSemanales_uni,
  ejecutarCorteSemanalManual_uni,
  getPortafolioMovimientoDetalle_uni
};
