'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_2_V001]
// Pruebas offline: SELECT/COUNT, permisos, scope, interfaz. No usa Aiven.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');
const rel='backend/src/modules/cobranza-uni-administracion/';
const MP=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-contract');
const C=Object.freeze({
  MP_COLUMNS_UNI:MP.MP_COLUMNS_UNI,MP_RULES_UNI:MP.MP_RULES_UNI,
  TABLES_UNI:Object.freeze({
    gestion_credito:{label:'Gestión de Crédito',primaryKey:'id_gc',schemaReady:true},
    pc:{label:'Venta Adicional',primaryKey:'id_pc',schemaReady:true},
    detalle_mp_2026:{label:'Mantenimiento Preventivo',primaryKey:'id_dmp',schemaReady:true}
  })
});
const PERM={
  MAIN_VISUAL:'COBRANZA_UNI_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  TABLE_PERMISSIONS:{
    gestion_credito:{view:'GC.VER',edit:'GC.EDITAR'},
    pc:{view:'PC.VER',edit:'PC.EDITAR'},
    detalle_mp_2026:{view:MP.MP_RULES_UNI.independentPermissionView,edit:MP.MP_RULES_UNI.independentPermissionEdit}
  },
  ALL_TABLE_PERMISSIONS:['GC.VER','GC.EDITAR','PC.VER','PC.EDITAR',MP.MP_RULES_UNI.independentPermissionView,MP.MP_RULES_UNI.independentPermissionEdit]
};
function loadMod(file,dependencies){
  const mod={exports:{}};
  vm.runInNewContext(read(file),{module:mod,exports:mod.exports,require:name=>{
    if(Object.hasOwn(dependencies,name))return dependencies[name];
    throw Error('Dependencia no prevista: '+name);
  }});
  return mod.exports;
}
const F=require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-formulas');
const Q=loadMod(rel+'cobranza-uni-administracion.mp-query.js',{
  './cobranza-uni-administracion.constants':C
});
const build=(opts={},scope='mp.id_dmp > 0')=>Q.buildMpListQuery_uni(Q.parseListMpQuery_uni(opts),scope);

test('MP F2: contrato F1 se mantiene con 20 columnas e identidad protegida',()=>{
  assert.equal(MP.MP_COLUMNS_UNI.length,20);
  assert.equal(MP.MP_COLUMNS_UNI.filter(c=>c.kind==='protected').length,2);
  assert.equal(MP.MP_RULES_UNI.writesEnabled,false);
  assert.equal(MP.MP_ZONE1_COLUMNS_UNI.length,128);
});

test('MP F2: SELECT/COUNT contemplan solo MP principal y scope oficial',()=>{
  const sql=build({page:'2',page_size:'25',sort:'proyecto',order:'desc'},'mp.id_dmp > 100');
  assert.match(sql.countSql,/^SELECT COUNT\(\*\) AS total FROM `detalle_mp_2026` mp WHERE \(mp.id_dmp > 100\)/);
  assert.match(sql.selectSql,/ORDER BY mp\.`proyecto` DESC, mp\.`id_dmp` ASC LIMIT \? OFFSET \?/);
  assert.deepEqual(Array.from(sql.selectParams),[25,25]);
  assert.match(sql.selectSql,/CAST\(mp\.`id_dmp` AS CHAR\) AS `id_dmp`/);
  assert.match(sql.selectSql,/CAST\(mp\.`id_proyecto_cobranza` AS CHAR\) AS `id_proyecto_cobranza`/);
  for(const col of MP.MP_COLUMNS_UNI)assert.ok(sql.selectSql.includes('`'+col.name+'`'),col.name);
  assert.doesNotMatch(sql.selectSql,/JOIN|detalle_mp_2026_zona_1|BUSCARV/i);
  assert.doesNotMatch(sql.selectSql,/\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|CREATE)\b/i);
});

