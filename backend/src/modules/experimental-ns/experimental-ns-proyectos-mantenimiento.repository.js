'use strict';

// BLT NOW | EXPERIMENTAL_NS_F5 | Snapshot SOLO por año actual + U365 y periodo explicito.
// Ningun SELECT de Tickets carga el historico completo de ns_tickets_pruebas.
const db = require('../../config/db');
const base = require('./experimental-ns.repository');
const scope = require('./experimental-ns.scope');
const periods = require('./experimental-ns-periodos');

const MAX_EQUIPMENT = 50000;
const MAX_TICKETS = 50000; // Proteccion SOBRE la ventana solicitada, no el historico.
const SELECT_COLUMNS = Object.freeze({
  ns_portafolio_pruebas: Object.freeze([
    'id_portafolio','id_proyecto_cobranza','proyecto','proyecto_cc_x_port','numero_equipo',
    'identificacion_sitio','ciudad','estado','zona_id','zona_operativa','supervisor_zona',
    'superintendente','categoria','tipo_poliza','producto','estatus_servicio','inactivo',
    'estado_registro'
  ]),
  ns_tickets_pruebas: Object.freeze([
    'id','ticket','codigo_equipo','proyecto','proyecto_padre','estado_ticket',
    'fecha_reporte','fecha_cierre','estatus_equipo_final','responsabilidad','causa',
    'causa_falla','custeventblt_mot_det'
  ])
});

function unavailable(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  if (details) error.details = details;
  return error;
}

async function requireProjectSchema() {
  await base.requireSchema();
  const [rows] = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('ns_portafolio_pruebas','ns_tickets_pruebas')
  `);
  const found = new Map(Object.keys(SELECT_COLUMNS).map(name => [name,new Set()]));
  for (const row of rows || []) {
    const set = found.get(row.TABLE_NAME);
    if (set) set.add(row.COLUMN_NAME);
  }
  const missing = {};
  for (const [table, columns] of Object.entries(SELECT_COLUMNS)) {
    const absent = columns.filter(col => !found.get(table).has(col));
    if (absent.length) missing[table] = absent;
  }
  if (Object.keys(missing).length) {
    throw unavailable('EXPERIMENTAL_NS_PROJECT_SCHEMA_INCOMPLETE',
      'No es posible consultar Proyectos de Mantenimiento: faltan columnas experimentales.',missing);
  }
}

function queryStatements(req) {
  const pScope = scope.portafolioScope(req);
  const tScope = scope.ticketsScope(req);
  // La ventana base es el mas antiguo entre enero 1 y U365.
  // Si el programador SOLICITA expresamente un periodo de criticidad mayor,
  // se amplia SOLO hasta ese periodo para no calcular indicadores incompletos.
  const days=periods.lookbackDays(req?.query?.dias_criticos,35);
  const window=periods.historicalWindow(undefined,[days]);
  // Identificadores de SQL fijos y validados contra INFORMATION_SCHEMA.
  const pColumns = SELECT_COLUMNS.ns_portafolio_pruebas.map(col => `p.\`${col}\``).join(', ');
  const tColumns = SELECT_COLUMNS.ns_tickets_pruebas.map(col =>
    col === 'fecha_reporte' || col === 'fecha_cierre'
      ? `DATE_FORMAT(t.\`${col}\`, '%Y-%m-%d %H:%i:%s') AS \`${col}\``
      : `t.\`${col}\``
  ).join(', ');
  const pSql = `SELECT ${pColumns} FROM ns_portafolio_pruebas p
    WHERE (${pScope.sql}) AND p.estado_registro = 1 ORDER BY p.id_portafolio DESC LIMIT ?`;
  const tSql = `SELECT ${tColumns} FROM ns_tickets_pruebas t
    WHERE t.fecha_reporte >= ? AND t.fecha_reporte < ? AND (${tScope.sql})
    ORDER BY t.id DESC LIMIT ?`;
  scope.assertNoProductionTables(pSql);
  scope.assertNoProductionTables(tSql);
  return { pSql,tSql,pParams:[...pScope.params,MAX_EQUIPMENT + 1],
    tParams:[window.inicio,window.fin,...tScope.params,MAX_TICKETS + 1],window };
}

async function readSnapshot(req) {
  scope.assertScope(req);
  await requireProjectSchema();
  const query = queryStatements(req);
  // Secuencial: respetar cap de conexiones Aiven/Azure.
  const [portafolio] = await db.query(query.pSql,query.pParams);
  if (!Array.isArray(portafolio) || portafolio.length > MAX_EQUIPMENT) {
    throw unavailable('EXPERIMENTAL_NS_PROJECT_EQUIPMENT_LIMIT',
      'La muestra NS excede 50,000 equipos o devolvio un formato invalido. No se calculan parciales.');
  }
  const [tickets] = await db.query(query.tSql,query.tParams);
  if (!Array.isArray(tickets) || tickets.length > MAX_TICKETS) {
    throw unavailable('EXPERIMENTAL_NS_PROJECT_TICKETS_LIMIT',
      'El periodo seleccionado excede 50,000 tickets. No se calculan parciales.');
  }
  return { portafolio, tickets };
}


// El detalle de Proyectos tiene una grafica del ano anterior. Mantenerla exacta
// SIN descargar sus tickets: una agregacion SQL solo de los equipos del proyecto.
async function previousYearMonthly(req, equipoCodes, year) {
  scope.assertScope(req);
  if (!Number.isSafeInteger(year) || year<1900 || year>2100 ||
      !Array.isArray(equipoCodes)||equipoCodes.length>MAX_EQUIPMENT) {
    throw unavailable('EXPERIMENTAL_NS_PROJECT_MONTHLY_INVALID',
      'Parametros de grafica mensual invalidos.');
  }
  const months=Array.from({length:12},(_,i)=>({
    mes:`${year}-${String(i+1).padStart(2,'0')}`,total:0
  }));
  const codes=[...new Set(equipoCodes.map(s=>String(s||'').trim()).filter(Boolean))];
  if (!codes.length) return months;
  const tScope=scope.ticketsScope(req);
  const begin=`${year}-01-01 00:00:00`;
  const finish=`${year+1}-01-01 00:00:00`;
  const counts=new Map();
  for(let i=0;i<codes.length;i+=250){
    const chunk=codes.slice(i,i+250);
    const placeholders=chunk.map(()=>'?').join(',');
    const sql=`SELECT DATE_FORMAT(t.fecha_reporte,'%Y-%m') AS mes,
        COUNT(*) AS total FROM ns_tickets_pruebas t
      WHERE t.fecha_reporte >= ? AND t.fecha_reporte < ?
        AND t.codigo_equipo IN (${placeholders}) AND (${tScope.sql})
      GROUP BY DATE_FORMAT(t.fecha_reporte,'%Y-%m')`;
    scope.assertNoProductionTables(sql);
    const [rows]=await db.query(sql,[begin,finish,...chunk,...tScope.params]);
    for(const row of rows||[]) {
      const key=String(row.mes);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      counts.set(key,(counts.get(key)||0)+Number(row.total||0));
    }
  }
  for(const item of months)item.total=counts.get(item.mes)||0;
  return months;
}

module.exports = { MAX_EQUIPMENT, MAX_TICKETS, SELECT_COLUMNS, requireProjectSchema, queryStatements, readSnapshot, previousYearMonthly };
