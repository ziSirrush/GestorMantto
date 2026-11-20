'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CONTROLLER_FILE = path.resolve(__dirname, '../src/controllers/ins-fl.controller.js');
function fixture({existing = {}, incoming = {}, found = true} = {}) {
  const stored = Object.assign({
    id_ins_fl:91,proyecto:'Punto Norte',id_proyecto:'P14302',referencia_sitio:'Equipo 1',
    id_sup:12,id_asesor:34,id_admin:56,activo:1
  },existing);
  const sqlLog=[];
  const connection={
    async beginTransaction(){},async commit(){},async rollback(){},release(){},
    async query(sql,params=[]){
      sqlLog.push({sql,params});
      if(/SELECT id_ins_fl,/.test(sql))return [found ? [stored] : []];
      if(/UPDATE ins_fl/.test(sql)){
        const part=sql.slice(sql.indexOf('SET')+3,sql.lastIndexOf('WHERE'));
        const items=[...part.matchAll(/\b([a-z_][a-z0-9_]*)\s*=\s*(COALESCE\(\?,\s*[a-z_][a-z0-9_]*\)|\?)/g)];
        assert.ok(items.length>30,'La actualizacion conserva campos de ins_fl');
        assert.equal(items.length+1,params.length);
        items.forEach((m,i)=>{
          const field=m[1],expr=m[2],next=params[i];
          if(expr.startsWith('COALESCE')&&next===null)return;
          stored[field]=next;
        });
        return [{affectedRows:1}];
      }
      if(/INSERT INTO ins_fl/.test(sql)){
        const match=sql.match(/INSERT INTO ins_fl \(([^)]+)\)/);assert.ok(match);
        match[1].split(',').map(x=>x.trim()).forEach((field,i)=>{stored[field]=params[i];});
        return [{insertId:91}];
      }
      return [[]];
    }
  };
  const dependencies={
    '../config/db':{getConnection:async()=>connection},
    '../services/storage/azure-storage.service':{},
    '../shared/logger':{warn(){},error(){},info(){}},
    '../services/notifications/project-photo-notification.service':{}
  };
  const mod={exports:{}};
  const source=fs.readFileSync(CONTROLLER_FILE,'utf8');
  new Function('require','module','exports',source)((name)=>{
    if(!Object.hasOwn(dependencies,name))throw Error('Dependencia no simulada: '+name);
    return dependencies[name];
  },mod,mod.exports);
  const body=Object.assign({proyecto:'Punto Norte',id_proyecto:'P14302',referencia_sitio:'Equipo 1',activo:1},incoming);
  const req={body:{rows:[body]}};
  const res={statusCode:200,payload:null,status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return this;}};
  return {stored,sqlLog,run:async()=>{await mod.exports.syncInsFl(req,res);return res;}};
}
test('no actualiza si se omiten ambos responsables',async()=>{
  const f=fixture(),r=await f.run();
  assert.equal(r.statusCode,200);assert.equal(r.payload.unchanged,1);
  assert.equal(f.sqlLog.filter(q=>/UPDATE ins_fl/.test(q.sql)).length,0);
  assert.equal(f.stored.id_sup,12);assert.equal(f.stored.id_asesor,34);
});
test('preserva los IDs ante blancos al cambiar otra columna',async()=>{
  const f=fixture({incoming:{proyecto:'Punto Norte II',id_sup:'',id_asesor:'  '}}),r=await f.run();
  assert.equal(r.payload.updated,1);assert.equal(f.stored.proyecto,'Punto Norte II');
  assert.equal(f.stored.id_sup,12);assert.equal(f.stored.id_asesor,34);assert.equal(f.stored.id_admin,56);
  const sql=f.sqlLog.find(q=>/UPDATE ins_fl/.test(q.sql)).sql;
  assert.match(sql,/id_sup\s*=\s*COALESCE\(\?,\s*id_sup\)/);
  assert.match(sql,/id_asesor\s*=\s*COALESCE\(\?,\s*id_asesor\)/);
  assert.doesNotMatch(sql,/\bid_admin\s*=/);
});
test('ignora ceros, negativos, marcadores e IDs mal formados',async()=>{
  for(const [a,b] of [[0,'-'],['0','N/A'],[-1,'INVALIDO'],['1.5','ID:99']]){
    const f=fixture({incoming:{proyecto:'Punto Norte II',id_sup:a,id_asesor:b}}),r=await f.run();
    assert.equal(r.payload.updated,1);assert.equal(f.stored.id_sup,12);assert.equal(f.stored.id_asesor,34);
  }
});
test('sustituye responsables solo con IDs positivos validos',async()=>{
  const f=fixture({incoming:{id_sup:'22',id_asesor:44}}),r=await f.run();
  assert.equal(r.payload.updated,1);assert.equal(f.stored.id_sup,22);
  assert.equal(f.stored.id_asesor,44);assert.equal(f.stored.id_admin,56);
});
test('cambia un ID sin borrar el otro',async()=>{
  const f=fixture({incoming:{id_sup:21}}),r=await f.run();
  assert.equal(r.payload.updated,1);assert.equal(f.stored.id_sup,21);assert.equal(f.stored.id_asesor,34);
});
test('conserva el ID restante si el otro ya era NULL',async()=>{
  const f=fixture({existing:{id_sup:null},incoming:{proyecto:'Otro proyecto',id_asesor:null}}),r=await f.run();
  assert.equal(r.payload.updated,1);assert.equal(f.stored.id_sup,null);assert.equal(f.stored.id_asesor,34);
});

test('CLIENTES VIP se recibe y actualiza sin escribir campos tecnicos protegidos',async()=>{
  const f=fixture({existing:{clientes_vip:'NORMAL'},incoming:{clientes_vip:'VIP',id_admin:999,id_script:'IGNORAR'}});
  const r=await f.run();
  assert.equal(r.statusCode,200);assert.equal(r.payload.updated,1);
  assert.equal(f.stored.clientes_vip,'VIP');
  assert.equal(f.stored.id_admin,56);
  assert.equal(Object.hasOwn(f.stored,'id_script'),false);
  const sql=f.sqlLog.find(q=>/UPDATE ins_fl/.test(q.sql)).sql;
  assert.match(sql,/\bclientes_vip\s*=\s*\?/);
  assert.doesNotMatch(sql,/\bid_admin\s*=/);
  assert.doesNotMatch(sql,/\bid_script\s*=/);
});
test('CLIENTES VIP se inserta como texto sin reinterpretar marcadores',async()=>{
  const f=fixture({found:false,incoming:{clientes_vip:'N/A',id_admin:999,id_script:'IGNORAR'}});
  const r=await f.run();
  assert.equal(r.statusCode,200);assert.equal(r.payload.inserted,1);
  assert.equal(f.stored.clientes_vip,'N/A');
  const sql=f.sqlLog.find(q=>/INSERT INTO ins_fl/.test(q.sql)).sql;
  assert.match(sql,/\bclientes_vip\b/);
  assert.doesNotMatch(sql,/\bid_admin\b/);
  assert.doesNotMatch(sql,/\bid_script\b/);
});
