'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_4_V001]
// Pruebas 100% locales: sin credenciales, DB, despliegue ni GAS.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const folder='backend/src/modules/cobranza-uni-administracion/';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const C=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');
const F=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
const V=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-edit-validation');
const Q=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-query');
const RIGHTS=new Map([['MAIN',true],['MP.VER',true],['MP.EDITAR',true]]);
const PERM={MAIN_VISUAL:'MAIN',TABLE_PERMISSIONS:{detalle_mp_2026:{view:'MP.VER',edit:'MP.EDITAR'}}};
const REQ={contextUser:{id_SB:5},viewerContext:{active:false},
  informationAccess:{empresa:'UNITED',acceso_puerta:true,effective_user_id:5},
  originalUrl:'/api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros/41'};
function load(file,modules,globals={}){
  const mod={exports:{}};
  vm.runInNewContext(read(file),{module:mod,exports:mod.exports,require:name=>{
    if(Object.hasOwn(modules,name))return modules[name];
    throw new Error('Dependencia no preparada en prueba: '+name);
  },...globals});
  return mod.exports;
}
function service(env={}){
  return load(folder+'cobranza-uni-administracion.mp-edit-service.js',{
    '../../config/db':{getConnection(){throw Error('Conexion Aiven no simulada');}},
    '../../services/cobranza-uni-scope.service':{
      buildCobranzaProjectScopeSql_uni:(req,alias)=>{
        assert.equal(alias,'mp');return 'mp.id_dmp > 0';
      },
      canonicalProjectSql_uni:alias=>{
        assert.equal(alias,'mp');return 'mp.proyecto';
      }
    },
    '../../services/permissions/effective-permission.service':{listEffectivePermissions:async()=>RIGHTS},
    './cobranza-uni-administracion.permissions':PERM,
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.mp-edit-audit':{auditMpCell_uni(){throw Error('Auditoria real no autorizada');}},
    './cobranza-uni-administracion.mp-edit-validation':V,
    './cobranza-uni-administracion.mp-formulas':F
  },{process:{env}});
}
function mockDb(data={}){
  const state=new Map(Object.entries(data).map(([id,values])=>[id,{...values}]));
  const log=[];let backup=null;
  let commits=0,rollbacks=0,begins=0;
  const db={
    async beginTransaction(){log.push(['BEGIN']);begins++;backup=new Map([...state].map(([id,values])=>[id,{...values}]));},
    async query(sql,params){
      log.push([sql,params]);
      if(/FOR UPDATE$/.test(sql)){
        const row=state.get(String(params[0]));
        return row?[[{id_dmp:String(params[0]),original_value:row.factor,
          original_iguala:row.iguala,original_monto_anual:row.monto}]]:[[]];
      }
      if(/^UPDATE `detalle_mp_2026` mp SET/.test(sql)){
        const id=String(params.at(-1));const row=state.get(id);
        if(!row)return [{affectedRows:0}];
        row.factor=params[0];
        if(sql.includes('mp.`monto_anual` = ?'))row.monto=params[1];
        return [{affectedRows:1}];
      }
      throw Error('SQL inesperado '+sql);
    },
    async commit(){log.push(['COMMIT']);commits++;backup=null;},
    async rollback(){log.push(['ROLLBACK']);rollbacks++;if(backup){state.clear();for(const [id,row] of backup)state.set(id,row);}backup=null;},
    release(){}
  };
  return {db,state,log,stats:()=>({begins,commits,rollbacks})};
}
function deps(mock,extra={}){
  const audit=[];
  return {connection:mock.db,featureEnabled:true,
    permissionResolver:async()=>RIGHTS,
    auditRecorder:async(req,change,conn)=>{
      assert.equal(conn,mock.db);audit.push(change);
      if(extra.failAudit)throw new Error('Auditoria simulada rechazada');
      return '1';
    },...extra,logs:()=>audit};
}

