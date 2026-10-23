'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_5_V001]
// Pruebas sin conexiones reales a Aiven, GAS o archivos ignorados.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const BASE=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(BASE,p),'utf8');
const moduleDir='../backend/src/modules/cobranza-uni-administracion/';
const rel=require(moduleDir+'cobranza-uni-administracion.pc-relations');
const f=require(moduleDir+'cobranza-uni-administracion.pc-formulas');
const cutoff='2026-10-23';
const identity=(project,id)=>({valido:true,estado:'VALIDO',proyecto:project,id_proyecto_cobranza:id});
const invoice=(id,project,fk,over={})=>({id_pc:String(id),proyecto:project,
  id_proyecto_cobranza:fk,cliente:'CLIENTE UNO',precio_venta:'100.00',tipo_pago:'FACTURA',
  fecha_factura:'2026-09-01',terminos:'45',estatus_administrativo:'Abierta',...over});
const mp=(id,project,fk,over={})=>({id_dmp:String(id),proyecto:project,id_proyecto_cobranza:fk,
  cliente:'CLIENTE UNO',condiciones_pago:'30',z_oper:'NORTE',estado:'NL',estatus_cartera:'Activo',...over});
const rA=invoice('2041','TORRE A','100');
const rB=invoice('2042','TORRE A','100',{estatus_administrativo:'Pagado por completo'});
const rC=invoice('2043','TORRE A','100',{fecha_factura:'2026-10-10'});
const rD=invoice('2050','PLAZA B','200',{precio_venta:'200.00',fecha_factura:'2026-08-01'});
const mA=mp('1','TORRE A','100');
const mB=mp('2','PLAZA B','200',{condiciones_pago:'60',z_oper:'OESTE',estado:'MEX'});
function make({pages=[rA,rB,rD],siblings=[rA,rB,rC,rD],mps=[mA,mB],
  identities=new Map([['2041',identity('TORRE A','100')],['2042',identity('TORRE A','100')],
    ['2050',identity('PLAZA B','200')]])}={}){
  return rel.buildPcRelationPreview_uni({pageRows:pages,identities,
    mpRows:mps,siblingRows:siblings,cutoffIso:cutoff});
}
const get=(preview,id)=>preview.rows.find(x=>x.id_pc===String(id));

function serviceMock(){
  const dir='backend/src/modules/cobranza-uni-administracion/';
  const sandbox={exports:{}};
  const fakeIdentityService={
    async resolverIdentidadProyecto_uni({proyecto,idProyectoCobranza}){
      if(proyecto==='GENÉRICO')return {valido:false,estado:'SIN_MAPEO'};
      return identity(proyecto,String(idProyectoCobranza||'100'));
    },
    construirFiltroIdentidadProyecto_uni(alias,ident){
      if(!ident.valido)return {protegido:false};
      return {protegido:true,
        sql:`TRIM(${alias}.proyecto) = TRIM(?) AND (${alias}.id_proyecto_cobranza = ? OR ${alias}.id_proyecto_cobranza IS NULL)`,
        params:[ident.proyecto,ident.id_proyecto_cobranza]};
    }
  };
  vm.runInNewContext(source(dir+'cobranza-uni-administracion.pc-relations-service.js'),{
    module:sandbox,exports:sandbox.exports,require:name=>{
      if(name==='../../services/cobranza-uni-scope.service')return {canonicalProjectSql_uni:()=>'(mp.proyecto)'};
      if(name==='../../services/cobranza-uni/identidad-proyecto.service')
        return {crearServicioIdentidadProyectoUni:()=>fakeIdentityService};
      if(name.endsWith('.pc-relations'))return rel;
      throw Error('Unmocked dependency: '+name);
    }
  });
  return {svc:sandbox.exports,identityService:fakeIdentityService};
}

test('F5: 6 derivados externos completan 14 calculados sin cambiar 31 campos',()=>{
  assert.deepEqual(rel.PREVIEW_RELATION_FIELDS_UNI,[
    'facturas_pendientes_pago','adeudo','terminos','zona_operativa','estado','estatus_cartera']);
  assert.equal(rel.PREVIEW_RELATION_FIELDS_UNI.length+f.PC_LOCAL_FORMULA_FIELDS_UNI.length,14);
  const contract=require(moduleDir+'cobranza-uni-administracion.constants');
  assert.equal(contract.PC_COLUMNS_UNI.length,31);
  assert.deepEqual(new Set([...f.PC_LOCAL_FORMULA_FIELDS_UNI,...rel.PREVIEW_RELATION_FIELDS_UNI]),
    new Set(contract.PC_DERIVED_FIELDS_UNI));
});

