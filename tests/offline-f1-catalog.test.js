'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const catalog = require('../backend/src/modules/offline-pilot/offline-pilot.catalog');
const pilot = require('../backend/src/modules/offline-pilot/offline-pilot.service');

function row({code,groupId,domain,permission,groupCode}) {
  return {
    id_modulo: ({OPERACION_RESUMEN_DEL_DIA:5, CORELLIAN_PROYECTOS:6, VENTAS_CLIENTES:7, OPERACION_SIN_ZONAS:8, GENERAL_MODO_OFFLINE:9})[code],
    modulo_codigo:code, modulo_nombre:code, ruta_frontend:'demo',modulo_orden:1,
    id_agrupacion:groupId,agrupacion_codigo:groupCode||`G-${groupId}`,
    agrupacion_nombre:groupCode||`Grupo ${groupId}`,
    agrupacion_empresa:domain,agrupacion_orden:1,agrupacion_activa:1,
    codigo_permiso:permission
  };
}

function makeDeps(rows,{permissions=[],doors={},scopes={}}={}) {
  const calls=[];
  return {
    calls,
    injected:{
      connection:{ async query(sql){assert.match(sql,/INNER JOIN perm_agrupaciones/);return [rows];}},
      permissions:{ async hasEffectivePermission(userId,code){calls.push(`p:${userId}:${code}`);return permissions.includes(code);}},
      resolver:{
        normalizeGroupingCompany_gnral(value){
          return value==='Corellian SA de CV'?'CORELLIAN':value;
        },
        async resolveInformationDoor_gnral(_c,req,group){
          assert.equal(req.contextUser.id_SB,31);
          calls.push(`d:${group.id_agrupacion}`);
          return {allowed:doors[group.id_agrupacion]===true};
        },
        async resolveAlcanceByGrouping_gnral(_c,_req,group){
          calls.push(`s:${group.id_agrupacion}`);
          return scopes[group.id_agrupacion];
        }
      }
    }
  };
}
const request={contextUser:{id_SB:31}, informationAccess:{acceso_puerta:true,dominio:'GENERAL'}};

test('alcance por empresa y cuatro zonas, denegacion de puertas y permisos',async()=>{
  const rows=[
    row({code:'OPERACION_RESUMEN_DEL_DIA',groupId:4,domain:'UNITED',permission:'RD.VER'}),
    row({code:'CORELLIAN_PROYECTOS',groupId:8,domain:'Corellian SA de CV',permission:'COR.VER'}),
    row({code:'VENTAS_CLIENTES',groupId:9,domain:'GENERAL',permission:'VEN.VER'}),
    row({code:'OPERACION_SIN_ZONAS',groupId:10,domain:'UNITED',permission:'OTRA.VER'}),
    row({code:'GENERAL_MODO_OFFLINE',groupId:11,domain:'GENERAL',permission:'OFF.VER'})
  ];
  const {injected,calls}=makeDeps(rows,{
    permissions:['RD.VER','COR.VER','VEN.VER','OTRA.VER','OFF.VER'],
    doors:{4:true,8:true,9:false,10:true,11:true},
    scopes:{
      4:{motor:'alcance_uni',empresa:'UNITED',llave_maestra:false,requiere_filtro_zona:true,zona_ids:[2,4,6,8],zona_codigos:['N','S','E','O']},
      8:{motor:'alcance_cor',empresa:'CORELLIAN',llave_maestra:false,requiere_filtro_usuario:true,usuarios_visibles:[31,47]},
      10:{motor:'alcance_uni',empresa:'UNITED',llave_maestra:false,requiere_filtro_zona:true,zona_ids:[],zona_codigos:[]}
    }
  });
  const modules=await catalog.listAuthorizedModules(request,injected);
  assert.deepEqual(modules.map(m=>m.code),['OPERACION_RESUMEN_DEL_DIA','CORELLIAN_PROYECTOS']);
  assert.deepEqual(modules[0].scope.zone_ids,[2,4,6,8]);
  assert.deepEqual(modules[0].datasets,['operacion-resumen-dia']);
  assert.equal(modules[1].domain,'CORELLIAN');
  assert.equal(modules[1].scope.visible_user_count,2);
  assert.ok(!calls.some(call=>call.includes('OFF.VER')));
  const caps=pilot.buildCapabilities(request,modules);
  assert.equal(caps.catalog_version,1);
  assert.equal(caps.phase,2); // contrato historico del piloto
  assert.equal(caps.implementation_phase,5); // Fase 5 sobre catálogo F1
  assert.equal(caps.datasets.length,1);
  assert.equal(caps.datasets[0].key,'operacion-resumen-dia');
});

