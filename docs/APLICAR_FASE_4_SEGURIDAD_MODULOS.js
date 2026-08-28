'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = process.cwd();
const EXPECTED_HEAD = '4270448f0242df1b17ffe5073b59e0185a62bd1f';

const PATCH_FILES = [
  'backend/src/controllers/data.controller.legacy.js',
  'backend/src/modules/proyectos/proyectos.service.js',
  'backend/src/modules/instalaciones-reporte/instalaciones-reporte.service.js',
  'backend/src/modules/portafolio/portafolio-comercial_uni.js',
  'backend/src/modules/criticos/criticos.service.js',
  'backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js',
  'backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js'
];

const DELIVERED_JS_FILES = [
  'backend/src/middleware/information-access-gnral.middleware.js',
  'backend/src/services/information-record-scope-gnral.service.js',
  'backend/src/modules/tickets/tickets.routes.js',
  'backend/src/modules/portafolio/portafolio.routes.js',
  'backend/src/modules/proyectos/proyectos.routes.js',
  'backend/src/modules/ventas-clientes/ventas-clientes.routes.js',
  'backend/src/modules/ventas-prospeccion/ventas-prospeccion.routes.js',
  'backend/src/modules/ventas-redes/ventas-redes.routes.js',
  'backend/src/routes/ins-fl.routes.js',
  'backend/src/modules/instalaciones-reporte/instalaciones-reporte.routes.js',
  'backend/src/modules/instalaciones-reporte/instalaciones-reporte.controller.js',
  'backend/src/modules/instalaciones-reporte/instalaciones-reporte.repository.js',
  'backend/src/modules/instalaciones-pmm/instalaciones-pmm.routes.js',
  'backend/src/modules/instalaciones-pmm/instalaciones-pmm.controller.js',
  'backend/src/modules/instalaciones-pmm/instalaciones-pmm.service.js',
  'backend/src/modules/dashboard-operativo/dashboard-operativo.routes.js',
  'backend/src/modules/dashboard-operativo/dashboard-operativo.controller.js',
  'backend/src/modules/dashboard-operativo/dashboard-operativo.service.js',
  'backend/src/modules/dashboard-operativo/dashboard-operativo.repository.js',
  'backend/src/modules/criticos/criticos.routes.js',
  'backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.routes.js',
  'backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js',
  'backend/src/modules/experimental-dashboard-call-center/experimental-dashboard-call-center.routes.js',
  'backend/src/modules/experimental-dashboard-call-center/experimental-dashboard-call-center.service.js',
  'backend/src/modules/experimental-equipos-criticos/experimental-equipos-criticos.routes.js',
  'backend/src/modules/experimental-proyectos-criticos/experimental-proyectos-criticos.routes.js',
  'backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.routes.js',
  'backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.routes.js'
];

function fatal(message) {
  console.error(`FASE 4 DETENIDA: ${message}`);
  process.exit(1);
}

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  const file = absolute(relativePath);
  if (!fs.existsSync(file)) fatal(`No existe ${relativePath}.`);
  return fs.readFileSync(file, 'utf8');
}

function assertRepoBase() {
  let head;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (error) {
    fatal('Ejecuta este aplicador desde la raiz del repositorio Git.');
  }
  if (head !== EXPECTED_HEAD) {
    fatal(`HEAD inesperado. Esperado ${EXPECTED_HEAD}; actual ${head}. No se aplico ningun parche grande.`);
  }

  for (const relativePath of PATCH_FILES) {
    try {
      execFileSync('git', ['diff', '--quiet', '--', relativePath], { cwd: ROOT, stdio: 'ignore' });
      execFileSync('git', ['diff', '--cached', '--quiet', '--', relativePath], { cwd: ROOT, stdio: 'ignore' });
    } catch (error) {
      fatal(`${relativePath} tiene cambios locales. No se sobrescribira.`);
    }
  }
}

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) fatal(`No se encontro ancla ${label}.`);
  if (text.indexOf(needle, first + needle.length) >= 0) fatal(`Ancla ambigua ${label}.`);
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
}

function section(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) fatal(`No se encontro inicio ${label}.`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) fatal(`No se encontro fin ${label}.`);
  return { start, end, value: text.slice(start, end) };
}

function replaceSection(text, startMarker, endMarker, transform, label) {
  const found = section(text, startMarker, endMarker, label);
  const next = transform(found.value);
  if (!next || next === found.value) fatal(`El parche ${label} no produjo cambios.`);
  return text.slice(0, found.start) + next + text.slice(found.end);
}