test('F5: consulta MP por proyecto verificado; los cuatro BUSCARV se emulan',()=>{
  const p=make({pages:[rA],identities:new Map([['2041',identity('TORRE A','100')]])});
  const v=get(p,'2041').values;
  assert.equal(v.terminos,'30');assert.equal(v.zona_operativa,'NORTE');
  assert.equal(v.estado,'NL');assert.equal(v.estatus_cartera,'Activo');
  assert.equal(v.facturas_pendientes_pago,1);assert.equal(v.adeudo,'116.00');
  assert.equal(get(p,'2041').sources.terminos,'proyecto_fk');
});

test('F5: fecha vencimiento de F4 utiliza terminos MP y no el valor almacenado PC',()=>{
  const p=make({pages:[rA],identities:new Map([['2041',identity('TORRE A','100')]])});
  assert.equal(rA.terminos,'45');assert.equal(p.formula_rows[0].terminos,'30');
  assert.equal(f.calculatePcLocal_uni(p.formula_rows[0],cutoff).values.fecha_vencimiento,'2026-10-01');
  assert.equal(f.calculatePcLocal_uni(rA,cutoff).values.fecha_vencimiento,'2026-10-16');
});

test('F5: acumulados de todo el proyecto, no solamente de la pagina; KPI sin duplicar',()=>{
  const p=make();
  assert.equal(p.project_summary.projects,2);
  assert.equal(p.project_summary.complete,2);
  assert.equal(p.project_summary.adeudo,'348.00');
  assert.equal(p.project_summary.facturas_pendientes_pago,2);
  assert.equal(get(p,'2041').values.adeudo,'116.00');
  assert.equal(get(p,'2042').values.adeudo,'116.00');
  assert.equal(get(p,'2050').values.adeudo,'232.00');
  assert.equal(get(p,'2042').values.facturas_pendientes_pago,1);
});

test('F5: varias facturas del mismo proyecto no duplican acumulados',()=>{
  const p=make({pages:[rA,rB],identities:new Map([
    ['2041',identity('TORRE A','100')],['2042',identity('TORRE A','100')]])});
  assert.equal(p.project_summary.projects,1);
  assert.equal(p.project_summary.adeudo,'116.00');
  assert.equal(p.project_summary.facturas_pendientes_pago,1);
});

test('F5: mismo nombre con otro FK no mezcla venta ni origen MP',()=>{
  const wrong=mp('13','TORRE A','999',{z_oper:'SUR',condiciones_pago:'90'});
  const p=make({pages:[rA],mps:[mA,wrong],siblings:[rA,invoice('900','TORRE A','999',{
    precio_venta:'999.00'})],identities:new Map([['2041',identity('TORRE A','100')]])});
  assert.equal(get(p,'2041').values.zona_operativa,'NORTE');
  assert.equal(get(p,'2041').values.adeudo,'116.00');
  assert.equal(get(p,'2041').values.terminos,'30');
});

test('F5: fallback por nombre con FK NULL, solo identidad catalogada valida',()=>{
  const row=invoice('4','TORRE A',null);
  const p=make({pages:[row],mps:[mp('5','TORRE A',null)],siblings:[row],
    identities:new Map([['4',{...identity('TORRE A','100'),estado:'VALIDO_SIN_ID'}]])});
  assert.equal(get(p,'4').values.zona_operativa,'NORTE');
  assert.equal(get(p,'4').sources.terminos,'proyecto_validado_sin_fk');
});

test('F5: FK 0 no equivale a FK NULL ni autoriza sumar hermano',()=>{
  assert.equal(rel.sameVerifiedProject_uni(invoice('22','TORRE A','0'),identity('TORRE A','100')),false);
  assert.equal(rel.sameVerifiedProject_uni(invoice('22','TORRE A',null),identity('TORRE A','100')),true);
});

test('F5: terminos contradictorios MP invalidan el acumulado, aunque pc tenga termino',()=>{
  const result=make({pages:[rA],identities:new Map([['2041',identity('TORRE A','100')]]),
    siblings:[rA],mps:[mA,mp('11','TORRE A','100',{condiciones_pago:'60'})]});
  assert.equal(get(result,'2041').values.adeudo,undefined);
  assert.equal(result.project_summary.adeudo,null);
  assert.ok(get(result,'2041').warnings.includes('TERMINOS_RELACION_CONFLICTIVA'));
});