test('llave maestra UNITED entrega dominio completo, pero no otros dominios',async()=>{
  const rows=[row({code:'OPERACION_RESUMEN_DEL_DIA',groupId:4,domain:'UNITED',permission:'RD.VER'})];
  const {injected}=makeDeps(rows,{permissions:['RD.VER'],doors:{4:true},scopes:{4:{motor:'alcance_uni',empresa:'UNITED',llave_maestra:true,requiere_filtro_zona:false}}});
  const modules=await catalog.listAuthorizedModules(request,injected);
  assert.equal(modules[0].scope.mode,'DOMINIO_COMPLETO');
  assert.equal(modules[0].scope.master_key,true);
  assert.equal(modules[0].scope.zone_ids,null);
});

test('sin permiso o puerta GENERAL se falla cerrado',async()=>{
  const rows=[row({code:'OPERACION_RESUMEN_DEL_DIA',groupId:4,domain:'UNITED',permission:'RD.VER'})];
  const {injected}=makeDeps(rows,{permissions:[],doors:{4:true}});
  assert.deepEqual(await catalog.listAuthorizedModules(request,injected),[]);
  const cap=pilot.buildCapabilities(request,[]);
  assert.deepEqual(cap.datasets,[]);
  assert.equal(cap.operational_data_enabled,false);
  await assert.rejects(catalog.listAuthorizedModules({contextUser:{id_SB:31},informationAccess:{acceso_puerta:false,dominio:'GENERAL'}},injected),{status:403});
});

test('Visor se identifica por usuario efectivo, y el catalogo no exporta datos de Aiven',async()=>{
  const rows=[row({code:'OPERACION_RESUMEN_DEL_DIA',groupId:4,domain:'UNITED',permission:'RD.VER'})];
  const {injected}=makeDeps(rows,{permissions:['RD.VER'],doors:{4:true},scopes:{4:{motor:'alcance_uni',empresa:'UNITED',llave_maestra:false,requiere_filtro_zona:true,zona_ids:[3],zona_codigos:['N']}}});
  const modules=await catalog.listAuthorizedModules({...request,user:{id_SB:99},viewerContext:{active:true}},injected);
  const caps=pilot.buildCapabilities({...request,user:{id_SB:99},viewerContext:{active:true}},modules);
  assert.equal(caps.effective_user_id,31);
  assert.equal(caps.viewer_read_only,true);
  assert.ok(modules.every(m=>!Object.prototype.hasOwnProperty.call(m,'records')));
});