function patchLegacy(source) {
  let text = source;
  text = replaceOnce(
    text,
    "const notificationService = require('../services/notifications/notification.service');\n",
    "const notificationService = require('../services/notifications/notification.service');\nconst informationRecordScope = require('../services/information-record-scope-gnral.service');\n",
    'legacy import informationRecordScope'
  );

  text = replaceOnce(
    text,
    "  return { where: clauses.join(' AND '), params };\n}\n\nconst latestTicketJoin",
    "  const informationScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, a);\n  clauses.push(informationScope.sql);\n  params.push(...informationScope.params);\n\n  return { where: clauses.join(' AND '), params };\n}\n\nconst latestTicketJoin",
    'legacy portafolioFilters scope'
  );

  text = replaceSection(
    text,
    'async function getPortafolioMovimientos(req, res) {',
    '\n\nfunction parseJsonArray',
    (value) => {
      let out = value;
      out = replaceOnce(
        out,
        "    const zona = likeParam(req.query.zona);\n",
        "    const informationScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');\n    clauses.push(informationScope.sql);\n    params.push(...informationScope.params);\n\n    const zona = likeParam(req.query.zona);\n",
        'movimientos scope insert'
      );
      out = replaceOnce(
        out,
        "      WHERE p.estado_registro = 1\n        AND p.zona_operativa IS NOT NULL\n",
        "      WHERE p.estado_registro = 1\n        AND ${informationScope.sql}\n        AND p.zona_operativa IS NOT NULL\n",
        'movimientos zonas where'
      );
      out = replaceOnce(
        out,
        "      ORDER BY p.zona_operativa ASC\n    `);",
        "      ORDER BY p.zona_operativa ASC\n    `, informationScope.params);",
        'movimientos zonas params'
      );
      return out;
    },
    'getPortafolioMovimientos'
  );

  text = replaceSection(
    text,
    'async function getPortafolioFiltros(req, res) {',
    '\n\nasync function getPortafolioMovimientoDetalle',
    (value) => {
      let out = replaceOnce(
        value,
        '  try {\n',
        "  try {\n    const informationScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');\n",
        'portafolio filtros scope'
      );
      out = out.replace(
        'FROM portafolio\n      WHERE estado_registro = 1 AND zona_operativa IS NOT NULL',
        'FROM portafolio p\n      WHERE p.estado_registro = 1 AND ${informationScope.sql} AND p.zona_operativa IS NOT NULL'
      );
      out = out.replace(
        'FROM portafolio\n      WHERE estado_registro = 1 AND supervisor_zona IS NOT NULL',
        'FROM portafolio p\n      WHERE p.estado_registro = 1 AND ${informationScope.sql} AND p.supervisor_zona IS NOT NULL'
      );
      out = out.replace(
        'WHERE p.estado_registro = 1\n        AND COALESCE',
        'WHERE p.estado_registro = 1\n        AND ${informationScope.sql}\n        AND COALESCE'
      );
      let count = 0;
      out = out.replace(/\n    `\);/g, (match) => {
        count += 1;
        return '\n    `, informationScope.params);';
      });
      if (count !== 3) fatal(`getPortafolioFiltros esperaba 3 consultas; encontro ${count}.`);
      return out;
    },
    'getPortafolioFiltros'
  );

  text = replaceSection(
    text,
    'async function getPortafolioEquipoDetalle(req, res) {',
    '\n\nasync function getPortafolioEquipoTicketsLote',
    (value) => {
      const marker = '// CORELLIAN: la llave compuesta proyecto|||referencia_sitio conserva su flujo propio.';
      const at = value.indexOf(marker);
      if (at < 0) fatal('No se encontro bloque CORELLIAN de detalle de equipo.');
      const head = value.slice(0, at);
      let tail = value.slice(at);
      tail = replaceOnce(
        tail,
        '    const [insRows] = await db.query(`\n',
        "    const installationScope = informationRecordScope.buildInsFlScopeSql_gnral(req, 'f');\n    const [insRows] = await db.query(`\n",
        'detalle corellian scope'
      );
      tail = replaceOnce(
        tail,
        "        AND TRIM(UPPER(COALESCE(f.referencia_sitio, ''))) = TRIM(UPPER(?))\n      ORDER BY f.id_ins_fl DESC\n    `, [proyectoOrigen, proyectoOrigen, referenciaOrigen]);",
        "        AND TRIM(UPPER(COALESCE(f.referencia_sitio, ''))) = TRIM(UPPER(?))\n        AND ${installationScope.sql}\n      ORDER BY f.id_ins_fl DESC\n    `, [proyectoOrigen, proyectoOrigen, referenciaOrigen, ...installationScope.params]);",
        'detalle corellian sql'
      );
      tail = replaceOnce(
        tail,
        "    const proyectoNombre = instalaciones[0]?.proyecto || proyectoOrigen;\n    const [manttoRows] = await db.query(`\n      SELECT ${portafolioBaseSelect}\n      FROM portafolio p\n      ${latestTicketJoin}\n      WHERE TRIM(UPPER(COALESCE(p.proyecto, ''))) = TRIM(UPPER(?))\n        AND TRIM(UPPER(COALESCE(p.identificacion_sitio, ''))) = TRIM(UPPER(?))\n      LIMIT 1\n    `, [proyectoNombre, referenciaOrigen]);\n\n    const mantenimiento = manttoRows[0] || null;\n",
        "    // CORELLIAN no consulta Portafolio United desde este detalle.\n    // La relacion cruzada solo se resolvera por el flujo global autorizado correspondiente.\n    const mantenimiento = null;\n",
        'detalle corellian no United query'
      );
      return head + tail;
    },
    'getPortafolioEquipoDetalle'
  );

  text = replaceSection(
    text,
    'async function getTickets(req, res) {',
    '\n\nasync function getTicketDetalle',
    (value) => {
      let out = replaceOnce(
        value,
        '  try {\n',
        "  try {\n    const informationScope = informationRecordScope.buildTicketScopeSql_gnral(req, 't');\n",
        'tickets scope'
      );
      out = replaceOnce(out, '      SELECT *\n      FROM tickets\n      ORDER BY id DESC', '      SELECT t.*\n      FROM tickets t\n      WHERE ${informationScope.sql}\n      ORDER BY t.id DESC', 'tickets sql');
      out = replaceOnce(out, '      LIMIT 50000\n    `);', '      LIMIT 50000\n    `, informationScope.params);', 'tickets params');
      return out;
    },
    'getTickets'
  );

  text = replaceSection(
    text,
    'async function getPortafolio(req, res) {',
    '\n\nasync function getEquipos',
    (value) => {
      let out = replaceOnce(
        value,
        '  try {\n',
        "  try {\n    const informationScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');\n",
        'raw portafolio scope'
      );
      out = replaceOnce(out, '      SELECT *\n      FROM portafolio\n      LIMIT 50000', '      SELECT p.*\n      FROM portafolio p\n      WHERE ${informationScope.sql}\n      LIMIT 50000', 'raw portafolio sql');
      out = replaceOnce(out, '      LIMIT 50000\n    `);', '      LIMIT 50000\n    `, informationScope.params);', 'raw portafolio params');
      return out;
    },
    'getPortafolio'
  );

  return text;
}

