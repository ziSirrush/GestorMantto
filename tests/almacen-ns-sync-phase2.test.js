'use strict';

// [Aster | 2026-10-19 | ASTER-MG | QA ALMACEN NS FASE 2 CONTRATO V001]
// Test de estado/SQL con ejecutor simulado. NUNCA conecta a Aiven.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function clone(source) {
  return {
    lots:new Map([...source.lots].map(([k,v]) => [k,structuredClone(v)])),
    inventory:new Map([...source.inventory].map(([k,v]) => [k,structuredClone(v)])),
    movements:new Map([...source.movements].map(([k,v]) => [k,structuredClone(v)])),
    catalog:new Map([...source.catalog].map(([k,v]) => [k,structuredClone(v)]))
  };
}
class FakeConnection {
  constructor(pool) {this.pool=pool;this.view=null;}
  get s() {return this.view || this.pool.state;}
  async beginTransaction() {this.view=clone(this.pool.state);}
  async commit() {this.pool.state=this.view;this.view=null;}
  async rollback() {this.view=null;}
  release() {}
  async query(sql, params=[]) {
    const q=sql.replace(/\s+/g,' ').trim();
    const state=this.s;
    if (q.startsWith('SELECT GET_LOCK')) return [[{locked:1}]];
    if (q.startsWith('SELECT RELEASE_LOCK')) return [[{'RELEASE_LOCK(?)':1}]];
    if (/SELECT \* FROM almacen_ns_lotes WHERE id_lote=\?/.test(q)) return [[state.lots.get(params[0])].filter(Boolean).map(x=>structuredClone(x))];
    if (/INSERT INTO almacen_ns_lotes/.test(q)) {
      const [id,type,mode,cutoff,from,to,expected,pages,hash,ref,meta]=params;
      if(state.lots.has(id)) throw Error('duplicate ID');
      state.lots.set(id,{id_lote:id,tipo_fuente:type,modo_carga:mode,estado:'RECIBIENDO',activo:0,es_completo:0,
        fecha_corte:cutoff,fecha_desde:from,fecha_hasta:to,filas_esperadas:expected,paginas_esperadas:pages,
        filas_recibidas:0,filas_validas:0,paginas_recibidas:0,hash_carga:hash,referencia_ejecucion:ref,metadata_json:meta});
      return [{affectedRows:1}];
    }
    if (/^INSERT INTO almacen_ns_(inventario|movimientos|catalogo_articulos)/.test(q)) {
      const table=q.match(/^INSERT INTO almacen_ns_(inventario|movimientos|catalogo_articulos)/)[1];
      const columns=q.match(/\(([^)]+)\) VALUES/)[1].replace(/`/g,'').split(',');
      const length=columns.length;
      assert.equal(params.length%length,0,'SQL mismatch: placeholders/columns');
      for(let i=0;i<params.length;i+=length) {
        const row=Object.fromEntries(columns.map((col,j)=>[col,params[i+j]]));
        if(table==='inventario') {
          const key=[row.id_lote,row.id_articulo_ns,row.id_subsidiaria_ns,row.id_ubicacion_ns].join(':');
          if(state.inventory.has(key)) throw Error('ER_DUP_ENTRY inventory');
          state.inventory.set(key,row);
        } else if(table==='catalogo_articulos') {
          const key=row.id_lote+':'+row.fila_origen;
          if(state.catalog.has(key)) throw Error('ER_DUP_ENTRY catalog');
          state.catalog.set(key,row);
        } else {
          const key=row.id_transaccion_ns+':'+row.id_linea_ns;
          const prev=state.movements.get(key);
          state.movements.set(key,prev?{...row,primer_lote_id:prev.primer_lote_id}:row);
        }
      }
      return [{affectedRows:params.length/length}];
    }
    if (/SELECT m.id_transaccion_ns AS tx/.test(q)) {
      const rows=[];
      for(let i=0;i<params.length;i+=2){
        const found=state.movements.get(params[i]+':'+params[i+1]);
        if(found)rows.push({tx:found.id_transaccion_ns,linea:found.id_linea_ns,
          ultimo:found.ultimo_lote_id,estadoUltimo:state.lots.get(found.ultimo_lote_id)?.estado||null});
      }
      return [rows];
    }
    if (/UPDATE almacen_ns_lotes SET metadata_json=/.test(q)) {
      const [meta,rows1,rows2,id]=params, lot=state.lots.get(id);
      lot.metadata_json=meta;lot.paginas_recibidas++;lot.filas_recibidas+=rows1;lot.filas_validas+=rows2;
      return [{affectedRows:1}];
    }
    if (/SELECT COUNT\(\*\) AS total FROM almacen_ns_/.test(q)) {
      const table=q.match(/FROM almacen_ns_(\w+)/)[1];
      const map=table==='inventario'?state.inventory:table==='movimientos'?state.movements:state.catalog;
      const field=table==='movimientos'?'ultimo_lote_id':'id_lote';
      return [[{total:[...map.values()].filter(row=>row[field]===params[0]).length}]];
    }
    if (/SELECT id_lote,DATE_FORMAT\(fecha_corte/.test(q)) {
      return [[...state.lots.values()].filter(l=>l.tipo_fuente==='INVENTARIO_230'&&l.activo===1).map(l=>({id_lote:l.id_lote,fechaCorte:l.fecha_corte}))];
    }
    if (/UPDATE almacen_ns_lotes SET activo=0/.test(q)) {
      for(const lot of state.lots.values()) if(lot.tipo_fuente==='INVENTARIO_230' && lot.activo && lot.id_lote!==params[0])lot.activo=0;
      return [{affectedRows:1}];
    }
    if (/UPDATE almacen_ns_lotes SET hash_carga=/.test(q)) {
      const [hash,active,id]=params,lot=state.lots.get(id);
      lot.hash_carga=hash;lot.activo=active;lot.estado='PUBLICADO';lot.es_completo=1;
      return [{affectedRows:1}];
    }
    if (/UPDATE almacen_ns_lotes SET estado='RECHAZADO'/.test(q)) {
      state.lots.get(params[1]).estado='RECHAZADO';return [{affectedRows:1}];
    }
    throw new Error('Unmocked SQL: '+q.slice(0,210));
  }
}
const pool={state:{lots:new Map(),inventory:new Map(),movements:new Map(),catalog:new Map()},getConnection:async()=>new FakeConnection(pool),query:async(sql,params)=>new FakeConnection(pool).query(sql,params)};
const dbPath=require.resolve('../backend/src/config/db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:pool};
const service=require('../backend/src/modules/almacen/almacen.ns-sync-service');
const auth=require('../backend/src/middleware/integration-auth.middleware');
const seed='00000000-0000-4000-8000-000000000';
let sequence=1;
function lotId(){return seed+String(sequence++).padStart(3,'0');}
function row230(articulo=123,ubicacion='38') {
  return {idArticuloNs:String(articulo),articulo:'TORNILLO',descripcion:'Pieza acero',valorFactura:100,
    porcentajeValorFactura:0.1,fisico:0,idSubsidiariaNs:'2',subsidiaria:'CORELLIAN',
    idUbicacionNs:ubicacion,almacenUbicacion:'ALMACEN PRINCIPAL'};
}
function row433(tx,line) {
  return {departamento:'Operaciones',tipoTransaccion:'Salida',articulo:'TORNILLO',idArticuloNs:'123',
    ag:'ABC',fechaTransaccion:'2026-10-19',numeroDocumento:'DOC-10',descripcion:'Gasto',cantidad:0,
    importeBruto:124.45,categoria:'Consumibles',clase:'A',proyecto:'Proyecto 1',motivoSalida:'Mantenimiento',
    sinCargoCliente:'No',idSubsidiariaNs:'2',subsidiaria:'CORELLIAN',idUbicacionNs:'38',
    almacenUbicacion:'ALMACEN PRINCIPAL',idTransaccionNs:String(tx),idLineaNs:String(line)};
}
function rowCat(row,location) {
  return {idArticuloNs:'123',nombreArticulo:'TORNILLO',numeroParteFabricanteOriginal:'T-123',
    categoriaArticulo:'Repuestos',cantidadFisicaTotalReportada:4,
    ubicacionInventarioTexto:location,ultimoPrecioCompra:20,filaOrigen:row};
}
function digestPages(pages){return service.sha256(pages.map(rows=>service.sha256(JSON.stringify(rows))).join('\n'));}
async function begin(type,rows,options={}) {
  const id=lotId(),size=options.size||1;
  const pages=[];
  for(let i=0;i<rows.length;i+=size)pages.push(rows.slice(i,i+size));
  await service.beginLot(type,{loteId:id,modoCarga:options.mode||'COMPLETA',
    fechaCorte:options.cutoff||'2026-10-19',filasEsperadas:rows.length,
    tamanoPagina:size,hashCarga:digestPages(pages)});
  return {id,pages};
}
async function load(type,rows,options={}) {
  const ref=await begin(type,rows,options);
  for(let i=0;i<ref.pages.length;i++) await service.uploadPage(type,ref.id,{pagina:i+1,filas:ref.pages[i]});
  return {...ref,result:await service.finishLot(type,ref.id)};
}

test('Fase 2: publicacion atomica de inventario y reintentos no duplican',async()=>{
  const rows=[row230(123,'38'),row230(123,'39')];
  const {id,pages}=await begin('INVENTARIO_230',rows);
  await assert.rejects(service.finishLot('INVENTARIO_230',id),{code:'ALMACEN_NS_LOT_INCOMPLETE'});
  await service.uploadPage('INVENTARIO_230',id,{pagina:1,filas:pages[0]});
  const retry=await service.uploadPage('INVENTARIO_230',id,{pagina:1,filas:pages[0]});
  assert.equal(retry.idempotente,true);
  await assert.rejects(service.uploadPage('INVENTARIO_230',id,{pagina:1,filas:[row230(900)]}),{code:'ALMACEN_NS_PAGE_CHANGED'});
  await service.uploadPage('INVENTARIO_230',id,{pagina:2,filas:pages[1]});
  assert.equal((await service.finishLot('INVENTARIO_230',id)).activo,true);
  assert.equal((await service.finishLot('INVENTARIO_230',id)).idempotente,true);
  assert.equal(pool.state.inventory.size,2);
  assert.equal((await service.statusLot('INVENTARIO_230',id)).recibidas,2);
  const newer=await load('INVENTARIO_230',[row230(456)],{cutoff:'2026-10-20'});
  assert.equal(pool.state.lots.get(id).activo,0);
  assert.equal(pool.state.lots.get(newer.id).activo,1);
  const stale=await begin('INVENTARIO_230',[row230(458)],{cutoff:'2026-10-18'});
  await service.uploadPage('INVENTARIO_230',stale.id,{pagina:1,filas:stale.pages[0]});
  await assert.rejects(service.finishLot('INVENTARIO_230',stale.id),{code:'ALMACEN_NS_STALE_SNAPSHOT'});
  assert.equal(pool.state.lots.get(newer.id).activo,1);
});

test('Fase 2: movimientos no deduplican lineas de documento ni filas cantidad cero',async()=>{
  const rows=[row433(100,1),row433(100,2)];
  const loaded=await load('MOVIMIENTOS_433',rows,{mode:'INCREMENTAL',size:2});
  assert.equal(loaded.result.estado,'PUBLICADO');
  assert.equal(pool.state.movements.size,2);
  assert.equal(pool.state.movements.get('100:1').cantidad,'0');
  const next=await begin('MOVIMIENTOS_433',[{...row433(100,1),importeBruto:200}]);
  await service.uploadPage('MOVIMIENTOS_433',next.id,{pagina:1,filas:next.pages[0]});
  assert.equal(pool.state.movements.get('100:1').primer_lote_id,loaded.id);
  await service.finishLot('MOVIMIENTOS_433',next.id);
  assert.equal(pool.state.movements.get('100:1').importe_bruto,'200');
});

test('Fase 2: catalogo respeta filas repetidas del mismo articulo con otra ubicacion',async()=>{
  const rows=[rowCat(2,'BODEGA 1'),rowCat(3,'BODEGA 2')];
  const loaded=await load('CATALOGO_ARTICULOS',rows);
  assert.equal(loaded.result.activo,false);
  assert.equal(pool.state.catalog.size,2);
  assert.equal(pool.state.catalog.get(loaded.id+':2').id_articulo_ns,'123');
});

test('Fase 2: rechaza tipos invalidos, duplicados y no publica manifiesto cambiado',async()=>{
  assert.throws(()=>service.normalizeRow('INVENTARIO_230',{...row230(),fisico:'N/A'},1),{status:422});
  assert.throws(()=>service.normalizeRow('MOVIMIENTOS_433',{...row433(100,1),fechaTransaccion:'19/10/2026'},1),{status:422});
  assert.throws(()=>service.normalizeRow('INVENTARIO_230',{...row230(),idArticuloNs:9007199254740992},1),{status:422});
  const type='INVENTARIO_230';const id=lotId();const rows=[row230()];
  await service.beginLot(type,{loteId:id,modoCarga:'COMPLETA',fechaCorte:'2026-10-19',tamanoPagina:1,
    filasEsperadas:1,hashCarga:'a'.repeat(64)});
  await service.uploadPage(type,id,{pagina:1,filas:rows});
  await assert.rejects(service.finishLot(type,id),{code:'ALMACEN_NS_MANIFEST_MISMATCH'});
  assert.equal(pool.state.lots.get(id).estado,'RECIBIENDO');
  await service.rejectLot(type,id,{motivo:'Prueba rechazada'});
  assert.equal(pool.state.lots.get(id).estado,'RECHAZADO');
});

function mockResponse() {
  return {code:0,data:null,status(n){this.code=n;return this;},json(obj){this.data=obj;return this;}};
}
function signedReq(secret,id,method,url,body='',secs=Math.floor(Date.now()/1000)) {
  const ts=String(secs);
  const signature=crypto.createHmac('sha256',secret).update(ts+'\n'+method+'\n'+url+'\n'+body).digest('hex');
  const headers={'X-Integration-Id':id,'X-Integration-Timestamp':ts,'X-Integration-Signature':signature};
  return {method,originalUrl:url,rawBody:Buffer.from(body),get(name){return headers[name]||'';}};
}

test('Fase 2: M2M de almacen SIEMPRE requiere firma aun si el flag global esta apagado',async()=>{
  const prev={...process.env};
  try {
    process.env.INTEGRATION_AUTH_ENABLED='false';
    process.env.INTEGRATION_ALMACEN_NS_ID='alm-test';
    process.env.INTEGRATION_ALMACEN_NS_SECRET='secreto-provisional-local';
    const middleware=auth.requireIntegrationAuthFor('INTEGRATION_ALMACEN_NS_ID',{alwaysRequireAuth:true,algorithm:'sha256'});
    let passed=0;
    let res=mockResponse();
    middleware({method:'POST',originalUrl:'/api/almacen/sync/contrato',rawBody:Buffer.from('{}'),get(){return '';}},res,()=>passed++);
    assert.equal(res.code,401);assert.equal(passed,0);
    res=mockResponse();
    const body='{"loteId":"00000000-0000-4000-8000-000000000123"}';
    middleware(signedReq('secreto-provisional-local','alm-test','POST','/api/almacen/sync/inventario-230/lotes',body),res,()=>passed++);
    assert.equal(passed,1);
    res=mockResponse();
    middleware(signedReq('error','alm-test','POST','/api/almacen/sync/inventario-230/lotes',body),res,()=>passed++);
    assert.equal(res.code,401);
    res=mockResponse();
    middleware(signedReq('secreto-provisional-local','alm-test','POST','/api/almacen/sync/inventario-230/lotes',body,Math.floor(Date.now()/1000)-600),res,()=>passed++);
    assert.equal(res.code,401);
    res=mockResponse();
    middleware(signedReq('secreto-provisional-local','otro-id','POST','/api/almacen/sync/inventario-230/lotes',body),res,()=>passed++);
    assert.equal(res.code,401);
    // Las rutas legacy con el flag general apagado conservan bypass historico.
    res=mockResponse();
    let oldPassed=0;
    auth.requireIntegrationAuthFor('INTEGRATION_INS_FL_ID')({get(){return '';}},res,()=>oldPassed++);
    assert.equal(oldPassed,1);
  } finally {
    for(const k of Object.keys(process.env)) if(!(k in prev))delete process.env[k];
    Object.assign(process.env,prev);
  }
});

