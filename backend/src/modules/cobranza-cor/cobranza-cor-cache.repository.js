'use strict';

// Verificador de cambios de Cobranza COR: solo SELECT en tablas existentes.
// La revision nunca concede acceso: PPNS procede del guard y catalogo CORELLIAN.
const FIELDS=Object.freeze({
  f:['id_fuente_cor','proyecto','cliente','contractual','id_proyecto_origen',
    'porcentaje','fondo_garantia','porcentaje_fondo_garantia','iva_general_pct',
    'condicion','moneda','subtotal','iva','total','factura','pago_total',
    'estatus_factura','fecha_pago','fecha_vencimiento','condiciones_pago_dias',
    'dias_vencimiento','estimado_pago','estatus_vencimiento','anio_proyecto',
    'activo','fecha_actualizacion','orden_hito','fecha_programada',
    'fecha_notificada','estatus_hito'],
  cf:['id_factura_cor','ppns','tipo_concepto','id_fuente_cor','id_aditiva_cor',
    'factura','fecha_factura','moneda','subtotal','iva','total','pagado',
    'estatus_factura','estatus_factura_origen','fecha_vencimiento',
    'estatus_cobranza','origen_registro','activo','updated_at'],
  p:['id_pago_cor','no_factura','id_pp','complemento_pago',
    'fecha_complemento_pago','importe_complemento_pago','updated_at'],
  rp:['id_rel_pago','id_factura_cor','id_pago_cor','importe_aplicado','updated_at']
});

function columnFingerprint_cor(alias) {
  const fields=FIELDS[alias].map(column=>
    "COALESCE(CAST("+alias+"."+column+" AS CHAR),'<NULL>')").join(',');
  return "CRC32(CONCAT_WS(CHAR(31),"+fields+"))";
}
function statement_cor(kind,alias,from,expression,where) {
  const hash=columnFingerprint_cor(alias);
  return "SELECT '"+kind+"' AS tipo, "+expression+" AS ppns, "+
    "COUNT(*) AS registros,SUM("+hash+") AS suma,BIT_XOR("+hash+") AS xor_checksum "+
    "FROM "+from+" WHERE "+where+" GROUP BY "+expression;
}
const norm=column=>"UPPER(TRIM(COALESCE("+column+",'')))";
function sql_cor() {
  const source=norm('f.id_proyecto_origen');
  const invoice=norm('cf.ppns');
  const relations=norm('cf.ppns');
  const payments=norm('projects.ppns');
  const projectMatches="(SELECT DISTINCT "+
    norm('f_project.id_proyecto_origen')+" AS ppns, "+
    norm('f_project.proyecto')+" AS project_key "+
    "FROM cobranza_fuente_cor f_project WHERE f_project.activo = 1 AND "+
    norm('f_project.id_proyecto_origen')+" IN (?)) projects";
  const parts=[
    statement_cor('f','f','cobranza_fuente_cor f',source,source+" IN (?)"),
    statement_cor('cf','cf','cobranza_facturas_cor cf',invoice,invoice+" IN (?)"),
    statement_cor('p','p','cobranza_pagos_cor p JOIN '+projectMatches+
      " ON "+norm('p.id_pp')+" = projects.project_key",
      payments,"projects.ppns IN (?)"),
    statement_cor('rp','rp','cobranza_rel_pagos rp JOIN cobranza_facturas_cor cf '+
      "ON cf.id_factura_cor = rp.id_factura_cor",
      relations,relations+" IN (?)")
  ];
  return parts.join(' UNION ALL ');
}
const REVISION_SQL=sql_cor();

function normalizeKeys_cor(values) {
  if(!Array.isArray(values)||values.length>24)throw new TypeError('Lote de revisiones COR invalido.');
  const keys=[...new Set(values.map(value=>String(value??'').trim().toUpperCase()).filter(Boolean))];
  if(keys.some(key=>key.length>100))throw new TypeError('PPNS de revision fuera de limite.');
  return keys;
}
async function listDashboardRevisionRows_cor(connection,ppnsList){
  const keys=normalizeKeys_cor(ppnsList);
  if(!keys.length)return [];
  const [rows]=await connection.query(REVISION_SQL,[keys,keys,keys,keys,keys]);
  if(!Array.isArray(rows))throw new Error('No se pudieron verificar las revisiones COR.');
  const allowed=new Set(keys);
  for(const row of rows) {
    if(!allowed.has(String(row?.ppns||'').trim().toUpperCase()))
      throw new Error('Revision COR fuera del alcance solicitado.');
  }
  return rows;
}

module.exports={listDashboardRevisionRows_cor,normalizeKeys_cor,REVISION_SQL};