test('MP F4: contrato original sigue 20/128 y fuente de formula exige factor manual',()=>{
  assert.equal(C.MP_COLUMNS_UNI.length,20);
  assert.equal(C.MP_ZONE1_COLUMNS_UNI.length,128);
  assert.deepEqual(C.MP_FORMULAS_UNI.monto_anual.dependencies,['iguala','factor_monto_anual']);
  assert.equal(C.MP_RULES_UNI.writesEnabled,false);
  assert.equal(C.MP_RULES_UNI.gasSyncRemainsActive,true);
});
test('MP F4: calcula importe en centavos exactos, sin redondeo JS y admite x6/x12',()=>{
  assert.equal(F.previewMontoAnualMp_uni({iguala:'10.25',factor_monto_anual:6,monto_anual:'61.50'}).calculated,'61.50');
  assert.equal(F.previewMontoAnualMp_uni({iguala:'10.25',factor_monto_anual:'12',monto_anual:'99.00'}).calculated,'123.00');
  assert.equal(F.previewMontoAnualMp_uni({iguala:'900719925474.09',factor_monto_anual:12,monto_anual:null}).calculated,'10808639105689.08');
  assert.equal(F.previewMontoAnualMp_uni({iguala:'-42.01',factor_monto_anual:2,monto_anual:'-84.02'}).calculated,'-84.02');
  assert.equal(F.previewMontoAnualMp_uni({iguala:'0.00',factor_monto_anual:12,monto_anual:null}).calculated,'0.00');
});
test('MP F4: sin factor no infiere x6 ni x12, preserva monto existente',()=>{
  for(const factor of [null,undefined,'']){
    const result=F.previewMontoAnualMp_uni({iguala:'200.00',factor_monto_anual:factor,monto_anual:'1200.00'});
    assert.equal(result.status,'sin_factor');assert.equal(result.calculated,null);
    assert.equal(result.stored,'1200.00');assert.equal(result.matches_stored,null);
  }
  assert.equal(F.previewMontoAnualMp_uni({iguala:null,factor_monto_anual:12,monto_anual:'800.00'}).status,'sin_iguala');
});
test('MP F4: factor cero, fraccion, mayor de 65535 y dinero no confiable son invalidados',()=>{
  for(const factor of [0,'0','1.5','65536','-2','abc',Infinity]){
    assert.equal(F.previewMontoAnualMp_uni({iguala:'200.00',factor_monto_anual:factor}).status,'factor_invalido');
  }
  assert.equal(F.previewMontoAnualMp_uni({iguala:'NaN',factor_monto_anual:6}).status,'iguala_invalida');
  assert.equal(F.previewMontoAnualMp_uni({iguala:10.55,factor_monto_anual:6}).status,'iguala_invalida');
  assert.equal(F.previewMontoAnualMp_uni({iguala:'9999999999999999.99',factor_monto_anual:2}).status,'fuera_rango');
  assert.equal(F.previewMontoAnualMp_uni({iguala:'1.00',factor_monto_anual:65535}).calculated,'65535.00');
});
test('MP F4: pendiente solo diagnostico, NO presupone formula Sheets ni modifica registro',()=>{
  const r={pendiente_corriente:'20.01',pendiente_vencido:'3.02',pendiente:'23.03'};
  assert.equal(F.previewPendienteMp_uni(r).status,'consistent');
  assert.equal(F.previewPendienteMp_uni({...r,pendiente:'23.02'}).component_sum,'23.03');
  assert.equal(F.previewPendienteMp_uni({...r,pendiente:'23.02'}).status,'different');
  assert.equal(F.previewPendienteMp_uni({...r,pendiente:null}).status,'incomplete');
  assert.equal(F.previewPendienteMp_uni({...r,pendiente:'not a number'}).status,'invalid');
  assert.equal(F.previewPendienteMp_uni({...r,pendiente_corriente:'9999999999999999.99',pendiente_vencido:'0.01'}).status,'out_of_range');
  assert.equal(r.pendiente,'23.03');
});
test('MP F4: preview por id_dmp unico, sin mezclar proyectos ni escribir filas',()=>{
  const rows=[{id_dmp:'9007199254740993',proyecto:'DUP',iguala:'100.00',factor_monto_anual:6,
    monto_anual:'599.99',pendiente_corriente:'20',pendiente_vencido:'10',pendiente:'25'},
    {id_dmp:'9007199254740994',proyecto:'DUP',iguala:'20',factor_monto_anual:null,monto_anual:'150.00'}];
  const before=JSON.stringify(rows),result=F.buildMpFormulaPreview_uni(rows);
  assert.equal(result.mode,'preview_only');assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].id_dmp,'9007199254740993');
  assert.equal(result.rows[0].monto_anual.calculated,'600.00');
  assert.equal(result.rows[0].warnings.includes('MP_MONTO_ANUAL_DIFERENTE'),true);
  assert.equal(result.rows[0].warnings.includes('MP_PENDIENTE_COMPONENTES_DIFERENTES'),true);
  assert.equal(result.rows[1].monto_anual.status,'sin_factor');
  assert.equal(result.summary.ready,1);assert.equal(result.summary.missing_factor,1);
  assert.equal(result.summary.amount_differences,1);assert.equal(result.summary.pending_differences,1);
  assert.equal(JSON.stringify(rows),before);assert.equal(Object.isFrozen(result),true);
  assert.throws(()=>F.buildMpFormulaPreview_uni([rows[0],rows[0]]),/duplicados/);
  assert.throws(()=>F.buildMpFormulaPreview_uni([{id_dmp:'0'}]),/no verificable/);
});
test('MP F4: GET agrega preview a registros ya filtrados, sin JOIN ni mutaciones SQL',async()=>{
  const mod=load(folder+'cobranza-uni-administracion.mp-service.js',{
    '../../config/db':{},
    '../../services/cobranza-uni-scope.service':{},
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.mp-query':Q,
    './cobranza-uni-administracion.mp-formulas':F
  });
  const calls=[];
  const preview=await mod.listMantenimientoPreventivoAdmin_uni({query:{page:1,page_size:25}}, {
    connection:{async query(sql,params){calls.push({sql,params});return calls.length===1
      ?[[{total:'2'}]]:[[{id_dmp:'41',iguala:'125.25',factor_monto_anual:6,monto_anual:'751.50'},
        {id_dmp:'42',iguala:'100.00',factor_monto_anual:null,monto_anual:'600.00'}]];}},
    scopeBuilder:(_req,alias)=>{assert.equal(alias,'mp');return 'mp.id_dmp > 0';}
  });
  assert.equal(preview.readonly,true);assert.equal(preview.rows.length,2);
  assert.equal(preview.formula_preview.rows[0].monto_anual.matches_stored,true);
  assert.equal(preview.formula_preview.rows[1].monto_anual.calculated,null);
  assert.equal(calls.length,2);
  for(const entry of calls){
    assert.match(entry.sql,/mp\.id_dmp > 0/);
    assert.doesNotMatch(entry.sql,/\bJOIN\b|detalle_mp_2026_zona_1|\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i);
  }
});
test('MP F4: input factor admite NULL, 1..65535 y expected con entero MySQL',()=>{
  assert.deepEqual(V.PHASE4_SAFE_FIELDS_MP_UNI,[...V.PHASE3_SAFE_FIELDS_MP_UNI,'factor_monto_anual']);
  assert.deepEqual(V.normalizeSingleMp_uni({changes:{factor_monto_anual:'0012'},expected:{factor_monto_anual:6}}),
    {field:'factor_monto_anual',value:'12',expected:'6'});
  assert.equal(V.normalizeSingleMp_uni({changes:{factor_monto_anual:null},expected:{factor_monto_anual:12}}).value,null);
  assert.equal(V.inputMp_uni('factor_monto_anual','65535'),'65535');
  for(const value of ['0','-1','1.5','65536','abc','']){
    assert.throws(()=>V.inputMp_uni('factor_monto_anual',value),{code:'MP_ADMIN_FACTOR_INVALIDO'});
  }
  for(const field of ['id_dmp','proyecto','id_proyecto_cobranza','iguala','monto_anual','pendiente','estatus_cartera'])
    assert.throws(()=>V.inputMp_uni(field,'1'),{code:'MP_ADMIN_CAMPO_PROTEGIDO'});
});
test('MP F4: incluso con flags true, contrato bloquea el corte GAS y no abre MySQL',async()=>{
  const s=service({MP_ADMIN_EDIT_ENABLED:'true',MP_ADMIN_GAS_CUTOVER_CONFIRMED:'true',
    MP_ADMIN_GC_VA_MP_RECONCILED:'true'});
  assert.equal(s.mpEditFeatureEnabled_uni(),false);
  const mock=mockDb({'41':{factor:null,iguala:'100.00',monto:'500.00'}});
  await assert.rejects(s.updateSingleMp_uni(REQ,'41',{
    changes:{factor_monto_anual:'6'},expected:{factor_monto_anual:null}
  },{connection:mock.db}),{code:'MP_ADMIN_ESCRITURA_DESHABILITADA'});
  assert.equal(mock.log.length,0);
});
test('MP F4: despues de gate simulado, factor actualiza monto en un UPDATE + 1 auditoria',async()=>{
  const s=service();const mock=mockDb({'41':{factor:null,iguala:'100.25',monto:'0.00'}});
  const d=deps(mock);
  const result=await s.updateSingleMp_uni(REQ,'41',{
    changes:{factor_monto_anual:'6'},expected:{factor_monto_anual:null}
  },d);
  assert.equal(result.changed,1);assert.equal(result.calculated,1);
  assert.equal(mock.state.get('41').factor,'6');assert.equal(mock.state.get('41').monto,'601.50');
  const sql=mock.log.find(item=>/^UPDATE/.test(item[0]));
  assert.match(sql[0],/mp\.`factor_monto_anual` = \?, mp\.`monto_anual` = \?/);
  assert.deepEqual(Array.from(sql[1]),['6','601.50','41']);
  assert.deepEqual(mock.stats(),{begins:1,commits:1,rollbacks:0});
  assert.equal(d.logs().length,1);assert.deepEqual(JSON.parse(JSON.stringify(d.logs()[0].derived_changes)),[
    {field:'monto_anual',before:'0.00',after:'601.50'}
  ]);
});
test('MP F4: factor NULL conserva monto; sin iguala no inventa monto',async()=>{
  const s=service();const mock=mockDb({'41':{factor:6,iguala:'100.00',monto:'600.00'},
    '42':{factor:null,iguala:null,monto:'800.00'}});
  const d=deps(mock);
  const removed=await s.updateSingleMp_uni(REQ,'41',{
    changes:{factor_monto_anual:null},expected:{factor_monto_anual:6}
  },d);
  const created=await s.updateSingleMp_uni(REQ,'42',{
    changes:{factor_monto_anual:'12'},expected:{factor_monto_anual:null}
  },d);
  assert.equal(removed.calculated,0);assert.equal(created.calculated,0);
  assert.equal(mock.state.get('41').monto,'600.00');
  assert.equal(mock.state.get('42').monto,'800.00');
  assert.equal(mock.log.filter(x=>/^UPDATE/.test(x[0])&&/mp\.`monto_anual` = \?/.test(x[0])).length,0);
});
test('MP F4: formula fuera de rango cancela cambio y audita cero registros',async()=>{
  const s=service();const mock=mockDb({'41':{factor:null,iguala:'9999999999999999.99',monto:'20.00'}});
  const d=deps(mock);
  await assert.rejects(s.updateSingleMp_uni(REQ,'41',{
    changes:{factor_monto_anual:'2'},expected:{factor_monto_anual:null}
  },d),{code:'MP_ADMIN_FACTOR_CALCULO_INVALIDO',statusCode:422});
  assert.equal(mock.state.get('41').factor,null);assert.equal(mock.state.get('41').monto,'20.00');
  assert.equal(mock.stats().rollbacks,1);assert.equal(d.logs().length,0);
});
test('MP F4: error de auditoria revierte factor y monto simultaneamente',async()=>{
  const s=service();const mock=mockDb({'41':{factor:null,iguala:'100.00',monto:'500.00'}});
  await assert.rejects(s.updateSingleMp_uni(REQ,'41',{
    changes:{factor_monto_anual:'6'},expected:{factor_monto_anual:null}
  },deps(mock,{failAudit:true})),/Auditoria simulada rechazada/);
  assert.equal(mock.state.get('41').factor,null);assert.equal(mock.state.get('41').monto,'500.00');
  assert.equal(mock.stats().rollbacks,1);assert.equal(mock.stats().commits,0);
});
test('MP F4: lote con factor y error de concurrencia en segunda fila revierte todo',async()=>{
  const s=service();const mock=mockDb({'41':{factor:null,iguala:'100.00',monto:'500.00'},
    '42':{factor:6,iguala:'20.00',monto:'120.00'}});
  await assert.rejects(s.updateMultiMp_uni(REQ,{
    ids:['42','41'],changes:{factor_monto_anual:'12'},
    expected:{'41':{factor_monto_anual:null},'42':{factor_monto_anual:5}}
  },deps(mock)),{code:'MP_ADMIN_CONFLICTO_CONCURRENCIA'});
  assert.equal(mock.state.get('41').factor,null);assert.equal(mock.state.get('41').monto,'500.00');
  assert.equal(mock.state.get('42').factor,6);assert.equal(mock.state.get('42').monto,'120.00');
  assert.equal(mock.stats().commits,0);assert.equal(mock.stats().rollbacks,1);
});
test('MP F4: auditoria oficial conserva detalle de derivados en la misma transaccion',async()=>{
  const calls=[];
  const audit=load(folder+'cobranza-uni-administracion.mp-edit-audit.js',{
    '../../services/interactions/interactions.service':{async recordFromRequest_gnral(req,event,options){
      calls.push({req,event,options});return {id_interaccion:'123'};
    }},
    './cobranza-uni-administracion.mp-edit-validation':V
  },{Buffer});
  const db={query(){}};
  const result=await audit.auditMpCell_uni(REQ,{id:'41',field:'factor_monto_anual',before:null,after:'6',
    operation:'single',actor:5,derived_changes:[{field:'monto_anual',before:'0.00',after:'601.50'}]},db);
  assert.equal(result,'123');assert.equal(calls.length,1);
  assert.equal(calls[0].options.executor,db);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].event.detalle_json.derived_changes)),[
    {field:'monto_anual',before:'0.00',after:'601.50'}
  ]);
});
test('MP F4: interfaz muestra valor persistido y calculo separados, sin inventar escritura',async()=>{
  const client=read('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js');
  const css=read('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css');
  const routes=read(folder+'cobranza-uni-administracion.routes.js');
  assert.match(routes,/PHASE4_SAFE_FIELDS_MP_UNI/);
  assert.match(css,/\.cua-mp-formula-tag/);
  assert.doesNotMatch(client,/method\s*:\s*['"](?:PUT|DELETE)['"]/);
  let calls=0;const handlers={},nodes=new Map();
  const element=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{},value:'',
      hidden:true,disabled:false,checked:false,setAttribute(){},focus(){},reset(){}});
    return nodes.get(selector);
  };
  const container={innerHTML:'',querySelector:element,querySelectorAll(){return [];},
    addEventListener(k,h){handlers[k]=h;},replaceChildren(){this.innerHTML='';}};
  const rows=[{id_dmp:'41',proyecto:'<img src=x onerror=1>',cliente:'XYZ',
    iguala:'100.25',factor_monto_anual:6,monto_anual:'800.00',pendiente_corriente:'20',
    pendiente_vencido:'10',pendiente:'50'}];
  const win={ManttoAuth:{apiGet:async()=>{calls++;return {
    ok:true,table:'detalle_mp_2026',readonly:true,columns:C.MP_COLUMNS_UNI,
    rows,total:1,pages:1,formula_preview:F.buildMpFormulaPreview_uni(rows)
  };}}};
  vm.runInNewContext(client,{window:win,document:{},URLSearchParams});
  const editor=win.ManttoCobranzaAdministracionMP_uni.mount(container,{isCurrent:()=>true});
  await new Promise(resolve=>setImmediate(resolve));
  const html=element('[data-mp-body]').innerHTML;
  assert.equal(calls,1);assert.match(html,/800\.00/);assert.match(html,/Previsto: 601\.50/);
  assert.match(html,/no guardado/);assert.match(html,/&lt;img/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.equal(element('[data-mp-formula-summary]').textContent.includes('1 cálculos disponibles'),true);
  assert.doesNotMatch(container.innerHTML,/data-mp-bulk-form/);
  editor.destroy();
});
