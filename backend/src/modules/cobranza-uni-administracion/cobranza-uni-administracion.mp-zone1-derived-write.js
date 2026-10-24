'use strict';
// Propaga solo los seis BUSCARV documentados de Zona 1 a MP.
// Se llama dentro de la transaccion que escribe la celda de origen.
const {MP_LOOKUP_SHEET_UNI}=require('./cobranza-uni-administracion.constants');
const {previewMontoAnualMp_uni}=require('./cobranza-uni-administracion.mp-formulas');
const {failMp_uni}=require('./cobranza-uni-administracion.mp-edit-validation');

const LOOKUPS=new Set(MP_LOOKUP_SHEET_UNI.rules.map(rule=>rule.sourceColumn));
function same_uni(a,b){return (a==null?null:String(a))===(b==null?null:String(b));}

async function propagateZone1ToMp_uni(conn,idDmp,field,value){
  if(!LOOKUPS.has(field))return [];
  const [rows]=await conn.query(
    `SELECT mp.\`${field}\` AS original_value, mp.\`factor_monto_anual\` AS factor_monto_anual, `+
    'mp.`monto_anual` AS monto_anual FROM `detalle_mp_2026` mp '+
    'WHERE mp.`id_dmp` = ? LIMIT 1 FOR UPDATE',[idDmp]);
  if(!Array.isArray(rows)||rows.length!==1)
    throw failMp_uni(409,'MP_ZONA1_DERIVADO_SIN_MP','No se pudo verificar el MP vinculado.');
  const row=rows[0],changes=[],setters=[],params=[];
  if(!same_uni(row.original_value,value)){
    setters.push(`mp.\`${field}\` = ?`);params.push(value);
    changes.push({table:'detalle_mp_2026',field,before:row.original_value??null,after:value});
  }
  if(field==='iguala'&&row.factor_monto_anual!=null&&value!=null){
    const annual=previewMontoAnualMp_uni({iguala:value,
      factor_monto_anual:row.factor_monto_anual,monto_anual:row.monto_anual});
    if(annual.status!=='ready')
      throw failMp_uni(422,'MP_ZONA1_MONTO_ANUAL_NO_CALCULABLE',
        'La iguala no permite actualizar MONTO ANUAL.',{status:annual.status});
    if(!annual.matches_stored){
      setters.push('mp.`monto_anual` = ?');params.push(annual.calculated);
      changes.push({table:'detalle_mp_2026',field:'monto_anual',
        before:row.monto_anual??null,after:annual.calculated});
    }
  }
  if(setters.length){
    const [result]=await conn.query(
      `UPDATE \`detalle_mp_2026\` mp SET ${setters.join(', ')} WHERE mp.\`id_dmp\` = ?`,
      [...params,idDmp]);
    if(Number(result?.affectedRows)!==1)
      throw failMp_uni(409,'MP_ZONA1_DERIVADO_NO_CONFIRMADO',
        'No se actualizaron los derivados de MP. Todos los cambios se revierten.');
  }
  return changes;
}
module.exports=Object.freeze({propagateZone1ToMp_uni,LOOKUPS});
