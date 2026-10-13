'use strict';
// [Mantto Gestor | 2026-10-13 | FASE_4_INSTALACIONES_ADMIN_V2_INTEGRACION_QA_V001]
// Prueba la compatibilidad de los paquetes Fases 1+2+3, sin Aiven ni Azure.
// El servicio real de F1 se carga con repositorio, conexion y auditoria FALSOS.
// Los helpers de F3 producen solicitudes HTTP falsas; ninguna sale a red.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend/src/modules/instalaciones-administracion');
const FRONTEND = path.join(ROOT, 'modules/instalaciones-administracion');
const rules = require(path.join(BACKEND, 'instalaciones-administracion.auto-rules.js'));
const policy = require(path.join(BACKEND, 'instalaciones-administracion.field-policy.js'));
const helper = require(path.join(FRONTEND, 'instalaciones-administracion-ghost_cor.js')).helpers;
const today = '2026-10-13';
const original = id => ({
  id_ins_fl:id, id_proyecto:'P10152', estatus:id===21?'02-OC':'03-PM',
  estatus_completo:null, comentarios_fl:'Previo '+id,
  fecha_visita:'2026-10-10', dias_sin_visita:'0',
  fecha_ccnr:'-', dias_sin_ccnr:'-',
  fecha_fin_montaje_modificado:'-', fecha_fin_montaje_planeado:'2026-10-25',
  dias_restantes:'0', vendedor:'LEG', id_asesor:5, id_admin:70,
  supervisor_fl:'OLD', id_sup:44, recepcion_carpeta:null, fecha_liberacion_ajuste:'SI'
});
const G = {
  proyecto:{fields:['id_ins_fl','id_proyecto','estatus','estatus_completo']},
  seguimiento:{fields:['comentarios_fl','fecha_visita','dias_sin_visita','dias_sin_ccnr']},
  produccion_logistica:{fields:['fecha_ccnr']},
  montaje:{fields:['fecha_fin_montaje_modificado','fecha_fin_montaje_planeado','dias_restantes']},
  cliente_contrato:{fields:['vendedor','recepcion_carpeta','fecha_liberacion_ajuste']},
  responsables:{fields:['supervisor_fl','id_asesor','id_admin','id_sup']}
};
const visibleGroups = Object.entries(G).map(([key,group]) => ({
  key, fields:group.fields, editable_fields:group.fields.filter(f=>!rules.DIRECT_READONLY_FIELDS_COR.includes(f)),
  permissions:{can_view:true,can_edit:true}
}));
function makeFixture(options={}) {
  const rows = new Map([21,22,23].map(id=>[id,original(id)]));
  const events = [], calls = [];
  const users = [
    {id_SB:31,iniciales:'VEN',area:'Ventas',estado:1},
    {id_SB:44,iniciales:'SUP',area:'Instalaciones',estado:1},
    {id_SB:50,iniciales:'INACT',area:'Ventas',estado:0}
  ];
  const relations = {31:[{id_SB:70,iniciales:'ABC'},{id_SB:71,iniciales:'DEF'}]};
  const conn={
    snapshot:null,
    async beginTransaction(){events.push('BEGIN');this.snapshot=new Map([...rows].map(([id,row])=>[id,{...row}]));},
    async commit(){events.push('COMMIT');this.snapshot=null;},
    async rollback(){events.push('ROLLBACK');rows.clear();for(const [id,row] of this.snapshot)rows.set(id,row);this.snapshot=null;},
    release(){events.push('RELEASE');},
    async query(sql,params){
      if(/SELECT id_SB, iniciales FROM usuarios/.test(sql))return [users.filter(u=>u.estado===1&&u.area===params[0]&&u.iniciales===params[1])];
      if(/SELECT DISTINCT u.id_SB, u.iniciales/.test(sql))return [relations[params[0]]||[]];
      if(/^UPDATE ins_fl SET /.test(sql)){
        const names=[...sql.matchAll(/`([^`]+)`\s*=\s*\?/g)].map(m=>m[1]);
        const id=params[names.length];const record=rows.get(id);
        if(!record)throw new Error('ID de prueba no encontrado');
        for(let i=0;i<names.length;i++)record[names[i]]=params[i];
        events.push('UPDATE:'+id+':'+names.join(','));
        return [{affectedRows:1}];
      }
      throw new Error('Consulta SQL no declarada en fixture: '+sql);
    }
  };
  const repository={
    comparable_cor:value=>value===null||value===undefined||value===''?null:String(value).trim(),
    parseProjectKey_cor:key=>{
      if(!/^P:[a-z0-9]+$/i.test(key))throw Object.assign(new Error('Clave invalida'),{statusCode:400});
      return {key,params:[key.slice(2)]};
    },
    async getRecordById_cor({id,scope,projectKey}){
      const row=rows.get(Number(id));
      if(!row || scope?.mode!=='ALL'&&options.deniedId===id ||
          projectKey && row.id_proyecto!==projectKey.slice(2))return null;
      return {...row};
    }
  };
  const audit = {async recordGroupUpdate_cor(req,{executor,group,changes}){
    assert.equal(executor,conn,'La auditoria debe usar la misma conexion');
    if(options.auditFail && options.auditFail === group)throw new Error('Fallo simulado de auditoria');
    events.push('AUDIT:'+group+':'+Object.keys(changes).join(','));
  }};
  const auth = {
    async ensureFullEditPermission_cor(req){if(options.denyEdit||req.viewerContext?.active)
      throw Object.assign(new Error('Denegado'),{statusCode:403});},
    async resolveGroupPermissions_cor(){return {proyecto:{can_view:!options.denyProject}};}
  };
  const source=fs.readFileSync(path.join(BACKEND,'instalaciones-administracion.auto-service.js'),'utf8');
  const replacements={
    '../../config/db':{
      getConnection:async()=>conn,
      async query(sql){
        if(/WHERE estado=1 AND area IN/.test(sql))return [users.filter(u=>u.estado===1)];
        // Catalogo de responsables no debe pedir el mapa GLOBAL asesor->admin.
        throw new Error('Consulta SQL no autorizada en catalogo: '+sql);
      }
    },
    '../ventas/ventas-visibility.service':{resolveVisibilityScope:async()=>({mode:'SCOPED'})},
    './instalaciones-administracion.service':auth,
    './instalaciones-administracion.repository':repository,
    './instalaciones-administracion.audit-service':audit,
    './instalaciones-administracion.constants':{
      GROUPS_COR:G,ALL_OPERATIONAL_FIELDS_COR:[...new Set(Object.values(G).flatMap(g=>g.fields))]
    },
    './instalaciones-administracion.validation':{
      positiveId_cor(value){const id=Number(value);if(!Number.isSafeInteger(id)||id<1)
        throw Object.assign(new Error('ID invalido'),{statusCode:400});return id;},
      normalizeGroupUpdate_cor(key,{changes}){
        for(const field of Object.keys(changes))if(!G[key]?.fields.includes(field))throw new Error('Grupo invalido '+field);
        return changes;
      }
    },
    './instalaciones-administracion.field-policy':policy,
    './instalaciones-administracion.auto-rules':rules
  };
  const module={exports:{}};
  new Function('require','module','exports',source)(name=>{
    if(!Object.prototype.hasOwnProperty.call(replacements,name))throw new Error('Modulo no simulado: '+name);
    return replacements[name];
  },module,module.exports);
  const service=module.exports;
  const actor={contextUser:{id_SB:1},viewerContext:{active:false}};
  async function api(url,init={}) {
    calls.push({url,init});
    if(init.method==='PATCH') {
      const body=JSON.parse(init.body);
      if(options.timeout)throw new Error('Timeout simulado');
      if(url.includes('/edicion-multiple-directa')) {
        const res=await service.updateDirectMulti_cor(actor,decodeURIComponent(url.split('/proyectos/')[1].split('/equipos/')[0]),body);
        return {ok:true,...res};
      }
      if(url.includes('/edicion-directa')) {
        const [key,tail]=url.split('/proyectos/')[1].split('/equipos/');
        const id=Number(tail.split('/')[0]);
        return {ok:true,...await service.updateDirect_cor(actor,decodeURIComponent(key),id,body)};
      }
      throw new Error('Ruta PATCH inesperada');
    }
    const id=Number(url.split('/registros/')[1]);
    if(!Number.isSafeInteger(id)||!rows.has(id))throw Object.assign(new Error('No encontrado'),{status:404});
    if(options.getForbiddenId===id)throw Object.assign(new Error('Acceso revocado'),{status:403});
    return {ok:true,data:{...rows.get(id)}};
  }
  return {rows,events,calls,service,api,actor,conn};
}
const cmp = (_f,v)=>v===null||v===undefined||v===''?null:String(v).trim();

test('01 - contrato readonly del backend y columnas visibles del frontend coinciden',()=>{
  const columns=[...new Set(Object.values(G).flatMap(g=>g.fields))];
  const shown=helper.visibleColumns_cor(columns,visibleGroups);
  for(const field of [...rules.AUTO_IDS_COR,'id_ins_fl','id_proyecto'])assert(!shown.includes(field),field);
  for(const field of rules.AUTO_FIELDS_COR)assert(shown.includes(field),field);
  assert(!helper.editable_cor('id_asesor',original(21),visibleGroups,false));
  assert(!helper.editable_cor('dias_restantes',original(21),visibleGroups,false));
});

test('02 - los ocho estatus aceptados por frontend son los mismos que backend',()=>{
  assert.deepEqual([...helper.STATUS_CODES],[...rules.STATUS_CODES_COR]);
  const catalog={estatus:rules.STATUS_CODES_COR.map(codigo=>({codigo,nombre:rules.STATUS_LABELS_COR[codigo]}))};
  for(const value of rules.STATUS_CODES_COR){
    assert.deepEqual(helper.validValue_cor('estatus',value,{kind:'text'},catalog),{ok:true,value});
    assert.equal(rules.assertManualFields_cor({estatus:value},['estatus']), 'estatus');
  }
});

test('03 - fecha recepcion calendario, liberacion ajuste texto SI o fecha',()=>{
  assert.equal(policy.fieldMeta_cor('recepcion_carpeta').kind,'date');
  assert.equal(policy.fieldMeta_cor('fecha_liberacion_ajuste').kind,'text');
  assert.equal(helper.validValue_cor('fecha_liberacion_ajuste','SI',{kind:'text'}).value,'SI');
  assert.equal(helper.validValue_cor('fecha_liberacion_ajuste','13/10/2026',{kind:'text'}).value,'13/10/2026');
});

test('04 - catalogos de vendedores/supervisores no exponen mapa rel_admin global',async()=>{
  const f=makeFixture();const data=await f.service.getEditCatalogs_cor(f.actor);
  assert.equal(data.vendedores[0].iniciales,'VEN');
  assert.equal(data.supervisores[0].iniciales,'SUP');
  assert(!Object.hasOwn(data,'rel_admin_por_asesor'));
  assert.equal(data.estatus.length,8);
});

test('05 - persistencia individual frontend->servicio F1->GET auditado',async()=>{
  const f=makeFixture();
  const out=await helper.persistVerified_cor(f.api,{
    projectKey:'P:P10152',id:21,field:'estatus',original:'02-OC',value:'08-T',canonicalCompare:cmp
  });
  assert.equal(out.estatus,'08-T');
  assert.equal(f.rows.get(21).estatus_completo,'Equipos Entregados');
  assert.equal(f.events.filter(v=>v==='BEGIN').length,1);
  assert.equal(f.events.filter(v=>v==='COMMIT').length,1);
  assert(f.events.some(x=>x.includes('AUDIT:proyecto:estatus,estatus_completo')));
  assert.equal(f.calls.filter(x=>x.init.method==='PATCH').length,1);
  assert.equal(f.calls.filter(x=>x.url.includes('/registros/')).length,1);
});

test('06 - lote frontend->backend F1 atomico->GET individual de ambas filas',async()=>{
  const f=makeFixture();
  const result=await helper.persistVerifiedMulti_cor(f.api,{
    projectKey:'P:P10152',selectedRows:[original(21),original(22)],
    field:'comentarios_fl',value:'Nota comun',canonicalCompare:cmp
  });
  assert.equal(result.verified.size,2);
  for(const id of [21,22])assert.equal(f.rows.get(id).comentarios_fl,'Nota comun');
  assert.equal(f.events.filter(v=>v==='BEGIN').length,1);
  assert.equal(f.events.filter(v=>v==='COMMIT').length,1);
  assert.equal(f.events.filter(v=>v.startsWith('AUDIT:seguimiento:comentarios_fl')).length,2);
  assert(f.events.filter(v=>v.startsWith('AUDIT:')).length>=2, 'Tambien se auditan derivados recalculados');
  assert.equal(f.calls.filter(x=>x.init.method==='PATCH').length,1);
  assert.equal(f.calls.filter(x=>x.url.includes('/registros/')).length,2);
});

test('07 - conflicto concurrente F1 revierte el lote y frontend no reintenta',async()=>{
  const f=makeFixture();const old=original(22);old.comentarios_fl='Valor vencido';
  await assert.rejects(helper.persistVerifiedMulti_cor(f.api,{
    projectKey:'P:P10152',selectedRows:[original(21),old],field:'comentarios_fl',
    value:'Cambio concurrente',canonicalCompare:cmp
  }),{statusCode:409});
  assert.equal(f.events.filter(x=>x==='ROLLBACK').length,1);
  assert.equal(f.events.some(x=>x.startsWith('UPDATE:')),false);
  assert.equal(f.calls.length,1);
});

test('08 - auditoria fallida del segundo equipo revierte ambos',async()=>{
  const f=makeFixture({auditFail:'seguimiento'});
  await assert.rejects(helper.persistVerifiedMulti_cor(f.api,{
    projectKey:'P:P10152',selectedRows:[original(21),original(22)],field:'comentarios_fl',
    value:'No debe persistir',canonicalCompare:cmp
  }),/Fallo simulado de auditoria/);
  assert.equal(f.rows.get(21).comentarios_fl,'Previo 21');
  assert.equal(f.rows.get(22).comentarios_fl,'Previo 22');
  assert(f.events.includes('ROLLBACK'));
});

test('09 - vendedor asigna ID y relacion admin múltiple sin inventar FK CSV',async()=>{
  const f=makeFixture();
  const out=await helper.persistVerified_cor(f.api,{
    projectKey:'P:P10152',id:21,field:'vendedor',original:'LEG',value:'VEN',canonicalCompare:cmp
  });
  assert.equal(out.vendedor,'VEN');
  assert.equal(out.id_asesor,31);
  assert.equal(out.id_admin,70,'Conserva relacion valida previa entre dos administradores');
  const mapped=await f.service.adminForSales_cor({query:async()=>[[
    {id_SB:70,iniciales:'ABC'},{id_SB:71,iniciales:'DEF'}
  ]]},31,70);
  assert.equal(mapped.relAdmin,'ABC, DEF');
});

test('10 - IDs/derivados no pueden enviarse ni para individual ni lote',()=>{
  const f=makeFixture();
  for(const field of rules.DIRECT_READONLY_FIELDS_COR){
    assert.throws(()=>f.service.normalizeSingleCell_cor({changes:{[field]:'1'},expected:{[field]:null}},false),{statusCode:400});
    assert.throws(()=>helper.payload_cor(field,null,'1'));
  }
});

test('11 - GET revocado despues de PATCH no reintenta escritura',async()=>{
  const f=makeFixture({getForbiddenId:22});
  await assert.rejects(helper.persistVerifiedMulti_cor(f.api,{
    projectKey:'P:P10152',selectedRows:[original(21),original(22)],field:'comentarios_fl',
    value:'Confirmado sin GET',canonicalCompare:cmp
  }),{committed:true,status:403});
  assert.equal(f.calls.filter(x=>x.init.method==='PATCH').length,1);
  assert.equal(f.events.filter(x=>x==='COMMIT').length,1);
});

test('12 - fechados calculados coinciden con valor persistido en ins_fl',async()=>{
  const f=makeFixture();
  const out=await helper.persistVerified_cor(f.api,{
    projectKey:'P:P10152',id:21,field:'fecha_visita',original:'2026-10-10',
    value:today,canonicalCompare:cmp
  });
  // La prueba usa fecha del sistema de ejecucion real (zonedToday),
  // no necesariamente 13/10/2026. Comparar contra la misma regla.
  const expected=rules.derivedForRow_cor(out,rules.zonedToday_cor()).dias_sin_visita;
  assert.equal(out.dias_sin_visita,expected);
});

test('13 - caja de selección y boton están en el mismo renderer F3',()=>{
  const src=fs.readFileSync(path.join(FRONTEND,'instalaciones-administracion-ghost_cor.js'),'utf8');
  const css=fs.readFileSync(path.join(FRONTEND,'instalaciones-administracion-ghost_cor.css'),'utf8');
  assert.match(src,/data-iadm-v3-clear="1"/);
  assert.match(src,/data-iadm-v3-select="1"/);
  assert.match(src,/selected\.size\s*>=\s*MAX_MULTI/);
  assert.match(css,/\.iadm-cor-v3-toolbar\s*\{\s*position:sticky/);
  assert.match(css,/position:sticky;left:0/);
});
