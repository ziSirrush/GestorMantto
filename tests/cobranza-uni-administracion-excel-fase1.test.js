'use strict';
// BLT NOW | 2026-10-23 | Excel Fantasma Fase 1
// Pruebas locales de contrato y selector. Sin HTTP, Aiven, Azure ni GAS.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.resolve(__dirname,'..');
const MAIN='modules/cobranza-uni/administracion/main/main.js';
const CONTRACT='docs/BLTNOW_COBRANZA_UNI_EXCEL_CONTRATO_V001.json';
const DOC='docs/BLTNOW_COBRANZA_UNI_EXCEL_FASE1_V001.md';
const file=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const contract=JSON.parse(file(CONTRACT));
function repoSource(t,name){
  const full=path.join(ROOT,name);
  if(!fs.existsSync(full)){
    t.skip('No existe en el subconjunto local; se valida al ejecutar dentro del repositorio completo: '+name);
    return null;
  }
  return fs.readFileSync(full,'utf8');
}
function makeFake(rights={}){
  const status={styles:[],scripts:[],opens:[],requests:[]};
  const root={innerHTML:'',classList:{add(){}},replaceChildren(){this.innerHTML='';},
    addEventListener(){}};
  const doc={getElementById:()=>root,addEventListener(){}};
  const perms={
    gestion_credito:{can_view:true,can_edit:true},
    pc:{can_view:true,can_edit:true},
    detalle_mp_2026:{can_view:true,can_edit:true},
    ...rights
  };
  const tableMeta=Object.entries(perms).map(([table,access])=>({table,...access}));
  const auth={getToken:()=> 'local_only',getActorUser:()=>({id_SB:31}),
    getUser:()=>({id_SB:31}),getViewUser:()=>({id_SB:31}),
    apiGet:async endpoint=>{
      status.requests.push(endpoint);
      if(endpoint==='/api/cobranza-uni/administracion/contrato')return {ok:true,tables:tableMeta};
      const matched=/\/tablas\/([^/]+)\/acceso$/.exec(endpoint);
      if(!matched)throw new Error('Peticion inesperada '+endpoint);
      const table=matched[1];
      return {ok:true,table,...perms[table],editable_fields:['ov','zona_adm'],
        can_prepare_create:true,can_create:false,can_prepare_zone1:true,can_write_zone1:false};
    }
  };
  const loader={loadStyle:async src=>status.styles.push(src),
    loadScript:async src=>status.scripts.push(src)};
  const makeMount=name=>({mount:(rootEl,options)=>{
    status.opens.push({name,options,rootEl});
    return {destroy(){}};
  }});
  const win={ManttoAuth:auth,ManttoModuleLoader:loader,
    ManttoRouter:{getCurrent:()=>({route:'cobranza-uni-administracion'})},
    ManttoCobranzaAdministracionGC_uni:makeMount('gc'),
    ManttoCobranzaAdministracionPC_uni:makeMount('va'),
    ManttoCobranzaAdministracionMP_uni:makeMount('mp')};
  vm.runInNewContext(file(MAIN),{window:win,document:doc});
  return {app:win.ManttoCobranzaAdministracion_uni,root,status};
}

test('F1 contrato: referencia unica GC y cuatro tablas fisicas, dos pestanas solo MP',()=>{
  assert.equal(contract.id,'BLTNOW_COBRANZA_UNI_ADMIN_EXCEL_V001');
  assert.equal(contract.modelo_referencia,'gestion_credito');
  assert.equal(contract.fase,1);assert.equal(contract.total_fases,6);
  assert.deepEqual(Object.keys(contract.tablas),[
    'gestion_credito','pc','detalle_mp_2026','detalle_mp_2026_zona_1']);
  assert.equal(contract.tablas.gestion_credito.columnas,29);
  assert.equal(contract.tablas.pc.columnas,31);
  assert.equal(contract.tablas.detalle_mp_2026.columnas,20);
  assert.equal(contract.tablas.detalle_mp_2026_zona_1.columnas,128);
  assert.equal(contract.tablas.detalle_mp_2026_zona_1.bloques_facturacion,12);
  assert.equal(contract.tablas.detalle_mp_2026_zona_1.campos_por_bloque,9);
  assert.equal(contract.contrato_visual.pantallas.GC,'tabla_unica_sin_pestanas');
  assert.equal(contract.contrato_visual.pantallas.VA,'tabla_unica_sin_grupos_ni_pestanas');
  assert.equal(contract.contrato_visual.pantallas.MP,'exactamente_dos_pestanas_MP_y_Zona_1');
});

