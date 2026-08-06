'use strict';

const repository = require('./experimental-atencion-prioritaria.repository');

const ATRAPADOS_KEYWORDS_EXP = Object.freeze([
  'atrapado',
  'atrapada',
  'encerrado',
  'encerrada',
  'persona atrapada',
  'personas atrapadas',
  'rescate'
]);

const DEFAULT_HORAS_SIN_LLEGADA_EXP = 2;
const TIME_ZONE_EXP = 'America/Mexico_City';

function positiveInt_exp(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeFilter_exp(value) {
  return String(value || '').trim().slice(0, 150);
}

function buildOpenTicketFilters_exp(req, alias) {
  const tableAlias = alias || 't';
  const clauses = [
    `UPPER(TRIM(COALESCE(${tableAlias}.estado_ticket, ''))) NOT LIKE '%CERR%'`
  ];
  const params = [];

  const estado = normalizeFilter_exp(req.query && req.query.estado);
  const zona = normalizeFilter_exp(req.query && req.query.zona);

  if (estado) {
    clauses.push(`TRIM(COALESCE(${tableAlias}.estado, '')) = ?`);
    params.push(estado);
  }
  if (zona) {
    clauses.push(`TRIM(COALESCE(${tableAlias}.zona, '')) = ?`);
    params.push(zona);
  }

  return {
    where: clauses.join(' AND '),
    params,
    selected: { estado, zona }
  };
}

function getCriticidadCriteria_exp(req) {
  const configuredDays = Number(req.user && req.user.criticos_periodo) || 35;
  const configuredFailures = Number(req.user && req.user.criticos_fallas) || 3;

  return {
    dias: positiveInt_exp(
      req.query && (req.query.dias || req.query.periodo || req.query.criticos_periodo),
      configuredDays,
      1,
      3650
    ),
    minFallas: positiveInt_exp(
      req.query && (req.query.min_fallas || req.query.minFallas || req.query.fallas || req.query.criticos_fallas),
      configuredFailures,
      1,
      9999
    )
  };
}

function normalizeStatus_exp(value) {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  if (normalized.includes('cerr')) return 'Cerrado';
  if (normalized.includes('curso') || normalized.includes('proceso')) return 'En curso';
  if (normalized.includes('abier') || normalized.includes('pend')) return 'Abierto';
  return raw || 'Abierto';
}

function textBlob_exp(row) {
  return [row.descripcion, row.causa, row.accion_en_cierre]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isAtrapado_exp(row) {
  const blob = textBlob_exp(row);
  return ATRAPADOS_KEYWORDS_EXP.some((keyword) => blob.includes(keyword));
}

function dateParts_exp(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function timeParts_exp(value) {
  let text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'null') return null;

  text = text
    .replace(/^1899-12-3[01]T/i, '')
    .replace(/\.\d+Z?$/i, '')
    .trim();

  const ampm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const period = ampm[4].toUpperCase();
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return {
      hour,
      minute: Number(ampm[2]),
      second: Number(ampm[3] || 0)
    };
  }

  const military = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!military) return null;
  return {
    hour: Number(military[1]),
    minute: Number(military[2]),
    second: Number(military[3] || 0)
  };
}

function operationalEpoch_exp(dateValue, timeValue) {
  const date = dateParts_exp(dateValue);
  const time = timeParts_exp(timeValue);
  if (!date || !time) return null;
  return Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    time.second
  );
}

function operationalNowEpoch_exp() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE_EXP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(new Date());
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );
}

function elapsedMinutes_exp(row, nowEpoch) {
  const start = operationalEpoch_exp(row.fecha_reporte_fecha, row.h_reporte);
  if (start === null) return null;
  return Math.max(0, Math.round((nowEpoch - start) / 60000));
}

function hasArrivalTime_exp(row) {
  const value = String(row.h_llegada || '').trim().toLowerCase();
  return Boolean(value && value !== 'null' && value !== '—');
}

function mapTicket_exp(row, nowEpoch) {
  const minutes = elapsedMinutes_exp(row, nowEpoch);
  return {
    ticket: String(row.ticket || row.folio || row.id || '').trim(),
    estado_ticket: normalizeStatus_exp(row.estado_ticket),
    estado: String(row.estado || '').trim(),
    proyecto: String(row.proyecto || '').trim(),
    codigo_equipo: String(row.codigo_equipo || '').trim(),
    zona: String(row.zona || '').trim(),
    fecha_reporte: row.fecha_reporte_fecha || null,
    hora_reporte: String(row.h_reporte || '').trim() || null,
    hora_llegada: String(row.h_llegada || '').trim() || null,
    minutos_abierto: minutes,
    horas_abierto: minutes === null ? null : Number((minutes / 60).toFixed(1))
  };
}

function buildReincidenceLabel_exp(metrics) {
  const sevenDays = Number(metrics.llamadas_7d || 0);
  const thirtyDays = Number(metrics.llamadas_30d || 0);
  if (sevenDays > 1) return `Reincidencia ${sevenDays} en 7 días`;
  return `Reincidencia ${thirtyDays} en 30 días`;
}