test('F5: proyecto ambiguo no produce acumulados ni estatus-cartera inferido',()=>{
  const gen=invoice('2284','GENÉRICO',null,{cliente:'C2359'});
  const p=make({pages:[gen],mps:[mp('56','OBRA Z','90',{cliente:'OTRO'})],siblings:[gen],
    identities:new Map([['2284',{valido:false,estado:'SIN_MAPEO'}]])});
  assert.equal(p.project_summary.projects,0);
  assert.equal(get(p,'2284').values.adeudo,undefined);
  assert.equal(get(p,'2284').values.estatus_cartera,undefined);
  assert.ok(get(p,'2284').warnings.includes('IDENTIDAD_PROYECTO_SIN_MAPEO'));
});

test('F5: fallback de cliente solo si todos los terminos coinciden (incluye 0 dias)',()=>{
  const gen=invoice('2284','GENÉRICO',null,{cliente:'C2359'});
  const id=new Map([['2284',{valido:false,estado:'SIN_MAPEO'}]]);
  const p=make({pages:[gen],identities:id,siblings:[gen],mps:[
    mp('8','OBRA Z','10',{cliente:'C2359',condiciones_pago:'0'}),
    mp('9','OBRA Y','11',{cliente:'C2359',condiciones_pago:'0'})]});
  assert.equal(get(p,'2284').values.terminos,'0');
  assert.equal(get(p,'2284').sources.terminos,'cliente_consistente');
  assert.equal(p.formula_rows[0].terminos,'0');
});

test('F5: condiciones de cliente contradictorias no eligen primera fila',()=>{
  const gen=invoice('2284','GENÉRICO',null,{cliente:'C2359'});
  const p=make({pages:[gen],identities:new Map([['2284',{valido:false,estado:'SIN_MAPEO'}]]),
    siblings:[],mps:[mp('8','X','12',{cliente:'C2359',condiciones_pago:'30'}),
      mp('9','Y','13',{cliente:'C2359',condiciones_pago:'60'})]});
  assert.equal(get(p,'2284').values.terminos,undefined);
  assert.ok(get(p,'2284').warnings.includes('TERMINOS_CLIENTE_CONFLICT'));
  assert.equal(p.formula_rows[0],gen);
});

test('F5: conflictos independientes de MP por campo, sin bloquear campos consistentes',()=>{
  const p=make({pages:[rA],identities:new Map([['2041',identity('TORRE A','100')]]),
    mps:[mA,mp('30','TORRE A','100',{estado:'TAMPS'})]});
  const data=get(p,'2041');
  assert.equal(data.values.terminos,'30');
  assert.equal(data.values.estado,undefined);
  assert.ok(data.warnings.includes('ESTADO_MP_CONFLICT'));
  assert.equal(data.values.zona_operativa,'NORTE');
});

test('F5: MP sin coincidencia => INACTIVO solo si proyecto esta verificado',()=>{
  const p=make({pages:[rA],identities:new Map([['2041',identity('TORRE A','100')]]),
    mps:[],siblings:[rA]});
  assert.equal(get(p,'2041').values.estatus_cartera,'Inactivo');
  assert.equal(get(p,'2041').values.terminos,undefined);
  assert.equal(get(p,'2041').values.adeudo,'116.00'); // usa terminos ya almacenados en Aiven
});

test('F5: NULL y diferentes plazos son conflicto, no inventa terminos',()=>{
  assert.deepEqual(rel.fieldValue_uni([{condiciones_pago:null},{condiciones_pago:'30'}],
    'condiciones_pago'),{state:'incomplete',value:null});
  assert.deepEqual(rel.fieldValue_uni([{condiciones_pago:'30'},{condiciones_pago:'45'}],
    'condiciones_pago'),{state:'conflict',value:null});
  assert.equal(rel.fieldValue_uni([{condiciones_pago:'0'}],'condiciones_pago').value,'0');
  assert.equal(rel.fieldValue_uni([{condiciones_pago:'30 días'}],'condiciones_pago').state,'invalid');
});

test('F5: vencimiento indeterminado impide subtotal parcial y marca revision',()=>{
  const bad=invoice('1002','TORRE A','100',{fecha_factura:'2026-09-01',terminos:null});
  const result=make({pages:[rA],identities:new Map([['2041',identity('TORRE A','100')]]),
    siblings:[rA,bad],mps:[]});
  assert.equal(get(result,'2041').values.adeudo,undefined);
  assert.equal(result.project_summary.adeudo,null);
  assert.equal(result.project_summary.incomplete,1);
  assert.ok(get(result,'2041').warnings.includes('VENCIMIENTO_NO_CALCULABLE'));
});