function patchPortafolioCommercial(source) {
  let text = source;
  text = replaceOnce(
    text,
    "const db = require('../../config/db');\n",
    "const db = require('../../config/db');\nconst informationRecordScope = require('../../services/information-record-scope-gnral.service');\n",
    'portafolio commercial import'
  );
  text = replaceOnce(
    text,
    "  return { where: clauses.join(' AND '), params };\n}\n\nfunction portafolioBaseSelect_uni",
    "  const informationScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, alias);\n  clauses.push(informationScope.sql);\n  params.push(...informationScope.params);\n\n  return { where: clauses.join(' AND '), params };\n}\n\nfunction portafolioBaseSelect_uni",
    'portafolio commercial scope'
  );
  return text;
}

function patchProjects(source) {
  let text = source;
  text = replaceOnce(
    text,
    "const db = { query: (...args) => proyectosRepository.query(...args) };\n",
    "const db = { query: (...args) => proyectosRepository.query(...args) };\nconst informationRecordScope = require('../../services/information-record-scope-gnral.service');\n",
    'proyectos import scope'
  );

  text = replaceOnce(
    text,
    "  return { where: clauses.join(' AND '), params };\n}\n\nasync function getProyectosFiltros",
    "  const informationScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, a);\n  clauses.push(informationScope.sql);\n  params.push(...informationScope.params);\n\n  return { where: clauses.join(' AND '), params };\n}\n\nasync function getProyectosFiltros",
    'proyectosFilters scope'
  );

  text = replaceSection(
    text,
    'async function getProyectosFiltros(req, res) {',
    '\n\nasync function getProyectos(req, res) {',
    (value) => {
      let out = replaceOnce(
        value,
        '  try {\n',
        "  try {\n    const informationScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');\n",
        'proyectos filtros scope'
      );
      out = out.replace(
        "FROM portafolio\n      WHERE estado_registro = 1 AND zona_operativa IS NOT NULL AND zona_operativa <> ''",
        "FROM portafolio p\n      WHERE p.estado_registro = 1 AND ${informationScope.sql} AND p.zona_operativa IS NOT NULL AND p.zona_operativa <> ''"
      );
      out = out.replace(
        "FROM portafolio\n      WHERE estado_registro = 1 AND estado IS NOT NULL AND estado <> ''",
        "FROM portafolio p\n      WHERE p.estado_registro = 1 AND ${informationScope.sql} AND p.estado IS NOT NULL AND p.estado <> ''"
      );
      out = out.replace(
        "FROM portafolio\n      WHERE estado_registro = 1 AND supervisor_zona IS NOT NULL AND supervisor_zona <> ''",
        "FROM portafolio p\n      WHERE p.estado_registro = 1 AND ${informationScope.sql} AND p.supervisor_zona IS NOT NULL AND p.supervisor_zona <> ''"
      );
      let count = 0;
      out = out.replace(/\n    `\);/g, () => {
        count += 1;
        return '\n    `, informationScope.params);';
      });
      if (count !== 3) fatal(`getProyectosFiltros esperaba 3 consultas; encontro ${count}.`);
      return out;
    },
    'getProyectosFiltros'
  );

  text = replaceSection(
    text,
    'async function getProyectoDetalle(req, res) {',
    '\n\nasync function getPortafolioProyectoDetalle',
    (value) => {
      let out = value;
      out = replaceOnce(
        out,
        "    const filtroVisible = soloPortafolio\n      ? 'p.estado_registro = 1'\n      : \"p.estado_registro = 1 AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))\";\n    const filtroVisibleSubquery = soloPortafolio\n      ? 'estado_registro = 1'\n      : \"estado_registro = 1 AND (inactivo IS NULL OR UPPER(inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))\";",
        "    const informationScopeMain = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql;\n    const informationScopeSubquery = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, '').sql;\n    const filtroVisible = soloPortafolio\n      ? `p.estado_registro = 1 AND ${informationScopeMain}`\n      : `p.estado_registro = 1 AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO')) AND ${informationScopeMain}`;\n    const filtroVisibleSubquery = soloPortafolio\n      ? `estado_registro = 1 AND ${informationScopeSubquery}`\n      : `estado_registro = 1 AND (inactivo IS NULL OR UPPER(inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO')) AND ${informationScopeSubquery}`;",
        'proyecto detalle scoped filters'
      );

      out = replaceOnce(
        out,
        "      const instalacion = await getProyectoInstalacionDetalle(proyectoSolicitado);\n      if (instalacion) return res.json(instalacion);\n      return res.status(404).json({ ok: false, message: 'Proyecto no encontrado en Portafolio ni en Instalaciones.' });",
        "      return res.status(404).json({ ok: false, message: 'Proyecto no encontrado en Portafolio.' });",
        'proyecto no cross company fallback'
      );

      out = replaceOnce(
        out,
        "      WHERE p.estado_registro = 1\n        AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE'))\n        AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'",
        "      WHERE ${filtroVisible}\n        AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'",
        'proyecto critical period scope'
      );
      return out;
    },
    'getProyectoDetalle'
  );

  return text;
}