test('MP F2: búsqueda parametrizada, LIKE literal y filtros de estatus y pendientes',()=>{
  const sql=build({search:'x_!%',filter_column:'cliente',filter_value:'ABC_%',
    estatus:'Activo',pendientes:'ambos'});
  assert.equal(sql.countParams.length,Q.GLOBAL_SEARCH_FIELDS_UNI.length+2);
  assert.equal(sql.countParams[0],'%x!_!!!%%');
  assert.equal(sql.countParams.at(-2),'%ABC!_!%%');
  assert.equal(sql.countParams.at(-1),'Activo');
  assert.match(sql.selectSql,/mp\.`estatus_cartera` = \?/);
  assert.match(sql.selectSql,/COALESCE\(mp\.`pendiente`, 0\) > 0/);
  assert.match(sql.selectSql,/COALESCE\(mp\.`facturas_pendientes`, 0\) > 0/);
  assert.deepEqual(Array.from(sql.selectParams.slice(0,-2)),Array.from(sql.countParams));
  assert.match(build({estatus:'Sin estado'}).selectSql,/IS NULL OR TRIM/);
});

test('MP F2: rechaza inyección, parámetros malformados y scope ausente',()=>{
  for(const opts of [
    {sort:'id_dmp;DROP TABLE x'},{filter_column:'1=1',filter_value:'x'},
    {filter_value:'x'},{order:'desc;DELETE'},{page:0},{page:'1 OR 1=1'},
    {page:100001},{page_size:101},{page_size:0},{search:'a\n'},
    {search:'x'.repeat(121)},{search:['x']},{estatus:'Suspendido'},
    {pendientes:'todo OR 1=1'},{filter_column:{sql:'proyecto'}}
  ])assert.throws(()=>Q.parseListMpQuery_uni(opts),{code:'COBRANZA_UNI_MP_ADMIN_CONSULTA_INVALIDA'});
  assert.throws(()=>build({},''),/Alcance UNITED no disponible/);
  assert.deepEqual(JSON.parse(JSON.stringify(Q.parseListMpQuery_uni({}))),{
    page:1,pageSize:50,search:'',filterColumn:'',filterValue:'',
    sort:'id_dmp',order:'asc',status:'',pending:'todos'
  });
});

test('MP F2: servicio usa scope oficial alias mp, paginación y sin acceso al origen Zone1',async()=>{
  const calls=[],aliases=[];
  let released=false;
  const service=loadMod(rel+'cobranza-uni-administracion.mp-service.js',{
    '../../config/db':{getConnection(){throw Error('NO AIVEN');}},
    '../../services/cobranza-uni-scope.service':{},
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.mp-query':Q,
    './cobranza-uni-administracion.mp-formulas':F
  });
  const response=await service.listMantenimientoPreventivoAdmin_uni({query:{page:'2',page_size:'25'}},{
    connection:{async query(sql,params){calls.push({sql,params});return calls.length===1
      ?[[{total:'48'}]]:[[{id_dmp:'9007199254740993',proyecto:'MP SEGURO',factor_monto_anual:null}]];},
      release(){released=true;}},
    scopeBuilder:(req,alias)=>{aliases.push(alias);return '(mp.id_dmp > 0)';}
  });
  assert.deepEqual(aliases,['mp']);assert.equal(response.total,48);
  assert.equal(response.pages,2);assert.equal(response.readonly,true);
  assert.equal(response.rows[0].id_dmp,'9007199254740993');
  assert.equal(response.columns.length,20);assert.equal(calls.length,2);
  assert.match(calls[0].sql,/mp.id_dmp > 0/);
  assert.match(calls[1].sql,/mp.id_dmp > 0/);
  assert.equal(calls[1].params.at(-1),25);
  assert.equal(released,false,'conexion prestada no se libera en el servicio');
});