test('F5: precio IVA no representable impide subtotal; no hay sobreflujo',()=>{
  const huge=invoice('3001','TORRE A','100',{precio_venta:'9999999999999999.99'});
  const result=make({pages:[rA],identities:new Map([['2041',identity('TORRE A','100')]]),
    siblings:[rA,huge]});
  assert.equal(result.project_summary.incomplete,1);
  assert.equal(get(result,'2041').values.facturas_pendientes_pago,undefined);
});

test('F5: longitud del cliente y SQL de MP/PC son SELECT parametrizados',()=>{
  const {svc,identityService}=serviceMock();
  const keys=[identity('TORRE A','100')];
  const filters={clauses:['TRIM(mp.proyecto) = ? AND (mp.id_proyecto_cobranza = ? OR mp.id_proyecto_cobranza IS NULL)'],
    params:['TORRE A','100']};
  const mq=svc.sqlMp_uni({filters,clients:['CLIENTE UNO'],territory:'(mp.id_dmp>0)',canonical:'(mp.proyecto)'});
  const pq=svc.sqlPcSiblings_uni({filters:{clauses:filters.clauses.map(s=>s.replaceAll('mp.','pc.')),
    params:filters.params},territory:'(pc.id_pc>0)'});
  assert.match(mq(0,500).sql,/^SELECT /);
  assert.match(mq(0,500).sql,/mp\.id_dmp>0/);
  assert.match(mq(0,500).sql,/mp\.proyecto/);
  assert.deepEqual(Array.from(mq(0,500).params),['TORRE A','100','CLIENTE UNO',500,0]);
  assert.match(pq(0,500).sql,/pc\.id_pc>0/);
  assert.ok(!/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|TRUNCATE|DROP)\s+(?:INTO\s+|FROM\s+)?`?(?:pc|detalle_mp_2026)`?/i.test(mq(0,500).sql+pq(0,500).sql));
  assert.ok(svc.uniqueClients_uni([{cliente:'A'}, {cliente:'a'}, {cliente:'B'}]).length===2);
  assert.equal(identityService.resolverIdentidadProyecto_uni instanceof Function,true);
});

test('F5: consulta los hermanos y MP con scopes separados; sin UPDATE',async()=>{
  const {svc}=serviceMock();const sqls=[];let pc=0,mpCount=0;
  const db={async query(sql,args){sqls.push({sql,args});
    if(sql.includes('FROM `detalle_mp_2026` mp')){mpCount++;return [[mA]];}
    if(sql.includes('FROM `pc` pc')){pc++;return [[rA,rC]];}
    throw Error('SQL desconocido '+sql);
  }};
  const res=await svc.previewPcRelationsFromAiven_uni({query:{}},db,[rA],cutoff,{
    scopeBuilder:(_req,alias)=>alias==='mp'?'mp.id_dmp>0':'pc.id_pc>0',
    canonicalProjectSql:()=>'(mp.proyecto)'
  });
  assert.equal(mpCount,1);assert.equal(pc,1);
  assert.ok(sqls.every(x=>/^SELECT\s/.test(x.sql)));
  assert.equal(get(res,'2041').values.adeudo,'116.00');
  assert.equal(res.formula_rows[0].terminos,'30');
  assert.equal(res.project_summary.projects,1);
});

test('F5: cuando la consulta de hermanos devuelve cero, no inventa acumulados',async()=>{
  const {svc}=serviceMock();const db={async query(sql){
    if(sql.includes('FROM `detalle_mp_2026` mp'))return [[mA]];
    return [[]];
  }};
  const res=await svc.previewPcRelationsFromAiven_uni({},db,[rA],cutoff,{
    scopeBuilder:()=>'(1=1)',canonicalProjectSql:()=>'(mp.proyecto)'});
  assert.equal(get(res,'2041').values.facturas_pendientes_pago,undefined);
  assert.equal(get(res,'2041').values.adeudo,undefined);
  assert.ok(get(res,'2041').warnings.includes('VENTAS_PROYECTO_NO_ENCONTRADAS'));
});

test('F5: sin registros en pagina no consulta SQL extra',async()=>{
  const {svc}=serviceMock();const r=await svc.previewPcRelationsFromAiven_uni({},
    {query(){throw Error('Consulto en vacio');}},[],cutoff,{});
  assert.deepEqual(Array.from(r.rows),[]);
});