function patchReportService(source) {
  let text = source;
  text = replaceOnce(text, 'async function getReport(query) {', 'async function getReport(query, informationAccess = null) {', 'reporte getReport signature');
  text = replaceOnce(text, '    repository.getDeliveredYears(),', '    repository.getDeliveredYears(informationAccess),', 'reporte years scope');
  text = replaceOnce(text, '    repository.listReportRows(filters, deliveredYear),', '    repository.listReportRows(filters, deliveredYear, informationAccess),', 'reporte rows scope');
  text = replaceOnce(text, '    repository.countReportRowsByStatus(filters, deliveredYear),', '    repository.countReportRowsByStatus(filters, deliveredYear, informationAccess),', 'reporte counts scope');
  text = replaceOnce(text, '    repository.getFilterOptions(deliveredYear),', '    repository.getFilterOptions(deliveredYear, informationAccess),', 'reporte options scope');
  return text;
}


function patchCriticosService(source) {
  let text = source;
  text = replaceOnce(
    text,
    "const db = require('./criticos.repository');\n",
    "const db = require('./criticos.repository');\nconst informationRecordScope = require('../../services/information-record-scope-gnral.service');\n",
    'criticos import informationRecordScope'
  );

  text = replaceSection(
    text,
    'function buildOptionalFilters(req, alias, portAlias) {',
    '\nasync function getEquiposCriticos',
    (value) => {
      let out = replaceOnce(
        value,
        '  const clauses = [];\n  const params = [];',
        "  const portafolioScope = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, portAlias).sql;\n  const clauses = [portafolioScope];\n  const params = [];",
        'criticos optional filters scope'
      );
      return out;
    },
    'criticos buildOptionalFilters'
  );

  text = replaceSection(
    text,
    'async function getProyectosCriticos(req, res) {',
    '\nasync function getProyectoCriticoTickets',
    (value) => {
      let out = replaceOnce(
        value,
        '  const activePortafolioWhere = `\n',
        "  const informationScope = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql;\n  const activePortafolioWhere = `\n",
        'criticos proyectos scope init'
      );
      out = replaceOnce(
        out,
        "    AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'\n  `;",
        "    AND UPPER(TRIM(COALESCE(p.estatus_servicio,''))) NOT LIKE '%NO EN SERVICIO%'\n    AND ${informationScope}\n  `;",
        'criticos proyectos active portfolio scope'
      );
      return out;
    },
    'criticos getProyectosCriticos'
  );

  text = replaceSection(
    text,
    'async function getProyectoCriticoTickets(req, res) {',
    '\nasync function getMtbcEquipos',
    (value) => {
      let out = replaceOnce(
        value,
        "  if (!proyecto) return res.status(400).json({ ok: false, message: 'No se recibio proyecto.' });\n\n  try {",
        "  if (!proyecto) return res.status(400).json({ ok: false, message: 'No se recibio proyecto.' });\n  const informationScope = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql;\n\n  try {",
        'criticos project tickets scope init'
      );
      out = replaceOnce(
        out,
        "      WHERE ${portafolioOperativo('p')}\n        AND p.proyecto = ?",
        "      WHERE ${portafolioOperativo('p')}\n        AND ${informationScope}\n        AND p.proyecto = ?",
        'criticos project tickets scope where'
      );
      return out;
    },
    'criticos getProyectoCriticoTickets'
  );

  text = replaceSection(
    text,
    'async function getMtbcProyectos(req, res) {',
    '\nfunction buildCallCenterU365TicketAggregate',
    (value) => replaceOnce(
      value,
      '  const clauses = [];\n  const params = [];',
      "  const clauses = [informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql];\n  const params = [];",
      'criticos mtbc proyectos scope'
    ),
    'criticos getMtbcProyectos'
  );

  text = replaceOnce(
    text,
    'function callCenterActivePortfolioSql() {\n  return `',
    "function callCenterActivePortfolioSql(req) {\n  const informationScope = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql;\n  return `",
    'criticos callcenter active portfolio signature'
  );
  text = replaceOnce(
    text,
    "    WHERE ${portafolioOperativo('p')}\n      AND p.numero_equipo IS NOT NULL",
    "    WHERE ${portafolioOperativo('p')}\n      AND ${informationScope}\n      AND p.numero_equipo IS NOT NULL",
    'criticos callcenter active portfolio scope'
  );
  const activePortfolioCallCount = (text.match(/callCenterActivePortfolioSql\(\);/g) || []).length;
  if (activePortfolioCallCount !== 2) fatal(`Criticos esperaba 2 llamadas a callCenterActivePortfolioSql(); encontro ${activePortfolioCallCount}.`);
  text = text.replace(/callCenterActivePortfolioSql\(\);/g, 'callCenterActivePortfolioSql(req);');

  text = replaceSection(
    text,
    'async function getCriticidadCorporativa(req, res) {',
    '\nmodule.exports =',
    (value) => {
      let out = replaceOnce(
        value,
        '  const { dias, minFallas } = getUserCriticidadCriteria(req);\n\n  try {',
        "  const { dias, minFallas } = getUserCriticidadCriteria(req);\n  const informationScope = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql;\n\n  try {",
        'criticos corporativa scope init'
      );
      const needle = "      WHERE ${portafolioOperativo('p')}\n        AND t.codigo_equipo IS NOT NULL";
      const occurrences = out.split(needle).length - 1;
      if (occurrences !== 2) fatal(`Criticidad corporativa esperaba 2 consultas Portafolio; encontro ${occurrences}.`);
      out = out.split(needle).join("      WHERE ${portafolioOperativo('p')}\n        AND ${informationScope}\n        AND t.codigo_equipo IS NOT NULL");
      return out;
    },
    'criticos getCriticidadCorporativa'
  );

  return text;
}


