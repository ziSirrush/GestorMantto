'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_5_V001]
// Consulta de la hoja origen Zona 1, unicamente por id_dmp validado.
// NO hay BUSCARV textual, alta automatica, UPDATE ni escrituras GAS.
const db=require('../../config/db');
const scope=require('../../services/cobranza-uni-scope.service');
const {
  MP_ZONE1_COLUMNS_UNI,MP_ZONE1_META_UNI,MP_LOOKUP_SHEET_UNI
}=require('./cobranza-uni-administracion.constants');
const {idMp_uni}=require('./cobranza-uni-administracion.mp-edit-validation');

const AMOUNTS=new Set(['iguala','pendiente_corriente','pendiente_vencido','pendiente']);
const MAX_DECIMAL_CENTS=999999999999999999n;
const SOURCE_COLUMNS=MP_ZONE1_COLUMNS_UNI.map(c=>c.name);
const MAIN_LOOKUPS=MP_LOOKUP_SHEET_UNI.rules.map(rule=>rule.target);
const MP_FIELDS=['proyecto','idns','cliente',...MAIN_LOOKUPS];
const MP_SELECT_FIELDS=MP_FIELDS.map(name=>`mp.\`${name}\``).join(', ');
const ZONA_SELECT_FIELDS=MP_ZONE1_COLUMNS_UNI.map(({name})=>
  name==='id_dmp'||name==='id_mp_zona_1'
    ? `CAST(z.\`${name}\` AS CHAR) AS \`${name}\``
    : `z.\`${name}\``).join(', ');

function denied_uni(statusCode,code,message){
  const err=new Error(message);err.statusCode=statusCode;err.code=code;return err;
}
function normalizedText_uni(value){
  return value===null||value===undefined?'':String(value).trim().normalize('NFC').toLocaleUpperCase('es-MX');
}
function compareValue_uni(field,value){
  if(value===null||value===undefined||value==='')return {value:null,valid:true};
  const raw=String(value).trim();
  if(!raw)return {value:null,valid:true};
  if(AMOUNTS.has(field)){
    const match=/^(-?)(\d{1,16})(?:\.(\d{1,2}))?$/.exec(raw);
    if(!match)return {value:null,valid:false};
    const cents=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
    if(cents>MAX_DECIMAL_CENTS)return {value:null,valid:false};
    return {value:(match[1]==='-'?-cents:cents).toString(),valid:true};
  }
  if(field==='facturas_pendientes'){
    if(!/^-?\d{1,10}$/.test(raw))return {value:null,valid:false};
    const n=BigInt(raw);
    if(n<-2147483648n||n>2147483647n)return {value:null,valid:false};
    return {value:n.toString(),valid:true};
  }
  return {value:normalizedText_uni(value),valid:true};
}
function reportLookup_uni(main,source){
  const comparisons=MP_LOOKUP_SHEET_UNI.rules.map(rule=>{
    const field=rule.target;
    const current=main[field]??null;
    const origin=source[field]??null;
    const a=compareValue_uni(field,current),b=compareValue_uni(field,origin);
    const match=a.valid&&b.valid&&a.value===b.value;
    return Object.freeze({
      field,main_value:current,zone1_value:origin,
      status:!a.valid||!b.valid?'invalid':a.value===null||b.value===null?'missing':match?'match':'different'
    });
  });
  const summary={match:0,different:0,missing:0,invalid:0};
  for(const entry of comparisons)summary[entry.status]++;
  return Object.freeze({mode:'preview_only',origin:'detalle_mp_2026_zona_1',
    fields:MAIN_LOOKUPS,comparisons,summary:Object.freeze(summary)});
}
function checkIdentity_uni(main,zone,id){
  if(String(zone.id_dmp)!==id || !/^[1-9]\d*$/.test(String(zone.id_mp_zona_1||'')))
    throw denied_uni(409,'MP_ZONA1_IDENTIDAD_CONFLICTIVA','La referencia de la factura no es confiable.');
  const projectMain=normalizedText_uni(main.proyecto);
  const projectZone=normalizedText_uni(zone.proyecto);
  // Ni siquiera un usuario territorialmente ilimitado puede cruzar hojas con
  // nombre distinto o IDNS discordante. NULL de IDNS/cliente se documenta,
  // no se utiliza como prueba positiva de identidad.
  if(!projectMain||!projectZone||projectMain!==projectZone)
    throw denied_uni(409,'MP_ZONA1_IDENTIDAD_CONFLICTIVA','Proyecto de Zona 1 incompatible con MP.');
  for(const field of ['idns','cliente']){
    const a=normalizedText_uni(main[field]),b=normalizedText_uni(zone[field]);
    if(a&&b&&a!==b)
      throw denied_uni(409,'MP_ZONA1_IDENTIDAD_CONFLICTIVA','Identidad de Zona 1 no confiable.');
  }
  return Object.freeze({
    verified:true,join_key:'id_dmp',project_checked:true,
    idns_checked:Boolean(normalizedText_uni(main.idns)&&normalizedText_uni(zone.idns)),
    cliente_checked:Boolean(normalizedText_uni(main.cliente)&&normalizedText_uni(zone.cliente))
  });
}

