'use strict';
// Persistencia acotada de las formulas VA tras cambios humanos. Todo usa la
// conexion de la transaccion que bloqueo y escribio la captura original.
const scope=require('../../services/cobranza-uni-scope.service');
const identityFactory=require('../../services/cobranza-uni/identidad-proyecto.service');
const {PC_COLUMNS_UNI,PC_DERIVED_FIELDS_UNI}=require('./cobranza-uni-administracion.constants');
const {failPc_uni}=require('./cobranza-uni-administracion.pc-edit-validation');
const {previewPcRelationsFromAiven_uni}=require('./cobranza-uni-administracion.pc-relations-service');
const {todayMexicoCity_uni,calculatePcLocal_uni,dateIso_uni,moneyToCents_uni}=
  require('./cobranza-uni-administracion.pc-formulas');
const {auditPcCell_uni}=require('./cobranza-uni-administracion.pc-edit-audit');

const MAX_PROJECT_ROWS=100;
const ORIGINS=new Set(['fecha_ov','proyecto','cliente','precio_venta','tipo_pago',
  'fecha_factura','estatus_administrativo']);
const META=new Map(PC_COLUMNS_UNI.map(column=>[column.name,column]));
const SELECT_FIELDS=PC_COLUMNS_UNI.map(({name,sqlType})=>
  name==='id_pc'||name==='id_proyecto_cobranza'||sqlType==='date'
    ?`CAST(pc.\`${name}\` AS CHAR) AS \`${name}\``:`pc.\`${name}\``).join(', ');
