'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_7_V001]
// Diagnostico READ ONLY. Solo metadatos y agregados de MP de identidad
// verificada en los cuartos autorizados. Nunca revela filas sin vinculo seguro,
// ni datos globales de Zona 1 que no tienen un proyecto autorizado.
// No evalua GAS/Sheets ni concede aptitud para un corte.
const db = require('../../config/db');
const scope = require('../../services/cobranza-uni-scope.service');
const {listEffectivePermissions} = require('../../services/permissions/effective-permission.service');
const {MAIN_VISUAL, TABLE_PERMISSIONS} = require('./cobranza-uni-administracion.permissions');
const {MP_SQL_SPEC_UNI, MP_ZONE1_SQL_SPEC_UNI, MP_ZONE1_BLOCK_BASE_UNI,
  MP_ZONE1_INVOICE_BLOCKS_UNI, MP_RULES_UNI} = require('./cobranza-uni-administracion.constants');

const RIGHTS = Object.freeze([MAIN_VISUAL, TABLE_PERMISSIONS.detalle_mp_2026.view]);
const TABLE_MP = 'detalle_mp_2026';
const TABLE_Z1 = 'detalle_mp_2026_zona_1';
const METRICS = Object.freeze([
  'mp_visibles','zona1_vinculadas','zona1_sin_vinculo','identidad_conflictiva',
  'fk_mp_sin_asignar','estatus_sin_definir','estatus_fuera_catalogo',
  'factor_sin_definir','factor_cero','monto_anual_discrepante',
  'pendiente_discrepante','buscarv_diferencias','buscarv_sin_dato',
  'facturas_con_campos'
]);

