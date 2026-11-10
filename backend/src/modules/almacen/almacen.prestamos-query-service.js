'use strict';

// Préstamos: lectura independiente de la tabla oficial en Aiven.
// No depende del lote Inventario 230 ni permite consultar fuera de las
// subsidiarias del usuario efectivo. La unica escritura humana permitida en
// este servicio es clasificar la empresa de responsables aun no conciliados.
const db = require('../../config/db');

const COMPANY_SQL = "REPLACE(REPLACE(REPLACE(UPPER(CONVERT(TRIM(p.empresa) USING utf8mb4)) COLLATE utf8mb4_unicode_ci, '.', ''), ' ', ''), ',', '')";
const RESPONSIBLE_SQL = "COALESCE(NULLIF(CONVERT(TRIM(p.responsable) USING utf8mb4) COLLATE utf8mb4_unicode_ci, ''), 'SIN RESPONSABLE')";
const MAX_QUERY = 120;
const PAGE_SIZE = 30;

// Costo oficial de Préstamos: ultimo precio de compra del catálogo publicado,
// relacionado exclusivamente por AG (numero_parte_fabricante_original).
// Si un mismo AG tiene precios distintos dentro del catálogo activo, el costo
// queda NULL para evitar escoger un valor arbitrario.
const CATALOG_COST_JOIN = `LEFT JOIN (
    SELECT
      UPPER(CONVERT(TRIM(c.numero_parte_fabricante_original) USING utf8mb4))
        COLLATE utf8mb4_unicode_ci AS ag_key,
      CASE
        WHEN COUNT(DISTINCT c.ultimo_precio_compra)=1
        THEN MAX(c.ultimo_precio_compra)
        ELSE NULL
      END AS costo_unitario_catalogo
    FROM almacen_ns_catalogo_articulos c
    WHERE c.id_lote=(
      SELECT l.id_lote
      FROM almacen_ns_lotes l
      WHERE l.tipo_fuente='CATALOGO_ARTICULOS'
        AND l.modo_carga='COMPLETA'
        AND l.estado='PUBLICADO'
        AND l.es_completo=1
        AND l.publicado_en IS NOT NULL
        AND l.filas_esperadas>0
        AND l.filas_esperadas=l.filas_recibidas
        AND l.filas_validas=l.filas_recibidas
      ORDER BY l.publicado_en DESC,l.id_lote DESC
      LIMIT 1
    )
      AND c.numero_parte_fabricante_original IS NOT NULL
      AND TRIM(c.numero_parte_fabricante_original)<>''
      AND c.ultimo_precio_compra IS NOT NULL
    GROUP BY
      UPPER(CONVERT(TRIM(c.numero_parte_fabricante_original) USING utf8mb4))
        COLLATE utf8mb4_unicode_ci
  ) cat
    ON cat.ag_key=
      UPPER(CONVERT(TRIM(p.ag) USING utf8mb4)) COLLATE utf8mb4_unicode_ci`;

const CATALOG_UNIT_COST_SQL = 'cat.costo_unitario_catalogo';
const CATALOG_TOTAL_COST_SQL = '(p.cantidad * cat.costo_unitario_catalogo)';

function failScope() {
  const e = new Error('No existe un alcance autorizado para consultar Préstamos.');
  e.status = 403;
  e.code = 'ALMACEN_NS_SCOPE_UNRESOLVED';
  throw e;
}

function companyKey(value) {
  return String(value == null ? '' : value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s.,]/g, '');
}

function authorizedCompanies(scope) {
  const ids = new Set((scope && Array.isArray(scope.subsidiaryIds)
    ? scope.subsidiaryIds : []).map(String));
  if (!ids.size || !Array.isArray(scope.subsidiaries)) failScope();
  const values = [];
  for (const item of scope.subsidiaries) {
    if (!ids.has(String(item.id))) failScope();
    for (const alias of [item.domain, ...(item.aliases || []), String(item.id)]) {
      const key = companyKey(alias);
      if (key && !values.includes(key)) values.push(key);
    }
  }
  if (!values.length) failScope();
  return values;
}

function loanWhere(scope, query = {}) {
  const companies = authorizedCompanies(scope);
  const clauses = [COMPANY_SQL + ' IN (?)'];
  const args = [companies];
  const company = String(query.company || '').trim().slice(0, 255);
  if (company && company !== 'todas') {
    clauses.push('p.empresa = ?');
    args.push(company);
  }
  const responsible = String(query.responsible || '').trim().slice(0, 255);
  if (responsible && responsible !== 'todos') {
    clauses.push(RESPONSIBLE_SQL + ' = ?');
    args.push(responsible);
  }
  const age = String(query.age || '').trim().slice(0, 80);
  if (age && age !== 'todas') {
    clauses.push("COALESCE(NULLIF(TRIM(p.antiguedad), ''), 'SIN CLASIFICAR') = ?");
    args.push(age);
  }
  const search = String(query.q || '').trim().slice(0, MAX_QUERY);
  if (search) {
    clauses.push('(p.nombre_articulo LIKE ? OR p.codigo LIKE ? OR p.ag LIKE ? OR p.sitio LIKE ? OR p.responsable LIKE ?)');
    for (let i = 0; i < 5; i++) args.push('%' + search + '%');
  }
  return { where: 'WHERE ' + clauses.join(' AND '), args };
}