function patchExperimentalAtencionPrioritaria(source) {
  let text = source;
  text = replaceOnce(
    text,
    "const repository = require('./experimental-atencion-prioritaria.repository');\n",
    "const repository = require('./experimental-atencion-prioritaria.repository');\nconst informationRecordScope = require('../../services/information-record-scope-gnral.service');\n",
    'experimental atencion import scope'
  );

  text = replaceSection(
    text,
    'function buildOpenTicketFilters_exp(req, alias) {',
    '\nfunction getCriticidadCriteria_exp',
    (value) => replaceOnce(
      value,
      "  const clauses = ['1=1'];\n  const params = [];",
      "  const ticketScope = informationRecordScope.buildTicketScopeSql_gnral(req, tableAlias);\n  const clauses = ['1=1', ticketScope.sql];\n  const params = [...ticketScope.params];",
      'experimental atencion open tickets scope'
    ),
    'experimental atencion buildOpenTicketFilters'
  );

  text = replaceSection(
    text,
    'async function getAtencionPrioritaria_exp(req) {',
    '\nmodule.exports =',
    (value) => {
      let out = replaceOnce(
        value,
        "  const filters = buildOpenTicketFilters_exp(req, 't');\n",
        "  const filters = buildOpenTicketFilters_exp(req, 't');\n  const ticketScopeInlineT = informationRecordScope.buildTicketScopeSqlInline_gnral(req, 't').sql;\n  const ticketScopeInlineTc = informationRecordScope.buildTicketScopeSqlInline_gnral(req, 'tc').sql;\n",
        'experimental atencion inline scopes'
      );
      out = replaceOnce(
        out,
        "      SELECT 'ESTADO' AS tipo, TRIM(estado) AS valor\n      FROM tickets\n      WHERE estado IS NOT NULL AND TRIM(estado) <> ''\n      GROUP BY TRIM(estado)",
        "      SELECT 'ESTADO' AS tipo, TRIM(t.estado) AS valor\n      FROM tickets t\n      WHERE ${ticketScopeInlineT}\n        AND t.estado IS NOT NULL AND TRIM(t.estado) <> ''\n      GROUP BY TRIM(t.estado)",
        'experimental atencion catalog estado scope'
      );
      out = replaceOnce(
        out,
        "      SELECT 'ZONA' AS tipo, TRIM(zona) AS valor\n      FROM tickets\n      WHERE zona IS NOT NULL AND TRIM(zona) <> ''\n      GROUP BY TRIM(zona)",
        "      SELECT 'ZONA' AS tipo, TRIM(t.zona) AS valor\n      FROM tickets t\n      WHERE ${ticketScopeInlineT}\n        AND t.zona IS NOT NULL AND TRIM(t.zona) <> ''\n      GROUP BY TRIM(t.zona)",
        'experimental atencion catalog zona scope'
      );
      out = replaceOnce(
        out,
        "      SELECT\n        codigo_equipo,\n        COUNT(*) AS fallas_blt_periodo\n      FROM tickets\n      WHERE codigo_equipo IS NOT NULL\n        AND TRIM(codigo_equipo) <> ''\n        AND fecha_reporte IS NOT NULL\n        AND DATE(fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)\n        AND UPPER(COALESCE(responsabilidad, '')) LIKE '%BLT%'\n      GROUP BY codigo_equipo",
        "      SELECT\n        tc.codigo_equipo,\n        COUNT(*) AS fallas_blt_periodo\n      FROM tickets tc\n      WHERE ${ticketScopeInlineTc}\n        AND tc.codigo_equipo IS NOT NULL\n        AND TRIM(tc.codigo_equipo) <> ''\n        AND tc.fecha_reporte IS NOT NULL\n        AND DATE(tc.fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)\n        AND UPPER(COALESCE(tc.responsabilidad, '')) LIKE '%BLT%'\n      GROUP BY tc.codigo_equipo",
        'experimental atencion critical inner scope'
      );
      out = replaceOnce(
        out,
        "     AND DATE(t.fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)\n    GROUP BY critical.codigo_equipo",
        "     AND DATE(t.fecha_reporte) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)\n     AND ${ticketScopeInlineT}\n    GROUP BY critical.codigo_equipo",
        'experimental atencion critical outer scope'
      );
      return out;
    },
    'experimental atencion service'
  );

  return text;
}

