'use strict';

const repository = require('./experimental-atencion-prioritaria.repository');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');
const canonicalZoneUni = require('../../services/alcance/united-canonical-zone.service');

const ATRAPADOS_KEYWORDS_EXP = Object.freeze([
  'atrapado','atrapada','encerrado','encerrada','persona atrapada','personas atrapadas','rescate'
]);
const DEFAULT_HORAS_SIN_LLEGADA_EXP = 2;
const TIME_ZONE_EXP = 'America/Mexico_City';

function positiveInt_exp(value,fallback,min,max){const parsed=Number.parseInt(value,10);if(Number.isNaN(parsed))return fallback;return Math.max(min,Math.min(max,parsed));}
function normalizeFilter_exp(value){return String(value||'').trim().slice(0,150);}

function buildOpenTicketFilters_exp(req,alias,zoneAlias){
  const periodo=normalizeFilter_exp(req.query&&req.query.periodo)||'dia';
  const tableAlias=alias||'t';
  const canonicalZoneAlias=zoneAlias||'z_exp_ticket';
  const mandatoryScope=informationRecordScope.buildTicketScopeSql_gnral(req,tableAlias);
  const clauses=[mandatoryScope.sql];
  const params=[...mandatoryScope.params];
  if(periodo==='dia'){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE_EXP,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    clauses.push(`DATE(${tableAlias}.fecha_reporte) = ?`);params.push(today);
  }
  const estado=normalizeFilter_exp(req.query&&req.query.estado);
  const zona=normalizeFilter_exp(req.query&&req.query.zona);
  if(estado){clauses.push(`TRIM(COALESCE(${tableAlias}.estado, '')) = ?`);params.push(estado);}
  if(zona){clauses.push(canonicalZoneUni.zoneColumnFilterSql_uni(canonicalZoneAlias));params.push(zona);}
  return{where:clauses.join(' AND '),params,selected:{estado,zona,periodo:periodo==='todos'?'todos':'dia'}};
}

function getCriticidadCriteria_exp(req){const configuredDays=Number(req.user&&req.user.criticos_periodo)||35;const configuredFailures=Number(req.user&&req.user.criticos_fallas)||3;return{dias:positiveInt_exp(req.query&&(req.query.dias||req.query.periodo||req.query.criticos_periodo),configuredDays,1,3650),minFallas:positiveInt_exp(req.query&&(req.query.min_fallas||req.query.minFallas||req.query.fallas||req.query.criticos_fallas),configuredFailures,1,9999)};}
function normalizeStatus_exp(value){const raw=String(value||'').trim();const n=raw.toLowerCase();if(n.includes('cerr'))return'Cerrado';if(n.includes('curso')||n.includes('proceso'))return'En curso';if(n.includes('abier')||n.includes('pend'))return'Abierto';return raw||'Abierto';}
function textBlob_exp(row){return[row.descripcion,row.causa,row.accion_en_cierre].filter(Boolean).join(' ').toLowerCase();}
function isAtrapado_exp(row){const blob=textBlob_exp(row);return ATRAPADOS_KEYWORDS_EXP.some(k=>blob.includes(k));}
function dateParts_exp(value){const m=String(value||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);return m?{year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}:null;}
function timeParts_exp(value){let text=String(value||'').trim();if(!text||text.toLowerCase()==='null')return null;text=text.replace(/^1899-12-3[01]T/i,'').replace(/\.\d+Z?$/i,'').trim();const ap=text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);if(ap){let hour=Number(ap[1]);const p=ap[4].toUpperCase();if(p==='PM'&&hour<12)hour+=12;if(p==='AM'&&hour===12)hour=0;return{hour,minute:Number(ap[2]),second:Number(ap[3]||0)};}const m=text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);return m?{hour:Number(m[1]),minute:Number(m[2]),second:Number(m[3]||0)}:null;}
function operationalEpoch_exp(dateValue,timeValue){const d=dateParts_exp(dateValue),t=timeParts_exp(timeValue);return(!d||!t)?null:Date.UTC(d.year,d.month-1,d.day,t.hour,t.minute,t.second);}
function operationalNowEpoch_exp(){const f=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE_EXP,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});const v={};for(const p of f.formatToParts(new Date()))if(p.type!=='literal')v[p.type]=Number(p.value);return Date.UTC(v.year,v.month-1,v.day,v.hour,v.minute,v.second);}
function elapsedMinutes_exp(row,nowEpoch){const start=operationalEpoch_exp(row.fecha_reporte_fecha,row.h_reporte);return start===null?null:Math.max(0,Math.round((nowEpoch-start)/60000));}
function hasArrivalTime_exp(row){const value=String(row.h_llegada||'').trim().toLowerCase();return Boolean(value&&value!=='null'&&value!=='—');}
function mapTicket_exp(row,nowEpoch){const minutes=elapsedMinutes_exp(row,nowEpoch);return{ticket:String(row.ticket||row.folio||row.id||'').trim(),estado_ticket:normalizeStatus_exp(row.estado_ticket),estado:String(row.estado||'').trim(),proyecto:String(row.proyecto||'').trim(),codigo_equipo:String(row.codigo_equipo||'').trim(),zona:String(row.zona||'').trim(),zona_legacy:String(row.zona_legacy||'').trim()||null,zona_id_oficial:row.zona_id_oficial==null?null:Number(row.zona_id_oficial),fecha_reporte:row.fecha_reporte_fecha||null,hora_reporte:String(row.h_reporte||'').trim()||null,hora_llegada:String(row.h_llegada||'').trim()||null,minutos_abierto:minutes,horas_abierto:minutes===null?null:Number((minutes/60).toFixed(1))};}
function buildReincidenceLabel_exp(metrics){const seven=Number(metrics.llamadas_7d||0),thirty=Number(metrics.llamadas_30d||0);return seven>1?`Reincidencia ${seven} en 7 días`:`Reincidencia ${thirty} en 30 días`;}