function normalValue_uni(name,value){
  if(value===undefined||value===null||value==='')return null;
  const type=META.get(name)?.sqlType;
  if(type==='decimal(18,2)'){
    const cents=moneyToCents_uni(value);
    if(cents===null)throw failPc_uni(422,'VA_ADMIN_DERIVADO_MONTO_INVALIDO',
      'Monto automatico no representable.',{field:name});
    return cents.toString();
  }
  if(type==='int'){
    const raw=String(value);
    if(!/^-?\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||
      Number(raw)<-2147483648||Number(raw)>2147483647)
      throw failPc_uni(422,'VA_ADMIN_DERIVADO_ENTERO_INVALIDO',
        'Entero automatico fuera de rango.',{field:name});
    return String(Number(raw));
  }
  if(type==='date'&&!dateIso_uni(value))
    throw failPc_uni(422,'VA_ADMIN_DERIVADO_FECHA_INVALIDA',
      'Fecha automatica invalida.',{field:name});
  const text=String(value);
  const limit=Number((/varchar\((\d+)\)/.exec(type||'')||[])[1]);
  if(Number.isSafeInteger(limit)&&Array.from(text).length>limit)
    throw failPc_uni(422,'VA_ADMIN_DERIVADO_TEXTO_EXCESIVO',
      'Derivado excede el limite de la columna.',{field:name});
  return text;
}
function reference_uni(row){
  return {proyecto:row?.proyecto??null,
    id_proyecto_cobranza:row?.id_proyecto_cobranza??null};
}
function refKey_uni(ref){
  return String(ref.proyecto??'').trim().normalize('NFC').toLowerCase()+'\u0001'+
    String(ref.id_proyecto_cobranza??'');
}
async function persistPcDerivedAfterEdit_uni(conn,req,changes,deps={}){
  if(!Array.isArray(changes)||changes.length<1||changes.length>20)
    throw new TypeError('Cambios VA fuera de contrato.');
  const field=changes[0].field;
  if(!ORIGINS.has(field))return {calculated:0,projects:0};
  const scopeBuilder=deps.scopeBuilder||scope.buildCobranzaProjectScopeSql_uni;
  const territory=scopeBuilder(req,'pc');
  if(typeof territory!=='string'||!territory.trim())
    throw failPc_uni(403,'VA_ADMIN_ALCANCE_INVALIDO','Alcance de VA no disponible.');
  const ids=changes.map(change=>change.id);
  const placeholders=ids.map(()=>'?').join(', ');
  const [current]=await conn.query(`SELECT ${SELECT_FIELDS} FROM \`pc\` pc `+
    `WHERE pc.\`id_pc\` IN (${placeholders}) AND (${territory}) `+
    'ORDER BY pc.`id_pc` ASC FOR UPDATE',ids);
  if(!Array.isArray(current)||current.length!==ids.length||
    new Set(current.map(row=>String(row.id_pc))).size!==ids.length)
    throw failPc_uni(409,'VA_ADMIN_DERIVADOS_FILAS_INVALIDAS',
      'No se pudieron verificar las ventas editadas.');
  const actor=changes[0].actor;
  const audit=deps.auditRecorder||auditPcCell_uni;
  const cutoff=todayMexicoCity_uni(deps.now||new Date());
  // Fecha OV solo alimenta MES OV: evitar lecturas relacionales innecesarias.
  if(field==='fecha_ov'){
    let calculated=0;
    for(const row of current){
      const value=calculatePcLocal_uni(row,cutoff).values.mes_ov;
      if(normalValue_uni('mes_ov',row.mes_ov)===normalValue_uni('mes_ov',value))continue;
      const [updated]=await conn.query('UPDATE `pc` pc SET pc.`mes_ov` = ? '+
        `WHERE pc.\`id_pc\` = ? AND (${territory})`,[value,row.id_pc]);
      if(Number(updated?.affectedRows)!==1)
        throw failPc_uni(409,'VA_ADMIN_DERIVADO_NO_CONFIRMADO','No se guardo MES OV.');
      await audit(req,{id:row.id_pc,field:'mes_ov',before:row.mes_ov??null,
        after:value,operation:'derived',actor},conn);
      calculated++;
    }
    return {calculated,projects:0};
  }
  const identityResolver=deps.identityResolver||identityFactory.crearServicioIdentidadProyectoUni({
    consultar:(sql,params)=>conn.query(sql,params)
  });
  const refs=new Map();
  for(const row of current)refs.set(refKey_uni(reference_uni(row)),reference_uni(row));
  if(field==='proyecto')for(const change of changes){
    const old={proyecto:change.oldProject,
      id_proyecto_cobranza:change.oldFk};
    if(old.proyecto)refs.set(refKey_uni(old),old);
  }
  let calculated=0,projects=0;
  for(const ref of refs.values()){
    const identity=await identityResolver.resolverIdentidadProyecto_uni({
      proyecto:ref.proyecto,idProyectoCobranza:ref.id_proyecto_cobranza
    });
    if(identity?.valido!==true)
      throw failPc_uni(409,'VA_ADMIN_IDENTIDAD_NO_VERIFICADA',
        'No se pudo comprobar el proyecto para actualizar sus formulas.',
        {proyecto:ref.proyecto,estado:identity?.estado});
    const filter=identityResolver.construirFiltroIdentidadProyecto_uni('pc',identity);
    if(!filter?.protegido||!Array.isArray(filter.params))
      throw failPc_uni(409,'VA_ADMIN_IDENTIDAD_NO_VERIFICADA',
        'Filtro de proyecto no verificable.');
    const [rows]=await conn.query(`SELECT ${SELECT_FIELDS} FROM \`pc\` pc `+
      `WHERE (${territory}) AND (${filter.sql}) ORDER BY pc.\`id_pc\` ASC `+
      'LIMIT ? FOR UPDATE',[...filter.params,MAX_PROJECT_ROWS+1]);
    if(!Array.isArray(rows)||rows.length>MAX_PROJECT_ROWS)
      throw failPc_uni(409,'VA_ADMIN_PROYECTO_DEMASIADO_GRANDE',
        'El proyecto supera el limite seguro de recálculo por operación.',
        {limit:MAX_PROJECT_ROWS});
    if(!rows.length)continue; // proyecto anterior sin ventas tras mover la fila
    const preview=await (deps.relationsPreview||previewPcRelationsFromAiven_uni)(
      req,conn,rows,cutoff,{scopeBuilder,identityResolver,
        siblingRowsOverride:rows,maxRelatedRows:1000});
    if(preview?.mode!=='preview_only'||preview?.project_summary?.complete!==1||
      preview?.project_summary?.incomplete!==0||
      !Array.isArray(preview.rows)||preview.rows.length!==rows.length||
      !Array.isArray(preview.formula_rows)||preview.formula_rows.length!==rows.length)
      throw failPc_uni(422,'VA_ADMIN_ACUMULADOS_NO_VERIFICADOS',
        'No se pudo recalcular el proyecto sin datos parciales.');
    for(let i=0;i<rows.length;i++){
      const row=rows[i],relation=preview.rows[i];
      if(String(relation?.id_pc)!==String(row.id_pc))
        throw failPc_uni(409,'VA_ADMIN_DERIVADOS_FILAS_INVALIDAS',
          'La relación no corresponde a la venta bloqueada.');
      if((relation.warnings||[]).some(code=>
        /(?:_CONFLICT|_INCOMPLETE|_INVALID|IDENTIDAD_PROYECTO)/.test(code)))
        throw failPc_uni(422,'VA_ADMIN_RELACION_AMBIGUA',
          'Una relación de MP no permite persistir formulas confiables.',
          {id:row.id_pc,warnings:relation.warnings});
      const local=calculatePcLocal_uni(preview.formula_rows[i],cutoff);
      const derived={...relation.values,...local.values};
      const delta=[];
      for(const name of PC_DERIVED_FIELDS_UNI){
        if(!Object.hasOwn(derived,name))continue; // origen relacional ausente
        if(normalValue_uni(name,row[name])!==normalValue_uni(name,derived[name]))
          delta.push({field:name,before:row[name]??null,after:derived[name]});
      }
      if(!delta.length)continue;
      const setters=delta.map(change=>`pc.\`${change.field}\` = ?`).join(', ');
      const [updated]=await conn.query(`UPDATE \`pc\` pc SET ${setters} `+
        `WHERE pc.\`id_pc\` = ? AND (${territory})`,
        [...delta.map(change=>change.after),row.id_pc]);
      if(Number(updated?.affectedRows)!==1)
        throw failPc_uni(409,'VA_ADMIN_DERIVADO_NO_CONFIRMADO',
          'No se confirmaron los campos automáticos; operación revertida.');
      await audit(req,{id:row.id_pc,field:'derivados',before:null,after:null,
        operation:'derived',actor,derived_changes:delta},conn);
      calculated+=delta.length;
    }
    projects++;
  }
  return {calculated,projects};
}
async function persistPcDerivedForMpChange_uni(conn,req,refs,actor,deps={}){
  if(!Array.isArray(refs)||refs.length>40)
    throw new TypeError('Referencias MP fuera de contrato.');
  const scopeBuilder=deps.scopeBuilder||scope.buildCobranzaProjectScopeSql_uni;
  const territory=scopeBuilder(req,'pc');
  if(typeof territory!=='string'||!territory.trim())
    throw failPc_uni(403,'VA_ADMIN_ALCANCE_INVALIDO','Alcance VA no disponible.');
  const criteria=[],params=[];
  for(const ref of refs){
    if(typeof ref?.proyecto==='string'&&ref.proyecto.trim()){
      criteria.push('TRIM(pc.`proyecto`) COLLATE utf8mb4_0900_as_ci = '+
        'TRIM(?) COLLATE utf8mb4_0900_as_ci');
      params.push(ref.proyecto);
    }
    if(typeof ref?.cliente==='string'&&ref.cliente.trim()){
      criteria.push('TRIM(pc.`cliente`) COLLATE utf8mb4_0900_as_ci = '+
        'TRIM(?) COLLATE utf8mb4_0900_as_ci');
      params.push(ref.cliente);
    }
  }
  if(!criteria.length)return {calculated:0,projects:0};
  const [rows]=await conn.query('SELECT CAST(pc.`id_pc` AS CHAR) AS id_pc, '+
    'pc.`proyecto`, CAST(pc.`id_proyecto_cobranza` AS CHAR) AS id_proyecto_cobranza '+
    'FROM `pc` pc WHERE ('+territory+') AND ('+criteria.join(' OR ')+') '+
    'ORDER BY pc.`id_pc` ASC LIMIT 101',params);
  if(!Array.isArray(rows)||rows.length>100)
    throw failPc_uni(409,'VA_ADMIN_RELACIONES_DEMASIADAS',
      'El cambio MP afecta demasiadas ventas para una sola transacción.');
  const representatives=new Map();
  for(const row of rows)representatives.set(refKey_uni(reference_uni(row)),row.id_pc);
  if(representatives.size>10)
    throw failPc_uni(409,'VA_ADMIN_PROYECTOS_DEMASIADOS',
      'El cambio MP afecta demasiados proyectos para una sola transacción.');
  let calculated=0;
  for(const id of representatives.values()){
    const result=await persistPcDerivedAfterEdit_uni(conn,req,
      [{id,field:'cliente',actor}],deps);
    calculated+=result.calculated;
  }
  return {calculated,projects:representatives.size};
}
module.exports=Object.freeze({persistPcDerivedAfterEdit_uni,
  persistPcDerivedForMpChange_uni,ORIGINS,MAX_PROJECT_ROWS});
