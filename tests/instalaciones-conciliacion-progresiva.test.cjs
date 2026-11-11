'use strict';
// QA INT9: sin DB de produccion, simula lecturas, locks y presion Aiven.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const jobSrc=fs.readFileSync(path.resolve(__dirname,'../backend/src/jobs/instalacionesProgramacionPersonal.job.js'),'utf8');
function fixture({equipment=[],autos=[],fetchPressure=0,acquirePressure=0}={}){
  const events={queries:[],visited:[],peak:0,active:0,opened:0,released:0,waits:[],progress:[]};
  let remainFetch=fetchPressure,remainAcquire=acquirePressure,lockHeld=false;
  const db={
    async query(sql,values=[]){
      events.queries.push(sql);
      if(sql.includes('FROM ins_fl f')){
        if(remainFetch-->0)throw Object.assign(new Error('read ETIMEDOUT'),{code:'ETIMEDOUT'});
        return [equipment.filter(row=>row.id_ins_fl>values[0]).slice(0,values[1])];
      }
      if(sql.includes('FROM instalaciones_programacion_asignaciones a')){
        const unique=new Map(autos.map(row=>[row.id_ins_fl,row]));
        return [[...unique.values()].sort((a,b)=>a.id_ins_fl-b.id_ins_fl)
          .filter(row=>row.id_ins_fl>values[0]).slice(0,values[1])];
      }
      throw Error('SQL no esperado: '+sql);
    },
    async getConnection(){
      if(remainAcquire-->0)throw Object.assign(new Error('Queue limit reached.'),{code:'DB_POOL_QUEUE_FULL'});
      events.active++;events.peak=Math.max(events.peak,events.active);events.opened++;
      return{
        async query(sql){
          events.queries.push(sql);
          if(sql.includes('GET_LOCK')){
            assert.equal(lockHeld,false,'No debe ocupar dos bloques simultaneos.');
            lockHeld=true;return [[{acquired:1}]];
          }
          if(sql.includes('RELEASE_LOCK')){
            assert.equal(lockHeld,true);lockHeld=false;return [[{released:1}]];
          }
          throw Error('SQL conexion inesperado');
        },
        release(){events.active--;events.released++;},
        destroy(){events.active--;events.released++;}
      };
    }
  };
  const holder={exports:{}};
  vm.runInNewContext(jobSrc,{
    require:name=>name==='../config/db'?db:name.includes('conciliacion.service')?
      {reconciliarEquipo:async(id,options)=>{
        assert.ok(options.conexionCompartida,'El bloque requiere conexion compartida.');
        events.visited.push(id);
        return {estado:'SIN_CAMBIOS',conflictos:[]};
      }}:(()=>{throw Error('Modulo inesperado '+name)})(),
    module:holder,Date,Intl,Object,Number,String,JSON,
    console:{info(){},error(){}},
    setTimeout:(fn,ms)=>{events.waits.push(ms);fn();return 1;},
    setInterval:()=>null,clearInterval:()=>{}
  });
  return{api:holder.exports,events};
}
const row=(id,estatus)=>({id_ins_fl:id,estatus});
test('INT9 por capas: 5 equipos por bloque, 1 conexion, cursor sin duplicados y trim compatible',async()=>{
  const equipment=[row(1,'06-A'),row(2,'06-A'),row(3,'06-A'),
    row(4,'05-P'),row(5,'06-A'),row(6,' 06-A '),row(7,'06-A'),
    row(8,'06-A'),row(9,'05-P'),row(10,'06-A')];
  const fixture1=fixture({equipment,autos:[row(4,'05-P'),row(2,'06-A'),row(9,'05-P')]});
  const result=await fixture1.api.scanEquipos({manual:true,
    onProgress:p=>fixture1.events.progress.push(p.fase)});
  assert.deepEqual(fixture1.events.visited,[1,2,3,5,6,7,8,10,4,9]);
  assert.equal(result.total_equipos,10);
  assert.equal(result.lotes_completados,3);
  assert.equal(fixture1.events.peak,1);
  assert.equal(fixture1.events.active,0);
  assert.equal(fixture1.events.opened,fixture1.events.released);
  assert.equal(result.fase,'FINALIZADA');
  assert.ok(fixture1.events.queries.every(sql=>!sql.includes('OR EXISTS')));
  assert.ok(fixture1.events.waits.includes(300));
});
test('INT9: presion de pool y timeout se reintentan sin avanzar cursor',async()=>{
  const x=fixture({equipment:[row(7,'06-A')],fetchPressure:1,acquirePressure:1});
  const out=await x.api.scanEquipos({manual:true});
  assert.equal(out.total_equipos,1);
  assert.equal(out.errores,0);
  assert.equal(out.reintentos,2);
  assert.deepEqual(x.events.visited,[7]);
  assert.equal(x.events.opened,x.events.released);
  assert.ok(x.events.waits.includes(2000));
});
test('INT9: saturacion persistente detiene y no marca como completado',async()=>{
  const x=fixture({equipment:[row(7,'06-A')],acquirePressure:8});
  await assert.rejects(()=>x.api.scanEquipos({manual:true}),err=>err.code==='INT9_PRESION_DB');
  assert.deepEqual(x.events.visited,[]);
});
test('INT9: una nueva ejecucion local simultanea falla cerrado',async()=>{
  const x=fixture({equipment:[row(7,'06-A')]});
  let second;
  const first=x.api.scanEquipos({manual:true,onProgress:()=>{
    if(!second)second=x.api.scanEquipos({manual:true}).then(()=>null,error=>error);
  }});
  await first;
  assert.equal((await second).code,'INT9_CONCILIACION_OCUPADA');
});