test('F1 contrato: teclado, modal prohibido en edicion y confirmacion backend',()=>{
  const ui=contract.contrato_visual;
  assert.deepEqual(ui.abrir_celda,['doble_clic','enter_en_celda_con_foco']);
  assert.deepEqual(ui.guardar_celda,['enter','salir_del_campo']);
  assert.equal(ui.cancelar_celda,'escape');
  assert.equal(ui.formato,'editar_dentro_de_la_celda_sin_modal');
  assert.equal(ui.confirmacion,'PATCH_a_backend_con_changes_y_expected');
  assert.equal(ui.seleccion_multiple,'2_a_20_registros');
});

test('F1 contrato: seguridad por cuatro capas y sin relaciones textuales',()=>{
  const safety=contract.invariantes_de_seguridad;
  for(const key of ['sesion_efectiva','permiso_MAIN_mas_VER_mas_EDITAR_en_su_tabla',
    'puerta_UNI_y_alcance_por_registro','no_escritura_en_modo_visor',
    'id_dmp_y_llaves_estructuradas_sin_vinculacion_por_nombre',
    'control_de_concurrencia_expected','transaccion_y_auditoria_en_la_misma_conexion',
    'refresco_selectivo_tras_mutacion'])assert.ok(safety.includes(key),key);
});