function numeric(value) {
  return value == null ? null : Number(value);
}

const MANUAL_COMPANIES = Object.freeze([
  'United Elevadores',
  'Corellian SA de CV'
]);

function assignmentError(message, status, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function loanSource(scope, count) {
  const total = Number(count || 0);
  return {
    provider: 'AIVEN',
    tipoFuente: 'PRESTAMOS_AIVEN',
    archivoOrigen: 'Aiven · almacen_ns_prestamos',
    activo: true,
    loaded: total > 0,
    filas: total,
    datasets: {
      PRESTAMO: { filas: total, available: total > 0, hojaOrigen: 'Tabla almacen_ns_prestamos' }
    },
    scopeDomains: scope.domains || []
  };
}

const cdmxFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
});
function cdmxDate() {
  const parts = Object.fromEntries(cdmxFormatter.formatToParts(new Date())
    .filter(item => ['year', 'month', 'day'].includes(item.type))
    .map(item => [item.type, item.value]));
  return [parts.year, parts.month, parts.day].join('-');
}

async function getLoanCatalogs(scope) {
  const f = loanWhere(scope);
  const [companies, responsibles, ages] = await Promise.all([
    db.query('SELECT p.empresa AS empresa, COUNT(*) AS total FROM almacen_ns_prestamos p ' +
      f.where + ' GROUP BY p.empresa ORDER BY p.empresa', f.args),
    db.query('SELECT DISTINCT ' + RESPONSIBLE_SQL + ' AS responsable FROM almacen_ns_prestamos p ' +
      f.where + ' ORDER BY responsable', f.args),
    db.query("SELECT DISTINCT COALESCE(NULLIF(TRIM(p.antiguedad), ''), 'SIN CLASIFICAR') AS antiguedad " +
      'FROM almacen_ns_prestamos p ' + f.where + ' ORDER BY antiguedad', f.args)
  ]);
  const total = companies[0].reduce((sum, row) => sum + Number(row.total || 0), 0);
  return {
    ok: true, available: total > 0, kind: 'PRESTAMOS',
    source: loanSource(scope, total),
    companies: companies[0].map(row => row.empresa),
    responsibles: responsibles[0].map(row => row.responsable),
    ages: ages[0].map(row => row.antiguedad)
  };
}

async function getLoanSummary(scope, query = {}) {
  const f = loanWhere(scope, { company: query.company });
  const today = cdmxDate();
  const [stats, ages, responsibles] = await Promise.all([
    db.query('SELECT COUNT(*) AS articulos, SUM(p.cantidad) AS piezas, ' +
      'SUM(' + CATALOG_TOTAL_COST_SQL + ') AS valorTotal, COUNT(DISTINCT NULLIF(TRIM(p.responsable), \'\')) AS responsables ' +
      'FROM almacen_ns_prestamos p ' + CATALOG_COST_JOIN + ' ' + f.where, f.args),
    db.query("SELECT COALESCE(NULLIF(TRIM(p.antiguedad), ''), 'SIN CLASIFICAR') AS antiguedad, " +
      'COUNT(*) AS articulos, SUM(' + CATALOG_TOTAL_COST_SQL + ') AS valorTotal ' +
      'FROM almacen_ns_prestamos p ' + CATALOG_COST_JOIN + ' ' + f.where + ' GROUP BY antiguedad ORDER BY antiguedad', f.args),
    db.query('SELECT ' + RESPONSIBLE_SQL + ' AS responsable, COUNT(*) AS articulos, ' +
      'SUM(p.cantidad) AS cantidad, SUM(' + CATALOG_TOTAL_COST_SQL + ') AS valorTotal, ' +
      'MIN(p.fecha_evento) AS desde, ' +
      'CASE WHEN MIN(p.fecha_evento) IS NULL THEN NULL ELSE GREATEST(0, DATEDIFF(?, MIN(p.fecha_evento))) END AS diasPrestamo, ' +
      "COUNT(DISTINCT NULLIF(TRIM(p.sitio), '')) AS sitios " +
      'FROM almacen_ns_prestamos p ' + CATALOG_COST_JOIN + ' ' + f.where +
      ' GROUP BY responsable ORDER BY valorTotal DESC, responsable', [today, ...f.args])
  ]);
  const k = stats[0][0] || {};
  const totalValue = numeric(k.valorTotal);
  return {
    ok: true, available: Number(k.articulos || 0) > 0,
    kind: 'PRESTAMOS',
    source: loanSource(scope, k.articulos),
    kpis: {
      articulos: Number(k.articulos || 0),
      piezas: numeric(k.piezas),
      valorTotal: totalValue,
      responsables: Number(k.responsables || 0)
    },
    ages: ages[0].map(row => ({
      antiguedad: row.antiguedad,
      articulos: Number(row.articulos || 0),
      valorTotal: numeric(row.valorTotal)
    })),
    rows: responsibles[0].map(row => ({
      responsable: row.responsable,
      articulos: Number(row.articulos || 0),
      cantidad: numeric(row.cantidad),
      valorTotal: numeric(row.valorTotal),
      porcentaje: totalValue > 0 && row.valorTotal != null
        ? (Number(row.valorTotal) / totalValue) * 100 : null,
      diasPrestamo: numeric(row.diasPrestamo),
      desde: row.desde,
      sitios: Number(row.sitios || 0)
    }))
  };
}