test('F5: limite de seguridad evita subtotales calculados con datos truncados',async()=>{
  const {svc}=serviceMock();let calls=0;
  const rows=Array.from({length:500},(_,i)=>({id_pc:String(i+1)}));
  await assert.rejects(svc.queryPaged_uni({async query(){calls++;
    return [calls===1?rows:rows.slice(0,1)];}},
    ()=>({sql:'SELECT * FROM pc LIMIT ? OFFSET ?',params:[]}),500),/Limite seguro/);
  assert.equal(calls,2);
});

test('F5: rechaza SQL distinto de SELECT, respuestas invalidas y paginas > 100',async()=>{
  const {svc}=serviceMock();
  await assert.rejects(svc.queryPaged_uni({query(){throw Error('MAL');}},
    ()=>({sql:'UPDATE pc SET x=1',params:[]})),/no es SELECT/);
  await assert.rejects(svc.previewPcRelationsFromAiven_uni({}, {}, Array(101).fill(rA),cutoff),
    /fuera de contrato/);
  assert.equal(rel.idText_uni('9007199254740993'),'9007199254740993');
  assert.equal(rel.idText_uni('0'),null);
});

test('F5: UI usa las 14 columnas en preview, marca advertencias y no suma facturas repetidas',()=>{
  const js=source('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js');
  const css=source('modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css');
  const main=source('modules/cobranza-uni/administracion/main/main.js');
  assert.match(js,/relation_preview/);
  assert.match(js,/RELATED_CALCULATED/);
  assert.match(js,/ALL_PREVIEW/);
  assert.match(js,/data-pc-relations/);
  assert.match(js,/Proyectos únicos de esta página/);
  assert.match(js,/GC, VA y MP/);
  assert.match(js,/ESC\(title\)/);
  assert.match(css,/cua-pc-relations-summary/);
  assert.match(main,/20261023-va-f6-v001/);
  assert.match(js, /method:'POST'/); // F6 post con triple candado
  assert.doesNotMatch(js, /method:'DELETE'/);
});

test('F5: servicio conserva rows crudos, corte unico y relacion en canal distinto',async()=>{
  const src=source('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js');
  const m={exports:{}};
  vm.runInNewContext(src,{module:m,exports:m.exports,require:name=>{
    if(name==='../../config/db')return {};
    if(name==='../../services/cobranza-uni-scope.service')return {};
    if(name.endsWith('.constants'))return require(moduleDir+'cobranza-uni-administracion.constants');
    if(name.endsWith('.pc-formulas'))return f;
    if(name.endsWith('.pc-relations-service'))return {previewPcRelationsFromAiven_uni(){throw Error('mock expected');}};
    if(name.endsWith('.pc-query'))return require(moduleDir+'cobranza-uni-administracion.pc-query');
    throw Error('Unmocked '+name);
  }});
  let calls=0;
  const db={async query(){calls++;return calls===1?[[{total:'1'}]]:[[rA]];}};
  const relationPreview=async(_req,_db,rows,asOf)=>make({pages:rows,siblings:[rA,rC],mps:[mA],
    identities:new Map([['2041',identity('TORRE A','100')]])});
  const response=await m.exports.listVentaAdicionalAdmin_uni({query:{}},{
    connection:db,scopeBuilder:()=>'(pc.id_pc>0)',
    relationsPreview:relationPreview,now:new Date('2026-10-24T04:00:00Z')});
  assert.equal(calls,2);assert.equal(response.rows[0],rA);
  assert.equal(response.rows[0].terminos,'45');
  assert.equal(response.formula_preview.rows[0].values.fecha_vencimiento,'2026-10-01');
  assert.equal(response.relation_preview.rows[0].values.terminos,'30');
  assert.equal(response.relation_preview.formula_rows,undefined);
  assert.equal(response.relation_preview.project_summary.adeudo,'116.00');
});

test('F5: GAS sin cambios; PATCH de VA bloqueado por default y sin SQL en paquete',()=>{
  const edit=source('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js');
  const sql=source('backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-relations-service.js');
  assert.match(edit,/PC_ADMIN_EDIT_ENABLED/);
  assert.match(edit,/process\.env\.PC_ADMIN_EDIT_ENABLED\|\|''/);
  assert.match(source('.gitignore'),/^\*\.sql$/m);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|INSERT)\s+(?:INTO\s+|FROM\s+)?`?(?:pc|detalle_mp_2026)`?/i);
  assert.doesNotMatch(sql,/ScriptApp|deleteTrigger|deleteProjectTrigger|triggerUid/);
});
