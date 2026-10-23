'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_6_V001]
// Alta de VA PREPARADA, cerrada mientras GAS siga activo en GC/VA/MP.
// La simulacion usa SELECT y calculos F4/F5. La escritura exige triple
// autorizacion explicita, un id_pc aportado y auditoria atomica.
const db=require('../../config/db');
const scope=require('../../services/cobranza-uni-scope.service');
const identityFactory=require('../../services/cobranza-uni/identidad-proyecto.service');
const {
  PC_COLUMNS_UNI,PC_EDITABLE_FIELDS_UNI,PC_DERIVED_FIELDS_UNI
}=require('./cobranza-uni-administracion.constants');
const {
  failPc_uni,idPc_uni
}=require('./cobranza-uni-administracion.pc-edit-validation');
const {
  normalizeCreatePc_uni
}=require('./cobranza-uni-administracion.pc-create-validation');
const {authorizePcWrite_uni}=require('./cobranza-uni-administracion.pc-edit-service');
const {
  todayMexicoCity_uni,calculatePcLocal_uni,dateIso_uni,moneyToCents_uni,
  termDays_uni
}=require('./cobranza-uni-administracion.pc-formulas');
const {
  previewPcRelationsFromAiven_uni
}=require('./cobranza-uni-administracion.pc-relations-service');
const {auditPcCreate_uni}=require('./cobranza-uni-administracion.pc-create-audit');
const MAX_ID_UNI=9223372036854775807n;
const TRUE_UNI=new Set(['1','true','yes','on']);
const TEXT_META_UNI=new Map(PC_COLUMNS_UNI.map(item=>[item.name,item]));