function failReconcile_uni(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
function actorId_uni(req) {
  const raw = req?.informationAccess?.effective_user_id ?? req?.contextUser?.id_SB ??
    req?.contextUser?.id ?? req?.user?.id_SB ?? req?.user?.id;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function officialFilter_uni(req, dependencies = {}) {
  const official = dependencies.scopeService || scope;
  const territory = (dependencies.scopeBuilder || official.buildCobranzaProjectScopeSql_uni)(req, 'mp');
  const identity = official.canonicalProjectSql_uni('mp');
  if (typeof territory !== 'string' || !territory.trim() ||
      typeof identity !== 'string' || !identity.trim()) {
    throw failReconcile_uni(403, 'MP_F7_ALCANCE_NO_VERIFICADO',
      'No fue posible validar el alcance territorial y la identidad oficial.');
  }
  return `(${territory}) AND (${identity}) IS NOT NULL`;
}
// Para un usuario autorizado se compara solamente la Zona 1 unida al MP visible.
// NO se consulta globalmente Zona 1 por nombre de proyecto o IDNS.
function textConflict_uni(field) {
  const left = `mp.\`${field}\``, right = `z.\`${field}\``;
  if (field === 'proyecto') {
    return `(NULLIF(TRIM(${left}), '') IS NULL OR NULLIF(TRIM(${right}), '') IS NULL OR `+
      `UPPER(TRIM(${left})) COLLATE utf8mb4_0900_bin <> `+
      `UPPER(TRIM(${right})) COLLATE utf8mb4_0900_bin)`;
  }
  return `(NULLIF(TRIM(${left}), '') IS NOT NULL AND `+
    `NULLIF(TRIM(${right}), '') IS NOT NULL AND `+
    `UPPER(TRIM(${left})) COLLATE utf8mb4_0900_bin <> `+
    `UPPER(TRIM(${right})) COLLATE utf8mb4_0900_bin)`;
}
const LOOKUP_FIELDS = Object.freeze([
  'iguala', 'condiciones_pago', 'pendiente_corriente', 'pendiente_vencido',
  'pendiente', 'facturas_pendientes'
]);
function populatedSlot_uni(index) {
  const suffix = String(index).padStart(2,'0');
  const conditions = MP_ZONE1_BLOCK_BASE_UNI.map(([name, type]) => {
    const col = `z.\`${name}_${suffix}\``;
    return /^varchar/i.test(type) ? `NULLIF(TRIM(${col}), '') IS NOT NULL` : `${col} IS NOT NULL`;
  });
  return `(CASE WHEN (${conditions.join(' OR ')}) THEN 1 ELSE 0 END)`;
}
function sqlAggregateMp_uni(trustedFilter) {
  if (typeof trustedFilter !== 'string' || !trustedFilter.trim())
    throw failReconcile_uni(403,'MP_F7_ALCANCE_NO_VERIFICADO','Alcance obligatorio.');
  const looksDifferent = LOOKUP_FIELDS.map(name => {
    const left=`mp.\`${name}\``,right=`z.\`${name}\``;
    const isText=name==='condiciones_pago';
    const complete=isText
      ? `NULLIF(TRIM(${left}), '') IS NOT NULL AND NULLIF(TRIM(${right}), '') IS NOT NULL`
      : `${left} IS NOT NULL AND ${right} IS NOT NULL`;
    const equal=isText
      ? `UPPER(TRIM(${left})) COLLATE utf8mb4_0900_bin <=> `+
        `UPPER(TRIM(${right})) COLLATE utf8mb4_0900_bin`
      : `${left} <=> ${right}`;
    return `(CASE WHEN z.\`id_mp_zona_1\` IS NOT NULL AND ${complete} AND `+
      `NOT (${equal}) THEN 1 ELSE 0 END)`;
  });
  const looksMissing = LOOKUP_FIELDS.map(name => {
    const left=`mp.\`${name}\``,right=`z.\`${name}\``;
    return `(CASE WHEN z.\`id_mp_zona_1\` IS NOT NULL AND (`+
      (name==='condiciones_pago'
        ? `NULLIF(TRIM(${left}), '') IS NULL OR NULLIF(TRIM(${right}), '') IS NULL`
        : `${left} IS NULL OR ${right} IS NULL`) +
      ') THEN 1 ELSE 0 END)';
  });
  const slotCount = Array.from({length:MP_ZONE1_INVOICE_BLOCKS_UNI},(_,i)=>populatedSlot_uni(i+1));
  return `SELECT
    COUNT(*) AS mp_visibles,
    COALESCE(SUM(CASE WHEN z.\`id_mp_zona_1\` IS NOT NULL THEN 1 ELSE 0 END),0) AS zona1_vinculadas,
    COALESCE(SUM(CASE WHEN z.\`id_mp_zona_1\` IS NULL THEN 1 ELSE 0 END),0) AS zona1_sin_vinculo,
    COALESCE(SUM(CASE WHEN z.\`id_mp_zona_1\` IS NOT NULL AND
      (${textConflict_uni('proyecto')} OR ${textConflict_uni('idns')} OR ${textConflict_uni('cliente')})
      THEN 1 ELSE 0 END),0) AS identidad_conflictiva,
    COALESCE(SUM(CASE WHEN mp.\`id_proyecto_cobranza\` IS NULL THEN 1 ELSE 0 END),0) AS fk_mp_sin_asignar,
    COALESCE(SUM(CASE WHEN NULLIF(TRIM(mp.\`estatus_cartera\`),'') IS NULL THEN 1 ELSE 0 END),0) AS estatus_sin_definir,
    COALESCE(SUM(CASE WHEN NULLIF(TRIM(mp.\`estatus_cartera\`),'') IS NOT NULL AND
      UPPER(TRIM(mp.\`estatus_cartera\`)) NOT IN ('ACTIVO','INACTIVO')
      THEN 1 ELSE 0 END),0) AS estatus_fuera_catalogo,
    COALESCE(SUM(CASE WHEN mp.\`factor_monto_anual\` IS NULL THEN 1 ELSE 0 END),0) AS factor_sin_definir,
    COALESCE(SUM(CASE WHEN mp.\`factor_monto_anual\` = 0 THEN 1 ELSE 0 END),0) AS factor_cero,
    COALESCE(SUM(CASE WHEN mp.\`factor_monto_anual\` > 0 AND mp.\`iguala\` IS NOT NULL AND
      mp.\`monto_anual\` IS NOT NULL AND
      mp.\`monto_anual\` <> ROUND(mp.\`iguala\` * mp.\`factor_monto_anual\`,2)
      THEN 1 ELSE 0 END),0) AS monto_anual_discrepante,
    COALESCE(SUM(CASE WHEN mp.\`pendiente_corriente\` IS NOT NULL AND
      mp.\`pendiente_vencido\` IS NOT NULL AND mp.\`pendiente\` IS NOT NULL AND
      mp.\`pendiente\` <> mp.\`pendiente_corriente\` + mp.\`pendiente_vencido\`
      THEN 1 ELSE 0 END),0) AS pendiente_discrepante,
    COALESCE(SUM(${looksDifferent.join(' + ')}),0) AS buscarv_diferencias,
    COALESCE(SUM(${looksMissing.join(' + ')}),0) AS buscarv_sin_dato,
    COALESCE(SUM(${slotCount.join(' + ')}),0) AS facturas_con_campos
  FROM \`detalle_mp_2026\` mp
  LEFT JOIN \`detalle_mp_2026_zona_1\` z ON z.\`id_dmp\` = mp.\`id_dmp\`
  WHERE ${trustedFilter}`;
}
const EXPECTED = Object.freeze({
  [TABLE_MP]: MP_SQL_SPEC_UNI,
  [TABLE_Z1]: MP_ZONE1_SQL_SPEC_UNI
});
function checkSchema_uni(rows, fkRow) {
  if (!Array.isArray(rows) || !fkRow || typeof fkRow !== 'object')
    throw new Error('Metadatos MySQL incompletos.');
  const missing = [],extra = [],mismatched = [];
  const current = new Map();
  for (const row of rows) {
    const table=String(row.TABLE_NAME||'');
    const field=String(row.COLUMN_NAME||'');
    if (!Object.hasOwn(EXPECTED,table) || !field || current.has(table+':'+field))
      throw new Error('Metadatos MySQL repetidos o fuera de contrato.');
    current.set(table+':'+field,row);
  }
  for (const [table,spec] of Object.entries(EXPECTED)) {
    for (const [name,type,nullable] of spec) {
      const got=current.get(table+':'+name);
      if(!got){missing.push(table+'.'+name);continue;}
      if(String(got.COLUMN_TYPE).toLowerCase().replace(/\s+/g,' ')!==type ||
        String(got.IS_NULLABLE).toUpperCase()!==(nullable?'YES':'NO')) {
        mismatched.push(table+'.'+name);
      }
    }
    const named=new Set(spec.map(c=>c[0]));
    for(const row of rows.filter(r=>r.TABLE_NAME===table)){
      if(!named.has(row.COLUMN_NAME)) extra.push(table+'.'+row.COLUMN_NAME);
    }
  }
  const linked = Number(fkRow.fk_valid)===1;
  const unique = Number(fkRow.unique_valid)===1;
  const primary = Number(fkRow.pk_valid)===1;
  return Object.freeze({
    expected_mp_columns:MP_SQL_SPEC_UNI.length,
    expected_zone1_columns:MP_ZONE1_SQL_SPEC_UNI.length,
    observed_mp_columns:rows.filter(r=>r.TABLE_NAME===TABLE_MP).length,
    observed_zone1_columns:rows.filter(r=>r.TABLE_NAME===TABLE_Z1).length,
    missing:Object.freeze(missing),extra:Object.freeze(extra),type_conflicts:Object.freeze(mismatched),
    fk_valid:linked,unique_id_dmp:unique,primary_key_valid:primary,
    matches:missing.length===0&&extra.length===0&&mismatched.length===0&&linked&&unique&&primary
  });
}
function exactCount_uni(value,field){
  // Los conteos no se convierten en un Number sin verificar el rango seguro.
  const text=String(value??'');
  if(!/^\d+$/.test(text) || BigInt(text)>BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Conteo no confiable en conciliacion: '+field);
  return Number(text);
}
function normalizeCounts_uni(row){
  if(!row || typeof row!=='object')throw new Error('Resumen de conciliacion ausente.');
  const result={};
  for(const field of METRICS)result[field]=exactCount_uni(row[field],field);
  if(result.zona1_vinculadas+result.zona1_sin_vinculo!==result.mp_visibles)
    throw new Error('Totales por proyecto incoherentes en conciliacion.');
  if(result.identidad_conflictiva>result.zona1_vinculadas)
    throw new Error('Resultados de identidad incoherentes.');
  return Object.freeze(result);
}
function reconcileSummary_uni(schema,counts){
  let status = 'REVISAR';
  if(!schema.matches)status='ESQUEMA_INVALIDO';
  else if(counts && counts.mp_visibles===0)status='SIN_REGISTROS_EN_ALCANCE';
  else if(counts && [
    counts.zona1_sin_vinculo,counts.identidad_conflictiva,counts.estatus_fuera_catalogo,
    counts.factor_cero,counts.monto_anual_discrepante,counts.pendiente_discrepante,
    counts.buscarv_diferencias,counts.buscarv_sin_dato
  ].every(n=>n===0))status='SIN_DIFERENCIAS_DETECTADAS_EN_ALCANCE';
  return Object.freeze({ok:true,mode:'diagnostic_only',source:'aiven',table:TABLE_MP,
    scope:'united_authorized_rows_with_verified_identity',readonly:true,
    schema,counts:counts||null,status,
    cutover_ready:false,cutover_authorized:false,gas_must_remain_active:true,
    pending_checks:Object.freeze([
      'conciliacion_global_mydb_en_consola_autorizada',
      'comparacion_completa_con_sheets_y_su_fecha_de_corte',
      'registros_zona1_no_vinculados_o_huerfanos',
      'validacion_transaccional_y_auditoria_gc_va_mp',
      'pruebas_e2e_usuarios_permisos_y_zonas',
      'autorizacion_explicita_para_corte_global_gc_va_mp'
    ])
  });
}
const COLUMN_METADATA_SQL =
  'SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS '+
  'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?) ORDER BY TABLE_NAME, ORDINAL_POSITION';
const KEYS_METADATA_SQL = `SELECT
  EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE k
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'detalle_mp_2026_zona_1'
      AND k.CONSTRAINT_NAME = 'fk_mp_zona1_detalle_mp'
      AND k.COLUMN_NAME = 'id_dmp' AND k.REFERENCED_TABLE_NAME = 'detalle_mp_2026'
      AND k.REFERENCED_COLUMN_NAME = 'id_dmp') AS fk_valid,
  EXISTS(SELECT 1 FROM information_schema.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'detalle_mp_2026_zona_1'
      AND s.INDEX_NAME = 'uq_mp_zona1_id_dmp' AND s.COLUMN_NAME = 'id_dmp'
      AND s.NON_UNIQUE = 0) AS unique_valid,
  EXISTS(SELECT 1 FROM information_schema.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'detalle_mp_2026_zona_1'
      AND s.INDEX_NAME = 'PRIMARY' AND s.COLUMN_NAME = 'id_mp_zona_1'
      AND s.NON_UNIQUE = 0) AS pk_valid`;

async function reconcileMpAdmin_uni(req, dependencies={}){
  if (!req || req.informationAccess?.empresa!=='UNITED' ||
      req.informationAccess?.acceso_puerta!==true)
    throw failReconcile_uni(403,'MP_F7_ACCESO_DENEGADO','Puerta UNITED requerida.');
  const actor=actorId_uni(req);
  if(!actor)throw failReconcile_uni(401,'EFFECTIVE_USER_REQUIRED','Sesion efectiva requerida.');
  const connection=dependencies.connection||await db.getConnection();
  try{
    const permissions=await (dependencies.permissionResolver||listEffectivePermissions)(actor,RIGHTS,connection);
    if(!RIGHTS.every(code=>permissions?.get(code)===true))
      throw failReconcile_uni(403,'MP_F7_PERMISO_DENEGADO','Permisos MAIN y MP.VER requeridos.');
    const trustedFilter=officialFilter_uni(req,dependencies);
    const [cols]=await connection.query(COLUMN_METADATA_SQL,[TABLE_MP,TABLE_Z1]);
    const [keyRows]=await connection.query(KEYS_METADATA_SQL);
    const schema=checkSchema_uni(cols,keyRows?.[0]);
    if(!schema.matches)return reconcileSummary_uni(schema,null);
    const [rows]=await connection.query(sqlAggregateMp_uni(trustedFilter));
    const counts=normalizeCounts_uni(rows?.[0]);
    return reconcileSummary_uni(schema,counts);
  }finally{
    if(!dependencies.connection)connection.release();
  }
}
module.exports=Object.freeze({
  reconcileMpAdmin_uni,
  _test:Object.freeze({checkSchema_uni,normalizeCounts_uni,reconcileSummary_uni,
    sqlAggregateMp_uni,populatedSlot_uni,COLUMN_METADATA_SQL,KEYS_METADATA_SQL,RIGHTS})
});