test('frontend selecciona por identidad y solo muestra copias existentes',()=>{
  const source=fs.readFileSync(path.join(root,'modules/offline-pilot/offline-pilot.js'),'utf8');
  assert.match(source,/actorUserId.*currentUserId/);
  assert.match(source,/excluded_codes/);
  assert.match(source,/listSnapshots/);
  assert.match(source,/listSnapshots/);
  assert.match(source,/scopeMatchesSnapshot/);
  assert.match(source,/viewer/);
  assert.doesNotMatch(source,/\.apiPost\(|\.apiPut\(/);
});

test('render frontend: todos los modulos autorizados aparecen marcados por defecto y el usuario puede desmarcarlos',async()=>{
  const memory=new Map();
  const nodes=new Map();
  const createNode=(tag='div')=>({
    tag,children:[],style:{},hidden:false,checked:false,disabled:false,
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=[...items];},
    setAttribute(key,value){this[key]=value;},
    addEventListener(type,handler){this[`on${type}`]=handler;},
    textContent:''
  });
  const view=createNode('section');
  Object.defineProperty(view,'innerHTML',{
    get(){return this._html||'';},
    set(value){this._html=value;for(const match of value.matchAll(/id="([^"]+)"/g))nodes.set(match[1],createNode());}
  });
  const permission='GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const capabilities={
    permission_code:permission,effective_user_id:31,viewer_read_only:false,
    datasets:[{key:'operacion-resumen-dia',domain:'UNITED',endpoint:'/api/operacion/resumen-dia/inicial'}],
    catalog_modules:[
      {code:'OPERACION_RESUMEN_DEL_DIA',name:'Resumen del Día',domain:'UNITED',
        grouping_name:'Operación',scope:{mode:'ZONAS',zone_ids:[2,4,6,8],zones:['N','S','E','O'],scope_signature:'a'.repeat(64)},
        datasets:['operacion-resumen-dia'],backup_status:'EXPORTADOR_EXISTENTE'},
      {code:'CORELLIAN_PROYECTOS',name:'Proyectos CORELLIAN',domain:'CORELLIAN',
        grouping_name:'Instalaciones',scope:{mode:'USUARIOS',visible_user_count:2},datasets:[],backup_status:'PENDIENTE_EXPORTACION'}
    ]
  };
  const state={snapshots:[
    {actor_user_id:31,effective_user_id:31,domain:'UNITED',dataset:'OPERACION-RESUMEN-DIA',
      downloaded_at:'2026-10-20T12:00:00Z',record_count:13,byte_size:2048,
      schema_version:2,read_only:true,scope_signature:'a'.repeat(64),run_id:'run-1',kind_counts:{tickets:12,portafolio:1},
      payload:{alcance:{zona_ids:[2,4,6,8]},data:{tickets:[],portafolio:[]}}},
    {actor_user_id:31,effective_user_id:31,domain:'UNITED',dataset:'OPERACION-RESUMEN-DIA',
      downloaded_at:'2026-10-20T12:01:00Z',record_count:999,byte_size:9999,
      schema_version:2,read_only:true,scope_signature:'b'.repeat(64),run_id:'run-2',kind_counts:{tickets:998,portafolio:1},
      payload:{alcance:{zona_ids:[2,5]},data:{tickets:[],portafolio:[]}}}
  ]};
  const sandbox={
    window:{
      ManttoPermissions:{state:()=>({exists:true,efectivo:true})},
      ManttoAuth:{getActorUser:()=>({id_SB:31}),getUser:()=>({id_SB:31}),apiGet:async()=>({data:capabilities})},
      ManttoOfflineStorage:{
        listSnapshots:async()=>state.snapshots,
        getSnapshot:async()=>null,
        verifiedSnapshot:async(ctx,signature)=>{
          const valid=state.snapshots.find(row=>row.run_id==='run-1');
          if(signature!==valid.scope_signature)throw new Error('Firma no autorizada');
          return { ...valid, payload:undefined };
        },
        outboxStatus:async()=>({enabled:false,count:0})
      },
      ManttoOfflineScheduler:{evaluate:()=>({due:false})},
      isViewingAs:()=>false
    },
    document:{getElementById:id=>id==='view-offline-configuracion'?view:nodes.get(id)||null,
      createElement:createNode},
    navigator:{onLine:true,storage:{estimate:async()=>({usage:100,quota:100000}),persisted:async()=>true}},
    localStorage:{
      getItem:k=>memory.get(k)||null,
      setItem:(k,v)=>memory.set(k,String(v)),
      removeItem:k=>memory.delete(k)
    },
    console,Date,Intl
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'modules/offline-pilot/offline-pilot.js'),'utf8'),sandbox);
  assert.equal(await sandbox.window.ManttoOfflinePilot.init(),true);
  const collect=(node,out=[])=>{out.push(node);for(const item of node?.children||[])collect(item,out);return out;};
  const boxes=collect(nodes.get('off-catalog-modules')).filter(n=>n.tag==='input'&&n.type==='checkbox');
  assert.equal(boxes.length,2);
  assert.ok(boxes.every(b=>b.checked===true));
  assert.match(nodes.get('off-catalog-count').textContent,/2 de 2/);
  assert.equal(nodes.get('off-existing-download').hidden,false);
  await new Promise(resolve=>setImmediate(resolve));
  const localItems=nodes.get('off-local-results').children;
  assert.equal(localItems.length,1,'solo la copia con cuatro zonas autorizadas debe mostrarse');
  assert.ok(collect(localItems[0]).some(n=>n.textContent?.includes('13 registros')));
  assert.ok(!collect(localItems[0]).some(n=>n.textContent?.includes('999 registros')));
  boxes[0].checked=false;
  boxes[0].onchange();
  assert.match(memory.get('mantto:offline-selection:f1:31:31'),/OPERACION_RESUMEN_DEL_DIA/);
  assert.equal(nodes.get('off-existing-download').hidden,true);
  assert.match(nodes.get('off-catalog-count').textContent,/1 de 2/);
});

test('la selección F1 y la lectura F3 no habilitan escrituras ni eliminan control por zonas',()=>{
  const js=fs.readFileSync(path.join(root,'modules/offline-pilot/offline-pilot.js'),'utf8');
  const backend=fs.readFileSync(path.join(root,'backend/src/modules/offline-pilot/offline-pilot.catalog.js'),'utf8');
  assert.match(js,/verifiedSnapshot/);
  assert.match(js,/scopeMatchesSnapshot/);
  assert.match(js,/excluded_codes/);
  assert.match(backend,/resolveInformationDoor_gnral/);
  assert.match(backend,/resolveAlcanceByGrouping_gnral/);
  assert.doesNotMatch(js,/ManttoAuth\.apiPost\(|ManttoAuth\.apiPut\(/);
});