function createGateEnabled_uni(env=process.env){
  return ['PC_ADMIN_EDIT_ENABLED','PC_ADMIN_CREATE_ENABLED',
    'PC_ADMIN_GAS_CUTOVER_CONFIRMED'].every(name=>TRUE_UNI.has(String(env[name]||'').trim().toLowerCase()));
}
function sqlScope_uni(req,builder){
  const expression=(builder||scope.buildCobranzaProjectScopeSql_uni)(req,'pc');
  if(typeof expression!=='string'||!expression.trim())
    throw failPc_uni(403,'VA_ADMIN_ALTA_ALCANCE_INVALIDO','Alcance UNITED no disponible.');
  return expression;
}
function validateCalculated_uni(values){
  if(!values||typeof values!=='object'||Array.isArray(values))
    throw failPc_uni(422,'VA_ADMIN_ALTA_CALCULO_INCOMPLETO','No se verificaron los derivados.');
  const fields=Object.create(null);
  for(const name of PC_DERIVED_FIELDS_UNI){
    if(!Object.hasOwn(values,name))throw failPc_uni(422,'VA_ADMIN_ALTA_CALCULO_INCOMPLETO',
      'El alta requiere los 14 campos calculados.',{field:name});
    const value=values[name];
    const meta=TEXT_META_UNI.get(name);
    if(value===null){
      if(!['mes_ov','mes_factura','fecha_vencimiento'].includes(name))
        throw failPc_uni(422,'VA_ADMIN_ALTA_RELACION_INCOMPLETA',
          'El valor calculado no puede ser nulo.',{field:name});
      fields[name]=null;continue;
    }
    if(meta.sqlType==='int'){
      if(!Number.isSafeInteger(value)||value<-2147483648||value>2147483647)
        throw failPc_uni(422,'VA_ADMIN_ALTA_ENTERO_INVALIDO','Entero calculado invalido.',{field:name});
      fields[name]=value;continue;
    }
    if(meta.sqlType==='date'){
      if(typeof value!=='string'||!dateIso_uni(value))
        throw failPc_uni(422,'VA_ADMIN_ALTA_FECHA_CALCULADA_INVALIDA',
          'Fecha calculada invalida.',{field:name});
      fields[name]=value;continue;
    }
    if(meta.sqlType==='decimal(18,2)'){
      if(typeof value!=='string'||moneyToCents_uni(value)===null)
        throw failPc_uni(422,'VA_ADMIN_ALTA_IMPORTE_CALCULADO_INVALIDO',
          'Monto calculado invalido.',{field:name});
      fields[name]=value;continue;
    }
    if(typeof value!=='string')throw failPc_uni(422,'VA_ADMIN_ALTA_TEXTO_CALCULADO_INVALIDO',
      'Texto calculado invalido.',{field:name});
    const limit=Number((/varchar\((\d+)\)/.exec(meta.sqlType)||[])[1]);
    if(!Number.isSafeInteger(limit)||Array.from(value).length>limit)
      throw failPc_uni(422,'VA_ADMIN_ALTA_TEXTO_CALCULADO_EXCESIVO',
        'Derivado excede la longitud de pc.',{field:name});
    fields[name]=value;
  }
  return Object.freeze(fields);
}
function projectRow_uni(input,identity,id){
  return {id_pc:id||'0',id_proyecto_cobranza:String(identity.id_proyecto_cobranza),
    ...input.fields};
}
async function suggestId_uni(conn){
  const [rows]=await conn.query('SELECT CAST(MAX(`id_pc`) AS CHAR) AS max_id FROM `pc`');
  if(!Array.isArray(rows)||rows.length!==1)throw new Error('No se pudo obtener un consecutivo.');
  const max=rows[0].max_id;
  const next=max===null?1n:BigInt(idPc_uni(max))+1n;
  if(next<1n||next>MAX_ID_UNI)throw failPc_uni(409,'VA_ADMIN_ALTA_IDS_AGOTADOS',
    'No hay un consecutivo disponible para nuevas ventas.');
  return String(next);
}
async function checkIdAvailable_uni(conn,id,{lock=false}={}){
  const suffix=lock?' FOR UPDATE':'';
  const [rows]=await conn.query('SELECT CAST(`id_pc` AS CHAR) AS id_pc FROM `pc` '+
    'WHERE `id_pc` = ? LIMIT 1'+suffix,[id]);
  if(!Array.isArray(rows))throw new Error('No se pudo comprobar el consecutivo.');
  if(rows.length)throw failPc_uni(409,'VA_ADMIN_ALTA_ID_EXISTENTE',
    'El consecutivo ya existe; revisa el ID antes de crear.',{id_pc:id});
}
async function preparedCreate_uni(req,input,conn,deps){
  // Se reutiliza la autorizacion de F3, incluso en la simulacion de solo lectura.
  // El override true permite previsualizar mientras el activador GAS siga activo.
  const authorize=deps.authorizeWrite||authorizePcWrite_uni;
  const actor=await authorize(req,conn,deps.permissionResolver,true);
  const resolver=deps.identityResolver||identityFactory.crearServicioIdentidadProyectoUni({
    consultar:(sql,params)=>conn.query(sql,params)
  });
  const identity=await resolver.resolverIdentidadProyecto_uni({proyecto:input.fields.proyecto});
  if(identity?.valido!==true||!identity.id_proyecto_cobranza||
     !['VALIDO','VALIDO_SIN_ID'].includes(identity.estado)){
    throw failPc_uni(422,'VA_ADMIN_ALTA_IDENTIDAD_NO_VERIFICADA',
      'Proyecto ambiguo, generico o sin identidad de Cobranza comprobada.',
      {estado:identity?.estado||'SIN_RESOLVER'});
  }
  // Antes de INSERT no existe fila pc. El alcance oficial se aplica a una
  // proyeccion parametrizada de la fila pretendida (NO a un nombre inventado).
  const territory=sqlScope_uni(req,deps.scopeBuilder);
  const [allowed]=await conn.query('SELECT 1 AS autorizado FROM '+
    '(SELECT CAST(? AS CHAR(255)) AS proyecto, CAST(? AS UNSIGNED) AS id_proyecto_cobranza) pc '+
    'WHERE ('+territory+') LIMIT 1',
    [identity.proyecto,String(identity.id_proyecto_cobranza)]);
  if(!Array.isArray(allowed)||allowed.length!==1)
    throw failPc_uni(403,'VA_ADMIN_ALTA_FUERA_DE_ALCANCE',
      'No tienes alcance territorial para dar de alta esta venta.');
  const cutoff=todayMexicoCity_uni(deps.now||new Date());
  const row=projectRow_uni(input,identity,input.id_pc||'NUEVO');
  const relationFn=deps.relationsPreview||previewPcRelationsFromAiven_uni;
  const relation=await relationFn(req,conn,[row],cutoff,{
    scopeBuilder:deps.scopeBuilder||scope.buildCobranzaProjectScopeSql_uni,
    pendingRows:[row],identityResolver:resolver
  });
  if(relation?.mode!=='preview_only'||!Array.isArray(relation.rows)||
     relation.rows.length!==1||relation.rows[0].id_pc!==row.id_pc||
     relation?.project_summary?.complete!==1||relation?.project_summary?.incomplete!==0){
    throw failPc_uni(422,'VA_ADMIN_ALTA_ACUMULADOS_INCOMPLETOS',
      'No se pudo verificar el acumulado del proyecto sin mezclar registros.');
  }
  const match=relation.rows[0];
  if(!match?.values||!Array.isArray(match.warnings)||match.warnings.length){
    throw failPc_uni(422,'VA_ADMIN_ALTA_RELACIONES_AMBIGUAS',
      'Hay relaciones ambiguas o incompletas; no se puede crear el registro.',
      {advertencias:Array.isArray(match?.warnings)?match.warnings:[]});
  }
  const local=calculatePcLocal_uni({...row,...match.values},cutoff);
  const unexpected=local.warnings.filter(w=>
    w!=='FECHA_FACTURA_AUSENTE'||String(input.fields.estatus_administrativo).toLowerCase()==='abierta');
  if(unexpected.length){
    throw failPc_uni(422,'VA_ADMIN_ALTA_FORMULAS_INVALIDAS',
      'Los datos no permiten completar las formulas del alta.',{advertencias:unexpected});
  }
  const derived=validateCalculated_uni({...match.values,...local.values});
  if(derived.fecha_factura!==undefined){
    throw new Error('Contrato calculado invalido: factura de origen no es derivada.');
  }
  if(derived.terminos!==null&&termDays_uni(derived.terminos)===null){
    throw failPc_uni(422,'VA_ADMIN_ALTA_TERMINOS_INVALIDOS','Plazo no calculable.');
  }
  return {actor,identity,cutoff,derived,row};
}
async function executeCreate_uni(req,body,deps={},write=false){
  const input=normalizeCreatePc_uni(body,{requireId:write});
  // ALTA: si el activador sigue activo, no abre una conexion a Aiven para escribir.
  if(write&&!(deps.createEnabled??createGateEnabled_uni())){
    throw failPc_uni(403,'VA_ADMIN_ALTA_DESHABILITADA',
      'Alta deshabilitada: GAS debe permanecer activo hasta cerrar GC, VA y MP.');
  }
  const conn=deps.connection||await db.getConnection();
  let inTransaction=false;
  try{
    if(write){await conn.beginTransaction();inTransaction=true;}
    const prepared=await preparedCreate_uni(req,input,conn,deps);
    let proposedId=input.id_pc;
    if(!proposedId)proposedId=await suggestId_uni(conn);
    await checkIdAvailable_uni(conn,proposedId,{lock:write});
    const preview={ok:true,table:'pc',mode:'preview_only',write_enabled:false,
      id_pc:proposedId,id_sugerido:!input.id_pc,
      id_advertencia:'Consecutivo no reservado; la llave primaria valida disponibilidad al guardar.',
      id_proyecto_cobranza:String(prepared.identity.id_proyecto_cobranza),
      proyecto:prepared.identity.proyecto,as_of:prepared.cutoff,
      derived:prepared.derived,fields:input.fields,
      project_aggregate:{facturas_pendientes_pago:prepared.derived.facturas_pendientes_pago,
        adeudo:prepared.derived.adeudo}};
    if(!write)return preview;
    // Solo columnas en whitelist del contrato, ningun nombre SQL desde HTTP.
    const record={id_pc:proposedId,id_proyecto_cobranza:preview.id_proyecto_cobranza,
      ...input.fields,...prepared.derived};
    const columns=PC_COLUMNS_UNI.map(x=>x.name);
    const params=columns.map(key=>record[key]??null);
    const sql='INSERT INTO `pc` ('+columns.map(x=>'`'+x+'`').join(', ')+') VALUES ('+
      columns.map(()=>'?').join(', ')+')';
    const [result]=await conn.query(sql,params);
    if(Number(result?.affectedRows)!==1)throw new Error('El alta no afecto exactamente un registro.');
    const audit=deps.auditRecorder||auditPcCreate_uni;
    await audit(req,{id:proposedId,actor:prepared.actor,idProyecto:preview.id_proyecto_cobranza,
      manual:input.fields,derived:prepared.derived},conn);
    await conn.commit();inTransaction=false;
    return {ok:true,table:'pc',created:true,id_pc:proposedId,
      id_proyecto_cobranza:preview.id_proyecto_cobranza,as_of:prepared.cutoff};
  }catch(error){
    if(inTransaction){try{await conn.rollback();}catch(_rollback){error.rollbackFailed=true;}}
    if(error?.code==='ER_DUP_ENTRY'||Number(error?.errno)===1062)
      throw failPc_uni(409,'VA_ADMIN_ALTA_ID_EXISTENTE',
        'El consecutivo ya fue utilizado; no se creo un segundo registro.');
    throw error;
  }finally{if(!deps.connection)conn.release();}
}
module.exports=Object.freeze({
  createGateEnabled_uni,validateCalculated_uni,suggestId_uni,checkIdAvailable_uni,
  preflightCreatePc_uni:(req,body,deps={})=>executeCreate_uni(req,body,deps,false),
  createPc_uni:(req,body,deps={})=>executeCreate_uni(req,body,deps,true)
});
