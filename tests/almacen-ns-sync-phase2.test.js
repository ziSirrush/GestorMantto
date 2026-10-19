'use strict';
// [Aster | 2026-10-19 | ASTER-MG | FIX ALMACEN 230 ID INVENTARIO QA V001]
// Test DB simulator: no external database, no network, no uploads.

const {test,beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function initialState(){return {lots:new Map(),inventory:new Map(),movements:new Map(),catalog:new Map()};}
function clone(source){return {
  lots:new Map([...source.lots].map(([k,v])=>[k,structuredClone(v)])),
  inventory:new Map([...source.inventory].map(([k,v])=>[k,structuredClone(v)])),
  movements:new Map([...source.movements].map(([k,v])=>[k,structuredClone(v)])),
  catalog:new Map([...source.catalog].map(([k,v])=>[k,structuredClone(v)]))
};}
function duplicate(){const err=new Error('ER_DUP_ENTRY');err.code='ER_DUP_ENTRY';return err;}
function inventoryKey(row){return [row.id_lote,row.id_articulo_ns,row.id_subsidiaria_ns,row.id_ubicacion_ns].join('|');}
class FakeConnection {
  constructor(pool){this.pool=pool;this.view=null;}
  get s(){return this.view || this.pool.state;}
  async beginTransaction(){this.view=clone(this.pool.state);}
  async commit(){this.pool.state=this.view;this.view=null;}
  async rollback(){this.view=null;}
  release(){}
  addInventory(row,upsert){
    const state=this.s;
    const id=row.id_inventario==null?String(this.pool.nextId++):String(row.id_inventario);
    if(row.id_inventario!=null && BigInt(id)>=BigInt(this.pool.nextId))this.pool.nextId=Number(BigInt(id)+1n);
    const existing=state.inventory.get(id);
    for(const [otherId,other] of state.inventory){
      if(otherId!==id && inventoryKey(other)===inventoryKey(row))throw duplicate();
    }
    if(existing && !upsert)throw duplicate();
    if(existing){
      if(existing.id_lote!==row.id_lote && !upsert)throw duplicate();
      state.inventory.set(id,{...existing,...row,id_inventario:id,created_at:existing.created_at});
    }else{
      state.inventory.set(id,{...row,id_inventario:id,created_at:'2026-01-01'});
    }
  }
  async query(sql,params=[]){
    const q=sql.replace(/\s+/g,' ').trim();
    const state=this.s;
    if(q.startsWith('SELECT GET_LOCK'))return [[{locked:1}]];
    if(q.startsWith('SELECT RELEASE_LOCK'))return [[{'RELEASE_LOCK(?)':1}]];
    if(/SELECT \* FROM almacen_ns_lotes WHERE id_lote=\?/.test(q))return [[state.lots.get(params[0])].filter(Boolean).map(x=>structuredClone(x))];
    if(/INSERT INTO almacen_ns_lotes/.test(q)){
      const [id,type,mode,cutoff,from,to,expected,pages,hash,ref,meta]=params;
      if(state.lots.has(id))throw duplicate();
      state.lots.set(id,{id_lote:id,tipo_fuente:type,modo_carga:mode,estado:'RECIBIENDO',activo:0,es_completo:0,
        fecha_corte:cutoff,fecha_desde:from,fecha_hasta:to,filas_esperadas:expected,paginas_esperadas:pages,
        filas_recibidas:0,filas_validas:0,paginas_recibidas:0,hash_carga:hash,referencia_ejecucion:ref,metadata_json:meta});
      return [{affectedRows:1}];
    }
    if(/SELECT raw_json FROM almacen_ns_inventario WHERE id_lote=\?/.test(q)){
      return [[...state.inventory.values()].filter(x=>x.id_lote===params[0]).map(x=>({raw_json:x.raw_json}))];
    }
    if(/DELETE FROM almacen_ns_inventario WHERE id_lote=\?/.test(q)){
      let affected=0;
      for(const [key,row] of state.inventory){if(row.id_lote===params[0]){state.inventory.delete(key);affected++;}}
      return [{affectedRows:affected}];
    }
    if(/SELECT id_inventario AS idInventario,id_lote,hash_fila FROM almacen_ns_inventario WHERE id_inventario IN/.test(q)){
      return [params.map(id=>state.inventory.get(String(id))).filter(Boolean).map(x=>({idInventario:x.id_inventario,id_lote:x.id_lote,hash_fila:x.hash_fila}))];
    }
    if(/^INSERT INTO almacen_ns_(inventario|movimientos|catalogo_articulos)/.test(q)){
      const table=q.match(/^INSERT INTO almacen_ns_(inventario|movimientos|catalogo_articulos)/)[1];
      const columns=q.match(/\(([^)]+)\) VALUES/)[1].replace(/`/g,'').split(',');
      const length=columns.length;
      assert.equal(params.length%length,0,'Placeholders/columns mismatch');
      for(let i=0;i<params.length;i+=length){
        const row=Object.fromEntries(columns.map((col,j)=>[col,params[i+j]]));
        if(table==='inventario')this.addInventory(row,q.includes('ON DUPLICATE KEY UPDATE'));
        else if(table==='catalogo_articulos'){
          const key=row.id_lote+':'+row.fila_origen;
          if(state.catalog.has(key))throw duplicate();
          state.catalog.set(key,row);
        }else{
          const key=row.id_transaccion_ns+':'+row.id_linea_ns;
          const old=state.movements.get(key);
          state.movements.set(key,old?{...row,primer_lote_id:old.primer_lote_id}:row);
        }
      }
      return [{affectedRows:params.length/length}];
    }
    if(/SELECT m.id_transaccion_ns AS tx/.test(q)){
      const rows=[];
      for(let i=0;i<params.length;i+=2){
        const old=state.movements.get(params[i]+':'+params[i+1]);
        if(old)rows.push({tx:old.id_transaccion_ns,linea:old.id_linea_ns,
          ultimo:old.ultimo_lote_id,estadoUltimo:state.lots.get(old.ultimo_lote_id)?.estado||null});
      }
      return [rows];
    }
    if(/UPDATE almacen_ns_lotes SET metadata_json=/.test(q)){
      const [meta,rows1,rows2,id]=params,lot=state.lots.get(id);
      lot.metadata_json=meta;lot.paginas_recibidas++;lot.filas_recibidas+=rows1;lot.filas_validas+=rows2;
      return [{affectedRows:1}];
    }
    if(/SELECT COUNT\(\*\) AS total FROM almacen_ns_/.test(q)){
      const table=q.match(/FROM almacen_ns_(\w+)/)[1];
      const map=table==='inventario'?state.inventory:table==='movimientos'?state.movements:state.catalog;
      const column=table==='movimientos'?'ultimo_lote_id':'id_lote';
      return [[{total:[...map.values()].filter(row=>row[column]===params[0]).length}]];
    }
    if(/SELECT id_lote,DATE_FORMAT\(fecha_corte/.test(q)){
      return [[...state.lots.values()].filter(l=>l.tipo_fuente==='INVENTARIO_230'&&l.activo===1).map(l=>({id_lote:l.id_lote,fechaCorte:l.fecha_corte}))];
    }
    if(/UPDATE almacen_ns_inventario SET id_lote=\?,updated_at=updated_at WHERE id_lote=\?/.test(q)){
      let affected=0;
      for(const [key,row] of state.inventory){
        if(row.id_lote===params[1]){
          const updated={...row,id_lote:params[0]};
          for(const [otherId,other] of state.inventory){if(otherId!==key&&inventoryKey(other)===inventoryKey(updated))throw duplicate();}
          state.inventory.set(key,updated);affected++;
        }
      }
      return [{affectedRows:affected}];
    }
    if(/UPDATE almacen_ns_lotes SET activo=0/.test(q)){
      for(const lot of state.lots.values())if(lot.tipo_fuente==='INVENTARIO_230'&&lot.activo&&lot.id_lote!==params[0])lot.activo=0;
      return [{affectedRows:1}];
    }
    if(/UPDATE almacen_ns_lotes SET hash_carga=/.test(q)){
      const [hash,active,id]=params,lot=state.lots.get(id);
      lot.hash_carga=hash;lot.activo=active;lot.estado='PUBLICADO';lot.es_completo=1;
      return [{affectedRows:1}];
    }
    if(/UPDATE almacen_ns_lotes SET estado='RECHAZADO'/.test(q)){
      state.lots.get(params[1]).estado='RECHAZADO';return [{affectedRows:1}];
    }
    throw new Error('Unmocked SQL: '+q.slice(0,250));
  }
}
const pool={state:initialState(),nextId:1,getConnection:async()=>new FakeConnection(pool),query:async(sql,params)=>new FakeConnection(pool).query(sql,params)};
const dbPath=require.resolve('../backend/src/config/db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:pool};
const service=require('../backend/src/modules/almacen/almacen.ns-sync-service');
const auth=require('../backend/src/middleware/integration-auth.middleware');
let sequence=1;
beforeEach(()=>{pool.state=initialState();pool.nextId=1;sequence=1;});
function lotId(){return '00000000-0000-4000-8000-'+String(sequence++).padStart(12,'0');}
function row230(id=1,article=123,warehouse='38'){
  return {idInventario:String(id),idArticuloNs:String(article),articulo:'TORNILLO',descripcion:'Pieza acero',valorFactura:100,
    porcentajeValorFactura:0.1,fisico:0,idSubsidiariaNs:'2',subsidiaria:'CORELLIAN',
    idUbicacionNs:warehouse,almacenUbicacion:'ALMACEN PRINCIPAL'};
}
function row433(tx,line){return {departamento:'Operaciones',tipoTransaccion:'Salida',articulo:'TORNILLO',idArticuloNs:'123',
  ag:'ABC',fechaTransaccion:'2026-10-19',numeroDocumento:'DOC-10',descripcion:'Gasto',cantidad:0,
  importeBruto:124.45,categoria:'Consumibles',clase:'A',proyecto:'Proyecto 1',motivoSalida:'Mantenimiento',
  sinCargoCliente:'No',idSubsidiariaNs:'2',subsidiaria:'CORELLIAN',idUbicacionNs:'38',
  almacenUbicacion:'ALMACEN PRINCIPAL',idTransaccionNs:String(tx),idLineaNs:String(line)};}
function rowCat(row,location){return {idArticuloNs:'123',nombreArticulo:'TORNILLO',numeroParteFabricanteOriginal:'T-123',
  categoriaArticulo:'Repuestos',cantidadFisicaTotalReportada:4,
  ubicacionInventarioTexto:location,ultimoPrecioCompra:20,filaOrigen:row};}
function digestPages(pages){return service.sha256(pages.map(rows=>service.sha256(JSON.stringify(rows))).join('\n'));}
async function begin(type,rows,options={}){
  const id=lotId(),size=options.size||1,pages=[];
  for(let i=0;i<rows.length;i+=size)pages.push(rows.slice(i,i+size));
  await service.beginLot(type,{loteId:id,modoCarga:options.mode||'COMPLETA',
    fechaCorte:options.cutoff||'2026-10-19',filasEsperadas:rows.length,
    tamanoPagina:size,hashCarga:options.hash||digestPages(pages)});
  return {id,pages};
}
async function load(type,rows,options={}){
  const ref=await begin(type,rows,options);
  for(let i=0;i<ref.pages.length;i++)await service.uploadPage(type,ref.id,{pagina:i+1,filas:ref.pages[i]});
  return {...ref,result:await service.finishLot(type,ref.id)};
}
function activeInventory(){
  const lot=[...pool.state.lots.values()].find(l=>l.tipo_fuente==='INVENTARIO_230'&&l.activo===1);
  return [...pool.state.inventory.values()].filter(r=>r.id_lote===lot?.id_lote);
}
test('Inventario: idInventario requerido, positivo, exacto y unico en pagina',async()=>{
  assert.throws(()=>service.normalizeRow('INVENTARIO_230',{...row230(),idInventario:undefined},1),{status:422});
  assert.throws(()=>service.normalizeRow('INVENTARIO_230',{...row230(),idInventario:0},1),{status:422});
  assert.throws(()=>service.normalizeRow('INVENTARIO_230',{...row230(),idInventario:9007199254740992},1),{status:422});
  assert.equal(service.normalizeRow('INVENTARIO_230',row230('9007199254740993'),1).idInventario,'9007199254740993');
  const reference=await begin('INVENTARIO_230',[row230(1),row230(1,124,'39')],{size:2});
  await assert.rejects(service.uploadPage('INVENTARIO_230',reference.id,{pagina:1,filas:reference.pages[0]}),{code:'ALMACEN_NS_DUPLICATE_KEY'});
});
test('Inventario: primer envio respeta IDs explicitos y fotografia solo visible tras publicar',async()=>{
  const rows=[row230(200,123,'38'),row230(400,123,'39')];
  const ref=await begin('INVENTARIO_230',rows);
  await service.uploadPage('INVENTARIO_230',ref.id,{pagina:1,filas:ref.pages[0]});
  assert.equal(activeInventory().length,0);
  await assert.rejects(service.finishLot('INVENTARIO_230',ref.id),{code:'ALMACEN_NS_LOT_INCOMPLETE'});
  const retry=await service.uploadPage('INVENTARIO_230',ref.id,{pagina:1,filas:ref.pages[0]});
  assert.equal(retry.idempotente,true);
  await service.uploadPage('INVENTARIO_230',ref.id,{pagina:2,filas:ref.pages[1]});
  const result=await service.finishLot('INVENTARIO_230',ref.id);
  assert.deepEqual(result.resumenInventario,{insertados:2,actualizados:0,sinCambios:0,conservados:0});
  assert.deepEqual(activeInventory().map(x=>x.id_inventario).sort(),['200','400']);
  assert.equal((await service.finishLot('INVENTARIO_230',ref.id)).idempotente,true);
});
test('Inventario: update por ID, inserta nuevos y conserva IDs que faltan en SEND',async()=>{
  await load('INVENTARIO_230',[row230(11,123,'38'),row230(12,124,'39')]);
  const old=pool.state.inventory.get('11').created_at;
  const next=await begin('INVENTARIO_230',[{...row230(11,123,'38'),fisico:12},row230(13,125,'40')],{cutoff:'2026-10-20'});
  await service.uploadPage('INVENTARIO_230',next.id,{pagina:1,filas:next.pages[0]});
  assert.equal(pool.state.inventory.get('11').fisico,'0');
  assert.deepEqual(activeInventory().map(x=>x.id_inventario).sort(),['11','12']);
  await service.uploadPage('INVENTARIO_230',next.id,{pagina:2,filas:next.pages[1]});
  const result=await service.finishLot('INVENTARIO_230',next.id);
  assert.deepEqual(result.resumenInventario,{insertados:1,actualizados:1,sinCambios:0,conservados:1});
  assert.deepEqual(activeInventory().map(x=>x.id_inventario).sort(),['11','12','13']);
  assert.equal(pool.state.inventory.get('11').fisico,'12');
  assert.equal(pool.state.inventory.get('11').created_at,old);
  assert.equal(pool.state.inventory.get('12').id_lote,next.id);
});
test('Inventario: ejecucion sin cambios reconoce hash y mueve sin duplicar',async()=>{
  await load('INVENTARIO_230',[row230(1)]);
  const result=await load('INVENTARIO_230',[row230(1)],{cutoff:'2026-10-20'});
  assert.deepEqual(result.result.resumenInventario,{insertados:0,actualizados:0,sinCambios:1,conservados:0});
  assert.equal(activeInventory().length,1);
});
test('Inventario: ID repetido entre paginas cancela la publicacion',async()=>{
  const first=await load('INVENTARIO_230',[row230(20,123)]);
  const second=await begin('INVENTARIO_230',[row230(20,123),row230(20,124,'39')],{cutoff:'2026-10-20'});
  await service.uploadPage('INVENTARIO_230',second.id,{pagina:1,filas:second.pages[0]});
  await service.uploadPage('INVENTARIO_230',second.id,{pagina:2,filas:second.pages[1]});
  await assert.rejects(service.finishLot('INVENTARIO_230',second.id),{code:'ALMACEN_NS_INVENTORY_ID_DUPLICATE'});
  assert.equal(pool.state.lots.get(first.id).activo,1);
  assert.equal(pool.state.inventory.get('20').fisico,'0');
});
test('Inventario: choque de ID con otro lote pendiente no modifica datos ajenos',async()=>{
  const other=await begin('INVENTARIO_230',[row230(8,200)]);
  await service.uploadPage('INVENTARIO_230',other.id,{pagina:1,filas:other.pages[0]});
  assert.ok(pool.state.inventory.has('1'));
  const newLot=await begin('INVENTARIO_230',[row230(1,100,'39')]);
  await service.uploadPage('INVENTARIO_230',newLot.id,{pagina:1,filas:newLot.pages[0]});
  await assert.rejects(service.finishLot('INVENTARIO_230',newLot.id),{code:'ALMACEN_NS_INVENTORY_ID_CONFLICT'});
  assert.equal(pool.state.inventory.get('1').id_lote,other.id);
});
test('Inventario: clave NetSuite reaprovechada con otro id causa rollback al preservar',async()=>{
  await load('INVENTARIO_230',[row230(1,123,'38')]);
  const next=await begin('INVENTARIO_230',[row230(2,123,'38')],{cutoff:'2026-10-20'});
  await service.uploadPage('INVENTARIO_230',next.id,{pagina:1,filas:next.pages[0]});
  await assert.rejects(service.finishLot('INVENTARIO_230',next.id),{code:'ALMACEN_NS_DUPLICATE_DB'});
  assert.equal(activeInventory().length,1);
  assert.equal(pool.state.inventory.get('1').id_lote!==next.id,true);
});
test('Inventario: lote rechazado borra solo sus filas temporales',async()=>{
  const ref=await begin('INVENTARIO_230',[row230(3)]);
  await service.uploadPage('INVENTARIO_230',ref.id,{pagina:1,filas:ref.pages[0]});
  assert.equal(pool.state.inventory.size,1);
  await service.rejectLot('INVENTARIO_230',ref.id,{motivo:'Cancelado para nueva carga'});
  assert.equal(pool.state.inventory.size,0);
  assert.equal(pool.state.lots.get(ref.id).estado,'RECHAZADO');
});
test('Inventario: manifiesto cambiado y fecha de corte anterior no publican',async()=>{
  const ref=await begin('INVENTARIO_230',[row230(2)],{hash:'a'.repeat(64)});
  await service.uploadPage('INVENTARIO_230',ref.id,{pagina:1,filas:ref.pages[0]});
  await assert.rejects(service.finishLot('INVENTARIO_230',ref.id),{code:'ALMACEN_NS_MANIFEST_MISMATCH'});
  await service.rejectLot('INVENTARIO_230',ref.id,{motivo:'Manifiesto diferente; reiniciar lote'});
  await load('INVENTARIO_230',[row230(1)],{cutoff:'2026-10-20'});
  const stale=await begin('INVENTARIO_230',[row230(1)],{cutoff:'2026-10-19'});
  await service.uploadPage('INVENTARIO_230',stale.id,{pagina:1,filas:stale.pages[0]});
  await assert.rejects(service.finishLot('INVENTARIO_230',stale.id),{code:'ALMACEN_NS_STALE_SNAPSHOT'});
});
test('Movimientos 433: se conserva clave transaccion+linea e importes con cantidad cero',async()=>{
  const rows=[row433(100,1),row433(100,2)];
  const first=await load('MOVIMIENTOS_433',rows,{mode:'INCREMENTAL',size:2});
  assert.equal(first.result.estado,'PUBLICADO');
  assert.equal(pool.state.movements.size,2);
  const next=await begin('MOVIMIENTOS_433',[{...row433(100,1),importeBruto:200}]);
  await service.uploadPage('MOVIMIENTOS_433',next.id,{pagina:1,filas:next.pages[0]});
  assert.equal(pool.state.movements.get('100:1').primer_lote_id,first.id);
  await service.finishLot('MOVIMIENTOS_433',next.id);
  assert.equal(pool.state.movements.get('100:1').importe_bruto,'200');
});
test('Catalogo: mismo articulo en distintas ubicaciones no colisiona',async()=>{
  const rows=[rowCat(2,'BODEGA 1'),rowCat(3,'BODEGA 2')];
  const done=await load('CATALOGO_ARTICULOS',rows);
  assert.equal(done.result.activo,false);
  assert.equal(pool.state.catalog.size,2);
});
function response(){return {code:0,status(n){this.code=n;return this;},json(obj){this.data=obj;return this;}};}
function signedReq(secret,id,method,url,body='',secs=Math.floor(Date.now()/1000)){
  const ts=String(secs),sig=crypto.createHmac('sha256',secret).update(ts+'\n'+method+'\n'+url+'\n'+body).digest('hex');
  const headers={'X-Integration-Id':id,'X-Integration-Timestamp':ts,'X-Integration-Signature':sig};
  return {method,originalUrl:url,rawBody:Buffer.from(body),get(name){return headers[name]||'';}};
}
test('M2M Almacen sigue exigiendo HMAC con flag global apagado',async()=>{
  const old={...process.env};
  try{
    process.env.INTEGRATION_AUTH_ENABLED='false';
    process.env.INTEGRATION_ALMACEN_NS_ID='alm-test';
    process.env.INTEGRATION_ALMACEN_NS_SECRET='secreto-local-qa';
    const authMiddleware=auth.requireIntegrationAuthFor('INTEGRATION_ALMACEN_NS_ID',{alwaysRequireAuth:true,algorithm:'sha256'});
    let passed=0;
    let res=response();authMiddleware({method:'POST',originalUrl:'/api/almacen/sync/inventario-230/lotes',rawBody:Buffer.from('{}'),get(){return '';}},res,()=>passed++);
    assert.equal(res.code,401);
    res=response();authMiddleware(signedReq('secreto-local-qa','alm-test','POST','/api/almacen/sync/inventario-230/lotes','{}'),res,()=>passed++);
    assert.equal(passed,1);
    res=response();authMiddleware(signedReq('incorrecto','alm-test','POST','/api/almacen/sync/inventario-230/lotes','{}'),res,()=>passed++);
    assert.equal(res.code,401);
  }finally{
    for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];
    Object.assign(process.env,old);
  }
});