test('MP F2: página vacía evita SELECT, cuenta siempre con scope',async()=>{
  const calls=[];
  const service=loadMod(rel+'cobranza-uni-administracion.mp-service.js',{
    '../../config/db':{},'../../services/cobranza-uni-scope.service':{},
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.mp-query':Q,
    './cobranza-uni-administracion.mp-formulas':F
  });
  const response=await service.listMantenimientoPreventivoAdmin_uni({query:{page:999}},{
    connection:{async query(sql){calls.push(sql);return [[{total:'3'}]];}},scopeBuilder:()=>'(1 = 0)'
  });
  assert.equal(calls.length,1);
  assert.match(calls[0],/\(1 = 0\)/);
  assert.equal(response.rows.length,0);
});

test('MP F2: la ruta exige MAIN+VER propio, EDITAR nunca concede lectura',async()=>{
  const registered=[];
  const guard=()=>{};
  let rights=new Map(),reads=0;
  const router={get(route,...handlers){registered.push({route,handlers});},patch(){},post(){}};
  const fakeRoutes=loadMod(rel+'cobranza-uni-administracion.routes.js',{
    'express':{Router:()=>router},
    '../../middleware/information-access-gnral.middleware':{
      humanInformationGuard_gnral:config=>{
        assert.equal(config.domain,'UNITED');assert.equal(config.groupingCode,'COBRANZA_UNI');
        assert.equal(config.permissionCode,PERM.MAIN_VISUAL);return [guard];
      }
    },
    '../../services/permissions/effective-permission.service':{
      listEffectivePermissions:async()=>rights
    },
    './cobranza-uni-administracion.constants':C,
    './cobranza-uni-administracion.permissions':PERM,
    './cobranza-uni-administracion.gc-service':{listGestionCredito_uni(){}},
    './cobranza-uni-administracion.pc-service':{listVentaAdicionalAdmin_uni(){}},
    './cobranza-uni-administracion.mp-service':{
      listMantenimientoPreventivoAdmin_uni:async()=>{
        reads++;return {ok:true,table:'detalle_mp_2026',readonly:true};
      }
    },
    './cobranza-uni-administracion.pc-edit-validation':{PHASE3_SAFE_FIELDS_UNI:[]},
    './cobranza-uni-administracion.pc-edit-service':{
      pcEditFeatureEnabled_uni:()=>false,updateSinglePc_uni(){},updateMultiPc_uni(){}
    },
    './cobranza-uni-administracion.pc-create-service':{
      createGateEnabled_uni:()=>false,preflightCreatePc_uni(){},createPc_uni(){}
    },
    './cobranza-uni-administracion.gc-edit-service':{updateSingleGc_uni(){},updateMultiGc_uni(){}},
    './cobranza-uni-administracion.mp-edit-validation':{PHASE3_SAFE_FIELDS_MP_UNI:[]},
    './cobranza-uni-administracion.mp-zona1-write-service':{zone1WriteEnabled_uni:()=>false},
    './cobranza-uni-administracion.mp-edit-service':{
      mpEditFeatureEnabled_uni:()=>false,updateSingleMp_uni(){},updateMultiMp_uni(){}
    }
  });
  assert.equal(fakeRoutes,router);
  const route=registered.find(item=>item.route==='/tablas/detalle_mp_2026/registros');
  assert.ok(route);assert.ok(route.handlers.includes(guard));
  function response(){let code=200;return {status(n){code=n;return this;},json(payload){return {code,payload};}};}
  const handler=route.handlers.at(-1);
  const req={contextUser:{id_SB:88},viewerContext:{active:false},query:{}};
  rights=new Map([[PERM.TABLE_PERMISSIONS.detalle_mp_2026.edit,true]]);
  let result=await handler(req,response(),e=>{throw e;});
  assert.equal(result.code,403);assert.equal(reads,0);
  rights=new Map([[PERM.TABLE_PERMISSIONS.detalle_mp_2026.view,true]]);
  result=await handler(req,response(),e=>{throw e;});
  assert.equal(result.code,200);assert.equal(reads,1);
  result=await handler({query:{}},response(),e=>{throw e;});
  assert.equal(result.code,401);
  const access=registered.find(item=>item.route==='/tablas/:tabla/acceso').handlers.at(-1);
  rights=new Map([[PERM.TABLE_PERMISSIONS.detalle_mp_2026.view,true],[PERM.TABLE_PERMISSIONS.detalle_mp_2026.edit,true]]);
  result=await access({...req,params:{tabla:'detalle_mp_2026'}},response(),e=>{throw e;});
  assert.equal(result.code,200);assert.equal(result.payload.can_edit,false);
  const contract=registered.find(item=>item.route==='/contrato').handlers.at(-1);
  result=await contract(req,response(),e=>{throw e;});
  assert.equal(result.payload.tables.find(x=>x.table==='detalle_mp_2026').can_edit,false);
});