test('F1 limpieza: main conserva solo las tres tablas expuestas y sus adaptadores',()=>{
  const src=file(MAIN);
  for(const name of ['gestion_credito','pc','detalle_mp_2026']){
    assert.ok(src.includes('if(table===\''+name+'\')'),name);
  }
  assert.match(src,/if\(!Object\.prototype\.hasOwnProperty\.call\(TABLES,table\)\)return false/);
  assert.match(src,/throw new Error\('Tabla sin adaptador autorizado\.'\)/);
  assert.doesNotMatch(src,/phase\s*:\s*'Fase/);
  assert.doesNotMatch(src,/GAS activo|corte global autorizado|Editor preparado, GAS activo/);
  assert.doesNotMatch(src,/La estructura de esta tabla se definirá en fases posteriores/);
});

test('F1 limpieza: el selector no contiene ni invoca SQL ni autoriza escrituras',()=>{
  const src=file(MAIN);
  assert.doesNotMatch(src,/\b(?:INSERT INTO|UPDATE `|DELETE FROM)\b/);
  assert.doesNotMatch(src,/\b(?:can_edit\s*=\s*true|isAdmin\s*=\s*true)\b/);
  assert.match(src,/response\.can_edit===true/);
  assert.ok(src.includes("apiGet(ENDPOINT+'/tablas/'+encodeURIComponent(table)+'/acceso')"));
  assert.match(src,/editor=mount\(container/);
});

test('F1 selector: lista solo recursos visibles y distingue VER/EDITAR',async()=>{
  const f=makeFake({pc:{can_view:false,can_edit:true},
    detalle_mp_2026:{can_view:true,can_edit:false}});
  assert.equal(await f.app.init(),true);
  assert.match(f.root.innerHTML,/Gestión de Crédito/);
  assert.match(f.root.innerHTML,/Mantenimiento Preventivo/);
  assert.doesNotMatch(f.root.innerHTML,/>Venta Adicional</);
  assert.match(f.root.innerHTML,/Permiso EDITAR/);
  assert.match(f.root.innerHTML,/Solo consulta/);
  assert.equal(await f.app.openTable('pc'),false);
});

test('F1 selector: GC mantiene carga y permisos de su editor original',async()=>{
  const f=makeFake();await f.app.init();
  assert.equal(await f.app.openTable('gestion_credito'),true);
  assert.equal(f.status.opens.length,1);
  assert.equal(f.status.opens[0].name,'gc');
  assert.equal(f.status.opens[0].options.canEdit,true);
  assert.ok(f.status.scripts[0].includes('gestion-credito.js'));
});

test('F1 selector: VA usa decision backend y transmite whitelist sin dar acceso adicional',async()=>{
  const f=makeFake();await f.app.init();
  assert.equal(await f.app.openTable('pc'),true);
  assert.equal(f.status.opens[0].name,'va');
  assert.equal(f.status.opens[0].options.canEdit,true);
  assert.deepEqual(Array.from(f.status.opens[0].options.editableFields),['ov','zona_adm']);
  assert.equal(f.status.opens[0].options.canCreate,false);
  assert.doesNotMatch(f.root.innerHTML,/GAS activo|Fase 6/);
});

test('F1 selector: MP solo transmite puerta de Zona 1 proporcionada por backend',async()=>{
  const f=makeFake();await f.app.init();
  assert.equal(await f.app.openTable('detalle_mp_2026'),true);
  assert.equal(f.status.opens[0].name,'mp');
  assert.equal(f.status.opens[0].options.canEdit,true);
  assert.equal(f.status.opens[0].options.canPrepareZone1,undefined);
  assert.equal(f.status.opens[0].options.canWriteZone1,false);
  assert.deepEqual(Array.from(f.status.opens[0].options.zona1EditableFields),[]);
  assert.ok(f.status.scripts.some(name=>name.includes('mantenimiento-preventivo-zona1.js')));
  assert.doesNotMatch(f.root.innerHTML,/GAS activo|Fase 3/);
});

test('F1 selector: sin VER no monta editor aunque se haya otorgado EDITAR',async()=>{
  const f=makeFake({pc:{can_view:false,can_edit:true}});await f.app.init();
  assert.equal(await f.app.openTable('pc'),false);
  assert.equal(f.status.opens.length,0);
});

test('F1 documentacion: explicita riesgos de consulta, GAS, CI y fases',()=>{
  const s=file(DOC);
  for(const term of ['consulta','GAS','1,176','5 fallidas','F2','F3','F4','F5','F6',
    'sin consumidores','id_dmp','128 columnas'])assert.ok(s.includes(term),term);
});

test('F1 GC de GitHub: conserva editor fantasma y no un modal individual',t=>{
  const s=repoSource(t,'modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js');
  if(!s)return;
  for(const term of ['function beginEdit(td)','async function finishEdit()',
    'cua-gc-canedit','data-gc-cell-input',"root.addEventListener('dblclick',dblclick)",
    "root.addEventListener('keydown',keydown)","method:'PATCH'",'expected']){
    // La funcion keydown puede llamarse distinto; comprobar semantica sin acoplar nombre.
    if(term.includes('keydown'))assert.match(s,/root\.addEventListener\('keydown',\w+\)/);
    else assert.ok(s.includes(term),term);
  }
});

test('F1 VA de GitHub: la version .9 ya trae edicion en celda (depuracion restante F2)',t=>{
  const s=repoSource(t,'modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js');
  if(!s)return;
  for(const term of ['function beginCellEdit(td)','async function saveCellEdit()',
    'data-pc-cell-input','cua-pc-canedit',"root.addEventListener('dblclick',onDblClick)",
    "method:'PATCH'",'expected'])assert.ok(s.includes(term),term);
});

test('F1 MP de GitHub: la version .9 ya trae celda + acceso actual Zona1 (F3/F4 pendientes)',t=>{
  const s=repoSource(t,'modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js');
  if(!s)return;
  for(const term of ['function openEdit(td)','async function saveSingle()',
    'data-mp-cell-input','cua-mp-canedit','data-mp-zona1',
    "root.addEventListener('dblclick'","method:'PATCH'",'expected'])assert.ok(s.includes(term),term);
});

test('F1 backend: permisos independientes y ruta Zona1 bajo guard existente',t=>{
  const s=repoSource(t,'backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js');
  if(!s)return;
  for(const term of ['humanInformationGuard_gnral','TABLE_PERMISSIONS','MAIN_VISUAL',
    "'/tablas/gestion_credito/registros", "'/tablas/pc/registros", "'/tablas/detalle_mp_2026/registros",
    "'/tablas/detalle_mp_2026/registros/:id/zona-1'"]){
    assert.ok(s.includes(term),term);
  }
});