function patchExperimentalEntregasRecientes(source) {
  let text = source;
  text = replaceOnce(
    text,
    "const repository = require('./experimental-entregas-recientes.repository');\n",
    "const repository = require('./experimental-entregas-recientes.repository');\nconst informationRecordScope = require('../../services/information-record-scope-gnral.service');\n",
    'experimental entregas import scope'
  );

  text = replaceSection(
    text,
    'async function getEntregasRecientes_exp(req) {',
    '\nmodule.exports =',
    (value) => {
      let out = replaceOnce(
        value,
        "  const equipmentParams = [months];\n  if (estado)",
        "  const equipmentParams = [months];\n  const portfolioScope = informationRecordScope.buildPortafolioScopeSql_gnral(req, 'p');\n  const portfolioScopeInline = informationRecordScope.buildPortafolioScopeSqlInline_gnral(req, 'p').sql;\n  equipmentClauses.push(portfolioScope.sql);\n  equipmentParams.push(...portfolioScope.params);\n  if (estado)",
        'experimental entregas portfolio scope init'
      );
      const estadoCatalog = "      WHERE p.estado_registro = 1\n        AND ${receptionDate} IS NOT NULL";
      const occurrences = out.split(estadoCatalog).length - 1;
      if (occurrences !== 2) fatal(`Entregas Recientes esperaba 2 bloques de catalogo Portafolio; encontro ${occurrences}.`);
      out = out.split(estadoCatalog).join(
        "      WHERE p.estado_registro = 1\n        AND ${portfolioScopeInline}\n        AND ${receptionDate} IS NOT NULL"
      );
      return out;
    },
    'experimental entregas service'
  );

  return text;
}