test('MP F2/F3: consulta no permite PATCH sin autorizacion; conserva filtros, scroll y cancelacion',async()=>{
  const main=read('modules/cobranza-uni/administracion/main/main.js');
  const client=read('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js');
  const css=read('modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css');
  assert.match(main,/if\(table==='detalle_mp_2026'\)/);
  assert.match(main,/ManttoCobranzaAdministracionMP_uni\?\.mount/);
  assert.match(main,/mantenimiento-preventivo\/mantenimiento-preventivo\.js/);
  assert.match(main,/mantenimiento-preventivo\/mantenimiento-preventivo\.css/);
  assert.match(main,/if\(table==='pc'\)/);
  assert.match(main,/if\(table==='gestion_credito'\)/);
  for(const word of ['data-mp-search','data-mp-filter-column','data-mp-filter-value',
    'data-mp-estatus','data-mp-pendientes','data-mp-sort','data-mp-prev','data-mp-next',
    'data-mp-page-size','data-mp-group','URLSearchParams','ManttoAuth.apiGet'])
    assert.ok(client.includes(word),word);
  assert.match(client,/options\.canEdit===true/);
  assert.match(client,/method:'PATCH'/);
  assert.doesNotMatch(client,/method\s*:\s*['"](?:PUT|DELETE)['"]/);
  assert.match(css,/overflow:auto/);assert.match(css,/position:sticky/);
  assert.match(css,/@media\(max-width:540px\)/);
  const apiCalls=[];
  const nodes=new Map();
  function node(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',dataset:{},disabled:false});return nodes.get(key);}
  const root={innerHTML:'',addEventListener(){},querySelector:node,querySelectorAll(){return [];},replaceChildren(){this.innerHTML='';}};
  const win={ManttoAuth:{apiGet:async(url)=>{
    apiCalls.push(url);
    const rows=[{id_dmp:'1',proyecto:'<img src=x onerror=1>',estatus_cartera:'Activo'}];
    return {ok:true,table:'detalle_mp_2026',readonly:true,columns:MP.MP_COLUMNS_UNI,
      rows,formula_preview:F.buildMpFormulaPreview_uni(rows),total:1,pages:1};
  }}};
  const mod={window:win,document:{}};
  vm.runInNewContext(client,{...mod,URLSearchParams});
  const editor=win.ManttoCobranzaAdministracionMP_uni.mount(root,{isCurrent:()=>true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(editor&&typeof editor.destroy==='function');
  assert.equal(apiCalls.length,1);
  assert.match(apiCalls[0],/detalle_mp_2026\/registros/);
  assert.doesNotMatch(root.innerHTML,/data-mp-bulk-form|data-mp-dialog/,
    'sin can_edit del backend no hay controles de escritura');
  assert.doesNotMatch(node('[data-mp-body]').innerHTML,/<img src=x onerror=1>/);
  assert.match(node('[data-mp-body]').innerHTML,/&lt;img/);
  editor.destroy();
  assert.equal(root.innerHTML,'');
});
