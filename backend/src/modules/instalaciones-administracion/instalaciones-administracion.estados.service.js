'use strict';

// Fuente oficial para la captura humana de ins_fl.estado.
async function listEstados_cor(executor) {
  const repository=require('../catalogo-general/catalogo-general.repository');
  const rows=await repository.list(executor,{area:'General',elemento:'Estado Abreviado'});
  return rows.filter(row=>typeof row.articulo==='string'&&row.articulo.trim())
    .map(row=>({codigo:row.articulo.trim(),nombre:String(row.descripcion??'').trim()}));
}
function stateValue_cor(value){return value==null?'':String(value).trim();}

// Validar solo nuevas capturas o cambios reales, no los valores historicos.
async function assertEstados_cor(executor,changes,originals=[]) {
  const rows=Array.isArray(changes)?changes:[changes];
  const codes=new Set();
  for(const row of rows){
    if(!Object.prototype.hasOwnProperty.call(row||{},'estado'))continue;
    const value=stateValue_cor(row.estado);
    if(!value)continue;
    if(originals.length&&originals.every(before=>stateValue_cor(before?.estado)===value))continue;
    codes.add(value);
  }
  if(!codes.size)return;
  const allowed=new Set((await listEstados_cor(executor)).map(item=>item.codigo));
  if(!allowed.size)throw Object.assign(new Error('Catalogo de estados abreviados no disponible.'),{
    statusCode:503,code:'INSTALACIONES_ESTADOS_CATALOGO_NO_DISPONIBLE'
  });
  for(const code of codes)if(!allowed.has(code))
    throw Object.assign(new Error('Selecciona una abreviatura activa del Catalogo General.'),{
      statusCode:400,code:'INSTALACIONES_ESTADO_INVALIDO'
    });
}
function assertProductionStatus_cor(changes,originals=[]){
  const rows=Array.isArray(changes)?changes:[changes];
  for(const row of rows){
    if(!Object.prototype.hasOwnProperty.call(row||{},'estatus_produccion'))continue;
    const value=stateValue_cor(row.estatus_produccion);
    if(!value||originals.length&&originals.every(before=>stateValue_cor(before?.estatus_produccion)===value))continue;
    const rules=require('./instalaciones-administracion.auto-rules');
    if(!rules.STATUS_CODES_COR.includes(value))throw rules.knownError_cor(400,
      'INSTALACIONES_ESTATUS_PRODUCCION_INVALIDO','Selecciona uno de los ocho estatus autorizados.',{field:'estatus_produccion'});
  }
}
async function assertCatalogChanges_cor(executor,changes,originals=[]){
  assertProductionStatus_cor(changes,originals);
  await assertEstados_cor(executor,changes,originals);
}
module.exports={listEstados_cor,assertEstados_cor,assertProductionStatus_cor,assertCatalogChanges_cor};
