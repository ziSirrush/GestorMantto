'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const MODULE=path.join(__dirname,'../backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.conciliacion.service.js');
function scenario(){
  let sequence=2;
  const state={
    equipment:{id_ins_fl:21,estatus:'06-A',activo:1,ajustador:'Ana',
      fecha_inicio_ajuste:'2026-11-12',fecha_fin_ajuste_real:'2026-11-15',
      fecha_fin_ajuste_modificado:null,fecha_fin_ajuste_planeado:'2026-11-15'},
    people:[{id_personal:5,nombre:'Ana',activo:1}],
    assignments:[{id_asignacion:1,id_personal:5,id_ins_fl:21,origen:'MANUAL',
      es_historico:0,activo:1,fecha_desde:'2026-11-13',fecha_hasta:'2026-11-14'}]
  };
  const clone=x=>JSON.parse(JSON.stringify(x));
  const openHandle=working=>({
    async query(sql,params=[]){
      if(sql.includes('FROM ins_fl f'))return [[clone(state.equipment)]];
      if(sql.includes('FROM instalaciones_personal')&&!sql.includes('JOIN instalaciones_personal'))
        return [clone(state.people)];
      if(sql.includes('FROM instalaciones_programacion_asignaciones'))
        return [clone((working||state.assignments).filter(a=>a.id_ins_fl===params[0]&&a.activo===1))];
      throw Error('Consulta no reconocida: '+sql.slice(0,100));
    },
    async execute(sql,params=[]){
      const rows=working||state.assignments;
      if(sql.includes('INSERT INTO instalaciones_programacion_asignaciones')){
        const [person,team,from,to,notes]=params;
        rows.push({id_asignacion:sequence++,id_personal:person,id_ins_fl:team,
          origen:'AUTOMATICA_FL',es_historico:0,activo:1,
          fecha_desde:from,fecha_hasta:to,notas:notes});
        return [{affectedRows:1,insertId:sequence-1}];
      }
      if(sql.includes('UPDATE instalaciones_programacion_asignaciones')){
        if(sql.includes('es_historico=0')){
          const [from,to,,id]=params;
          Object.assign(rows.find(a=>a.id_asignacion===id),
            {fecha_desde:from,fecha_hasta:to,es_historico:0});
        }else if(sql.includes('es_historico=1')){
          const [from,to,,id]=params;
          const target=rows.find(a=>a.id_asignacion===id);
          Object.assign(target,{fecha_desde:target.fecha_desde||from,
            fecha_hasta:target.fecha_hasta||to,es_historico:1});
        }else throw Error('UPDATE desconocido');
        return [{affectedRows:1}];
      }
      throw Error('Escritura no reconocida');
    },
    async beginTransaction(){},
    async commit(){if(working)state.assignments=working;},
    async rollback(){},
    release(){}
  });
  const db={...openHandle(),async getConnection(){return openHandle(clone(state.assignments));}};
  const plan=row=>({inicio:row.fecha_inicio_ajuste,
    fin:row.fecha_fin_ajuste_real||row.fecha_fin_ajuste_modificado||row.fecha_fin_ajuste_planeado,
    valida:true});
  const adjuster={
    _shared:{
      NOTA_AUTO:'auto',MAX_AJUSTADORES_CATALOGO:5000,
      fallo:(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code}),
      indicePersonal:rows=>new Map(rows.map(row=>[row.nombre.toLowerCase(),row])),
      presentarEquipo:(row,index)=>({
        estado:index.has(String(row.ajustador).toLowerCase())?'VINCULABLE':'SIN_REFERENCIA',
        personas:index.has(String(row.ajustador).toLowerCase())?[index.get(row.ajustador.toLowerCase())]:[],
        ...plan(row)
      })
    }
  };
  const assignments={_read:{
    parseDate:value=>typeof value==='string'?value:null,
    windowEquipo:(_type,row)=>plan(row),
    windowAsignacion:(_type,row,a)=>({inicio:a.fecha_desde||plan(row).inicio,
      fin:a.fecha_hasta||plan(row).fin,valida:true}),
    intersect:(a,b,c,d)=>a<=d&&b>=c
  }};
  const source=fs.readFileSync(MODULE,'utf8');
  const holder={exports:{}};
  new Function('require','module','exports',source)(name=>
    name.includes('config/db')?db:
    name.includes('.asignaciones.service')?assignments:
    name.includes('.ajustadores.service')?adjuster:
    (()=>{throw Error('Dependencia inesperada: '+name)})(),holder,holder.exports);
  return {state,reconcile:holder.exports.reconciliarEquipo};
}
test('INT9: solo 06-A crea barra azul; se permite traslape con naranja',async()=>{
  const {state,reconcile}=scenario();
  const first=await reconcile(21,{tecnico:true});
  assert.equal(first.creadas,1);
  assert.equal(first.conflictos[0].motivo,'TRASLAPE_PROYECCION_MANUAL');
  assert.equal(state.assignments.filter(a=>a.origen==='AUTOMATICA_FL').length,1);
  assert.equal(state.assignments[0].origen,'MANUAL');
  assert.equal(state.assignments[0].fecha_hasta,'2026-11-14');
});
test('INT9: actualiza fechas de la misma barra sin duplicarla',async()=>{
  const {state,reconcile}=scenario();
  await reconcile(21,{tecnico:true});
  const twice=await reconcile(21,{tecnico:true});
  assert.equal(twice.estado,'SIN_CAMBIOS');
  state.equipment.fecha_fin_ajuste_real='2026-11-17';
  const changed=await reconcile(21,{tecnico:true});
  assert.equal(changed.actualizadas,1);
  assert.equal(state.assignments.filter(a=>a.origen==='AUTOMATICA_FL').length,1);
  assert.equal(state.assignments[0].fecha_hasta,'2026-11-14');
});
test('INT9: sale de 06-A, conserva azul como historico inmutable',async()=>{
  const {state,reconcile}=scenario();
  await reconcile(21,{tecnico:true});
  state.equipment.estatus='05-PA';
  const changed=await reconcile(21,{tecnico:true});
  assert.equal(changed.historicas,1);
  const old=state.assignments.find(a=>a.origen==='AUTOMATICA_FL');
  assert.equal(old.activo,1);
  assert.equal(old.es_historico,1);
  state.equipment.fecha_fin_ajuste_real='2026-12-19';
  await reconcile(21,{tecnico:true});
  assert.equal(state.assignments.find(a=>a.origen==='AUTOMATICA_FL').fecha_hasta,'2026-11-15');
});