async function getAtencionPrioritaria_exp(req) {
  const filters = buildOpenTicketFilters_exp(req, 't');
  const criteria = getCriticidadCriteria_exp(req);
  const nowEpoch = operationalNowEpoch_exp();

  const openTicketsSql = `
    SELECT
      t.id,
      t.ticket,
      t.folio,
      t.estado_ticket,
      t.estado,
      t.proyecto,
      t.codigo_equipo,
      t.zona,
      t.descripcion,
      t.causa,
      t.accion_en_cierre,
      DATE_FORMAT(t.fecha_reporte, '%Y-%m-%d') AS fecha_reporte_fecha,
      t.h_reporte,
      DATE_FORMAT(t.fecha_llegada, '%Y-%m-%d') AS fecha_llegada_fecha,
      t.h_llegada
    FROM tickets t
    WHERE ${filters.where}
    ORDER BY t.id DESC
  `;

  const filterCatalogSql = `
    SELECT catalogo.tipo, catalogo.valor
    FROM (
      SELECT 'ESTADO' AS tipo, TRIM(estado) AS valor
      FROM tickets
      WHERE estado IS NOT NULL AND TRIM(estado) <> ''
      GROUP BY TRIM(estado)
      UNION ALL
      SELECT 'ZONA' AS tipo, TRIM(zona) AS valor
      FROM tickets
      WHERE zona IS NOT NULL AND TRIM(zona) <> ''
      GROUP BY TRIM(zona)
    ) catalogo
    ORDER BY catalogo.tipo ASC, catalogo.valor ASC
  `;

  const criticalMetricsSql = `
    SELECT
      critical.codigo_equipo,
      critical.fallas_blt_periodo,
      SUM(CASE
        WHEN t.fecha_reporte IS NOT NULL
         AND DATE(t.fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        THEN 1 ELSE 0 END) AS llamadas_7d,
      SUM(CASE
        WHEN t.fecha_reporte IS NOT NULL
         AND DATE(t.fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        THEN 1 ELSE 0 END) AS llamadas_30d
    FROM (
      SELECT
        codigo_equipo,
        COUNT(*) AS fallas_blt_periodo
      FROM tickets
      WHERE codigo_equipo IS NOT NULL
        AND TRIM(codigo_equipo) <> ''
        AND fecha_reporte IS NOT NULL
        AND DATE(fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND UPPER(COALESCE(responsabilidad, '')) LIKE '%BLT%'
      GROUP BY codigo_equipo
      HAVING COUNT(*) >= ?
    ) critical
    LEFT JOIN tickets t
      ON t.codigo_equipo = critical.codigo_equipo
     AND t.fecha_reporte IS NOT NULL
     AND DATE(t.fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY critical.codigo_equipo, critical.fallas_blt_periodo
  `;

  const [openResult, catalogResult, metricsResult] = await Promise.all([
    repository.query(openTicketsSql, filters.params),
    repository.query(filterCatalogSql, []),
    repository.query(criticalMetricsSql, [criteria.dias, criteria.minFallas])
  ]);

  const openRows = openResult[0] || [];
  const catalogRows = catalogResult[0] || [];
  const metricsRows = metricsResult[0] || [];
  const mappedTickets = openRows.map((row) => ({
    raw: row,
    ticket: mapTicket_exp(row, nowEpoch)
  }));

  const atrapados = mappedTickets
    .filter(({ raw }) => isAtrapado_exp(raw))
    .map(({ ticket }) => ticket);

  const sinLlegada = mappedTickets
    .filter(({ raw, ticket }) => (
      !hasArrivalTime_exp(raw)
      && ticket.minutos_abierto !== null
      && ticket.minutos_abierto > DEFAULT_HORAS_SIN_LLEGADA_EXP * 60
    ))
    .map(({ ticket }) => ticket)
    .sort((a, b) => Number(b.minutos_abierto || 0) - Number(a.minutos_abierto || 0));

  const metricsByEquipment = new Map(
    metricsRows.map((row) => [String(row.codigo_equipo || '').trim(), row])
  );
  const seenEquipment = new Set();
  const criticosReincidentes = [];

  for (const item of mappedTickets) {
    const equipmentCode = item.ticket.codigo_equipo;
    if (!equipmentCode || seenEquipment.has(equipmentCode)) continue;
    const metrics = metricsByEquipment.get(equipmentCode);
    if (!metrics) continue;
    seenEquipment.add(equipmentCode);
    criticosReincidentes.push({
      ...item.ticket,
      fallas_blt_periodo: Number(metrics.fallas_blt_periodo || 0),
      llamadas_7d: Number(metrics.llamadas_7d || 0),
      llamadas_30d: Number(metrics.llamadas_30d || 0),
      reincidencia: buildReincidenceLabel_exp(metrics)
    });
  }

  const estados = catalogRows
    .filter((row) => row.tipo === 'ESTADO')
    .map((row) => String(row.valor || '').trim())
    .filter(Boolean);
  const zonas = catalogRows
    .filter((row) => row.tipo === 'ZONA')
    .map((row) => String(row.valor || '').trim())
    .filter(Boolean);

  return {
    ok: true,
    source: 'aiven',
    criteria: {
      horas_sin_llegada: DEFAULT_HORAS_SIN_LLEGADA_EXP,
      dias_criticidad: criteria.dias,
      min_fallas_blt: criteria.minFallas,
      responsabilidad_criticidad: 'BLT'
    },
    selected_filters: filters.selected,
    filters: { estados, zonas },
    counts: {
      atrapados: atrapados.length,
      sin_llegada: sinLlegada.length,
      criticos_reincidentes: criticosReincidentes.length
    },
    data: {
      atrapados,
      sin_llegada: sinLlegada,
      criticos_reincidentes: criticosReincidentes
    },
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  getAtencionPrioritaria_exp
};