async function getAtencionPrioritaria_exp(req){
  const zoneAlias='z_exp_ticket';
  const filters=buildOpenTicketFilters_exp(req,'t',zoneAlias);
  const periodo=filters.selected.periodo;
  const criteria=getCriticidadCriteria_exp(req);
  const nowEpoch=operationalNowEpoch_exp();
  const zoneJoinSql=canonicalZoneUni.ticketZoneJoinSql_uni('t',zoneAlias);

  const openTicketsSql=`
    SELECT t.id,t.ticket,t.folio,t.estado_ticket,t.estado,t.proyecto,t.codigo_equipo,
      t.zona AS zona_legacy,${zoneAlias}.zona AS zona,${zoneAlias}.id_zona AS zona_id_oficial,
      t.descripcion,t.causa,t.accion_en_cierre,
      DATE_FORMAT(t.fecha_reporte,'%Y-%m-%d') AS fecha_reporte_fecha,t.h_reporte,
      DATE_FORMAT(t.fecha_llegada,'%Y-%m-%d') AS fecha_llegada_fecha,t.h_llegada
    FROM tickets t
    ${zoneJoinSql}
    WHERE ${filters.where}
    ORDER BY t.id DESC`;

  const catalogScope=informationRecordScope.buildTicketScopeSql_gnral(req,'tc');
  const filterCatalogSql=`
    SELECT 'ESTADO' AS tipo,TRIM(tc.estado) AS valor
    FROM tickets tc
    WHERE ${catalogScope.sql}
      AND tc.estado IS NOT NULL AND TRIM(tc.estado)<>''
    GROUP BY TRIM(tc.estado)
    ORDER BY valor ASC`;

  const criticalInnerScope=informationRecordScope.buildTicketScopeSqlInline_gnral(req,'tc');
  const criticalOuterScope=informationRecordScope.buildTicketScopeSqlInline_gnral(req,'t');
  const criticalMetricsSql=`
    SELECT critical.codigo_equipo,critical.fallas_blt_periodo,
      SUM(CASE WHEN t.fecha_reporte IS NOT NULL AND DATE(t.fecha_reporte)>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS llamadas_7d,
      SUM(CASE WHEN t.fecha_reporte IS NOT NULL AND DATE(t.fecha_reporte)>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS llamadas_30d
    FROM (
      SELECT tc.codigo_equipo,COUNT(*) AS fallas_blt_periodo
      FROM tickets tc
      WHERE ${criticalInnerScope.sql}
        AND tc.codigo_equipo IS NOT NULL AND TRIM(tc.codigo_equipo)<>'' AND tc.fecha_reporte IS NOT NULL
        AND DATE(tc.fecha_reporte)>=DATE_SUB(CURDATE(),INTERVAL ? DAY)
        AND UPPER(COALESCE(tc.responsabilidad,'')) LIKE '%BLT%'
      GROUP BY tc.codigo_equipo HAVING COUNT(*)>=?
    ) critical
    LEFT JOIN tickets t ON t.codigo_equipo=critical.codigo_equipo AND t.fecha_reporte IS NOT NULL AND DATE(t.fecha_reporte)>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) AND ${criticalOuterScope.sql}
    GROUP BY critical.codigo_equipo,critical.fallas_blt_periodo`;

  const [openResult,catalogResult,metricsResult]=await Promise.all([
    repository.query(openTicketsSql,filters.params),
    repository.query(filterCatalogSql,catalogScope.params),
    repository.query(criticalMetricsSql,[criteria.dias,criteria.minFallas])
  ]);

  const openRows=openResult[0]||[],catalogRows=catalogResult[0]||[],metricsRows=metricsResult[0]||[];
  const mappedTickets=openRows.map(row=>({raw:row,ticket:mapTicket_exp(row,nowEpoch)}));
  const atrapados=mappedTickets.filter(({raw})=>isAtrapado_exp(raw)).map(({ticket})=>ticket);
  const sinLlegada=mappedTickets.filter(({raw,ticket})=>!hasArrivalTime_exp(raw)&&ticket.minutos_abierto!==null&&ticket.minutos_abierto>DEFAULT_HORAS_SIN_LLEGADA_EXP*60).map(({ticket})=>ticket).sort((a,b)=>Number(b.minutos_abierto||0)-Number(a.minutos_abierto||0));
  const metricsByEquipment=new Map(metricsRows.map(row=>[String(row.codigo_equipo||'').trim(),row]));
  const criticosReincidentes=[],seenEquipment=new Set();
  for(const item of mappedTickets){const code=item.ticket.codigo_equipo;if(!code||seenEquipment.has(code))continue;const metrics=metricsByEquipment.get(code);if(!metrics)continue;seenEquipment.add(code);criticosReincidentes.push({...item.ticket,fallas_blt_periodo:Number(metrics.fallas_blt_periodo||0),llamadas_7d:Number(metrics.llamadas_7d||0),llamadas_30d:Number(metrics.llamadas_30d||0),reincidencia:buildReincidenceLabel_exp(metrics)});}
  const estados=catalogRows.map(r=>String(r.valor||'').trim()).filter(Boolean);
  const zonas=informationRecordScope.zoneCodes_gnral(req);
  return{ok:true,source:'aiven',period:periodo,criteria:{horas_sin_llegada:DEFAULT_HORAS_SIN_LLEGADA_EXP,dias_criticidad:criteria.dias,min_fallas_blt:criteria.minFallas,responsabilidad_criticidad:'BLT'},selected_filters:filters.selected,alcance:{zona_ids:informationRecordScope.zoneIds_gnral(req),zonas},filters:{estados,zonas},counts:{atrapados:atrapados.length,sin_llegada:sinLlegada.length,criticos_reincidentes:criticosReincidentes.length},data:{atrapados,sin_llegada:sinLlegada,criticos_reincidentes:criticosReincidentes},generated_at:new Date().toISOString()};
}

module.exports={getAtencionPrioritaria_exp};