async function getLoans(scope, query = {}) {
  const f = loanWhere(scope, query);
  const pg = Number(query.page);
  const page = Number.isInteger(pg) && pg >= 1 ? Math.min(pg, 1000000) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const today = cdmxDate();
  const [data, stats] = await Promise.all([
    db.query('SELECT p.id_prestamo AS id, p.id_articulo_ns AS idArticuloNs, ' +
      'p.nombre_articulo AS articulo, p.codigo, p.ag, p.empresa, ' +
      'p.responsable, p.sitio, p.cantidad, ' + CATALOG_TOTAL_COST_SQL + ' AS costo, ' +
      CATALOG_UNIT_COST_SQL + ' AS costoUnitario, p.fecha_evento AS fecha, ' +
      'CASE WHEN p.fecha_evento IS NULL THEN NULL ELSE GREATEST(0, DATEDIFF(?, p.fecha_evento)) END AS dias, ' +
      'p.antiguedad FROM almacen_ns_prestamos p ' + CATALOG_COST_JOIN + ' ' + f.where +
      ' ORDER BY p.id_prestamo DESC LIMIT ? OFFSET ?', [today, ...f.args, PAGE_SIZE, offset]),
    db.query('SELECT COUNT(*) AS articulos, SUM(p.cantidad) AS cantidad, ' +
      'SUM(' + CATALOG_TOTAL_COST_SQL + ') AS valorTotal FROM almacen_ns_prestamos p ' +
      CATALOG_COST_JOIN + ' ' + f.where, f.args)
  ]);
  const row = stats[0][0] || {};
  const total = Number(row.articulos || 0);
  return {
    ok: true, available: total > 0, kind: 'PRESTAMOS',
    source: loanSource(scope, total),
    rows: data[0].map(item => ({
      ...item, cantidad: numeric(item.cantidad),
      costo: numeric(item.costo), costoUnitario: numeric(item.costoUnitario),
      dias: numeric(item.dias)
    })),
    summary: {
      articulos: total,
      cantidad: numeric(row.cantidad),
      valorTotal: numeric(row.valorTotal)
    },
    pagination: {
      page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE))
    }
  };
}

async function getPendingCompanyAssignments(scope) {
  const [rows] = await db.query(
    `SELECT TRIM(p.responsable) AS responsable, COUNT(*) AS registros
       FROM almacen_ns_prestamos p
      WHERE (p.empresa IS NULL OR TRIM(p.empresa) = '')
        AND p.responsable IS NOT NULL
        AND TRIM(p.responsable) <> ''
      GROUP BY TRIM(p.responsable)
      ORDER BY registros DESC, responsable`
  );

  return {
    ok: true,
    available: true,
    rows: rows.map(row => ({
      responsable: row.responsable,
      registros: Number(row.registros || 0)
    }))
  };
}

async function assignLoanCompany(scope, input = {}) {
  const responsable = String(input.responsable || '').trim();
  const empresa = String(input.empresa || '').trim();

  if (!responsable || responsable.length > 255) {
    throw assignmentError(
      'Responsable requerido.',
      400,
      'ALMACEN_PRESTAMOS_RESPONSABLE_REQUIRED'
    );
  }
  if (!MANUAL_COMPANIES.includes(empresa)) {
    throw assignmentError(
      'Empresa no permitida para la asignacion manual.',
      400,
      'ALMACEN_PRESTAMOS_EMPRESA_INVALID'
    );
  }

  const [result] = await db.query(
    `UPDATE almacen_ns_prestamos
        SET empresa = ?
      WHERE id_prestamo > 0
        AND (empresa IS NULL OR TRIM(empresa) = '')
        AND TRIM(responsable) = ?`,
    [empresa, responsable]
  );

  const updated = Number(result && result.affectedRows || 0);
  if (!updated) {
    throw assignmentError(
      'No existen registros pendientes para este responsable.',
      404,
      'ALMACEN_PRESTAMOS_PENDIENTE_NOT_FOUND'
    );
  }

  return {ok:true, responsable, empresa, actualizados:updated};
}

module.exports = {
  getLoanCatalogs,
  getLoanSummary,
  getLoans,
  getPendingCompanyAssignments,
  assignLoanCompany
};