async function getZona1DetalleMp_uni(req,rawId,deps={}){
  // El guard principal de la ruta exige MAIN+UNITED+COBRANZA_UNI y MP.VER.
  // Segundo cierre en servicio: no ejecuta SELECT sin contexto efectivo.
  if(!req||req.informationAccess?.empresa!=='UNITED'||req.informationAccess?.acceso_puerta!==true)
    throw denied_uni(403,'MP_ZONA1_ACCESO_DENEGADO','Contexto UNITED no autorizado.');
  const id=idMp_uni(rawId);
  const official=deps.scopeService||scope;
  const filter=(deps.scopeBuilder||official.buildCobranzaProjectScopeSql_uni)(req,'mp');
  const canonical=official.canonicalProjectSql_uni('mp');
  if(typeof filter!=='string'||!filter.trim()||typeof canonical!=='string'||!canonical.trim())
    throw denied_uni(403,'MP_ZONA1_ALCANCE_INDETERMINADO','No se pudo validar el alcance.');
  const conn=deps.connection||await db.getConnection();
  try{
    // Principal primero: territorio + identidad oficial; nunca usar FK sin verificar.
    const [mainRows]=await conn.query(
      `SELECT CAST(mp.\`id_dmp\` AS CHAR) AS id_dmp, ${MP_SELECT_FIELDS} `+
      `FROM \`detalle_mp_2026\` mp WHERE mp.\`id_dmp\` = ? `+
      `AND (${filter}) AND (${canonical}) IS NOT NULL LIMIT 1`,[id]
    );
    if(!Array.isArray(mainRows)||mainRows.length!==1||String(mainRows[0].id_dmp)!==id)
      throw denied_uni(404,'MP_ZONA1_REGISTRO_NO_DISPONIBLE',
        'Registro MP inexistente, fuera de alcance o con identidad no verificada.');
    // Segunda validacion en EL MISMO SELECT que devuelve Zona 1:
    // protege de un cambio de alcance/identidad entre ambas lecturas.
    // El unico enlace es id_dmp, nunca el nombre textual del proyecto.
    const [zoneRows]=await conn.query(
      `SELECT ${ZONA_SELECT_FIELDS} FROM \`detalle_mp_2026_zona_1\` z `+
      `INNER JOIN \`detalle_mp_2026\` mp ON mp.\`id_dmp\` = z.\`id_dmp\` `+
      `WHERE z.\`id_dmp\` = ? AND (${filter}) AND (${canonical}) IS NOT NULL LIMIT 2`,[id]
    );
    if(!Array.isArray(zoneRows)||zoneRows.length>1)
      throw denied_uni(409,'MP_ZONA1_RELACION_AMBIGUA','Relacion Zona 1 no confiable.');
    const common=Object.freeze({ok:true,readonly:true,source:'aiven',
      table:MP_ZONE1_META_UNI.table,primary_key:MP_ZONE1_META_UNI.primaryKey,
      id_dmp:id,relation:'id_dmp',invoice_blocks:12,
      columns:MP_ZONE1_COLUMNS_UNI});
    if(zoneRows.length===0){
      return {...common,linked:false,identity_verified:false,row:null,
        lookup_preview:null,status:'sin_vinculo_id_dmp'};
    }
    const zone=zoneRows[0];
    if(!zone||typeof zone!=='object'||SOURCE_COLUMNS.some(key=>!Object.hasOwn(zone,key)))
      throw denied_uni(409,'MP_ZONA1_DATOS_INCOMPLETOS','Datos de Zona 1 incompletos.');
    const identity=checkIdentity_uni(mainRows[0],zone,id);
    return {...common,linked:true,identity_verified:true,identity,row:zone,
      lookup_preview:reportLookup_uni(mainRows[0],zone),status:'vinculo_verificado'};
  }finally{
    if(!deps.connection)conn.release();
  }
}
module.exports=Object.freeze({
  getZona1DetalleMp_uni,
  _test:Object.freeze({compareValue_uni,reportLookup_uni,checkIdentity_uni})
});