function checkSyntax(relativePath, content) {
  const temp = path.join(os.tmpdir(), `fase4_${path.basename(relativePath)}_${process.pid}.js`);
  fs.writeFileSync(temp, content, 'utf8');
  const result = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
  try { fs.unlinkSync(temp); } catch (_error) {}
  if (result.status !== 0) {
    fatal(`Sintaxis invalida en ${relativePath}:\n${result.stderr || result.stdout}`);
  }
}

function validateDeliveredFiles() {
  for (const relativePath of DELIVERED_JS_FILES) {
    const content = read(relativePath);
    checkSyntax(relativePath, content);
  }
}

function main() {
  assertRepoBase();
  validateDeliveredFiles();

  const patches = new Map([
    ['backend/src/controllers/data.controller.legacy.js', patchLegacy],
    ['backend/src/modules/proyectos/proyectos.service.js', patchProjects],
    ['backend/src/modules/instalaciones-reporte/instalaciones-reporte.service.js', patchReportService],
    ['backend/src/modules/portafolio/portafolio-comercial_uni.js', patchPortafolioCommercial],
    ['backend/src/modules/criticos/criticos.service.js', patchCriticosService],
    ['backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js', patchExperimentalAtencionPrioritaria],
    ['backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js', patchExperimentalEntregasRecientes]
  ]);

  const staged = [];
  for (const [relativePath, patch] of patches.entries()) {
    const original = read(relativePath);
    const updated = patch(original);
    checkSyntax(relativePath, updated);
    staged.push({ relativePath, updated });
  }

  for (const item of staged) {
    fs.writeFileSync(absolute(item.relativePath), item.updated, 'utf8');
  }

  console.log('Fase 4 aplicada correctamente.');
  console.log('Base verificada:', EXPECTED_HEAD);
  console.log('Archivos grandes parcheados:', staged.length);
  console.log('Ejecuta: git status');
}

if (require.main === module) main();

module.exports = {
  patchLegacy,
  patchProjects,
  patchReportService,
  patchPortafolioCommercial,
  patchCriticosService,
  patchExperimentalAtencionPrioritaria,
  patchExperimentalEntregasRecientes
};
