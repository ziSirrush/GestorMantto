'use strict';
// Pruebas V2 aisladas. Se ejecuta el servicio REAL con Aiven sustituido por
// transacciones en memoria, sin secretos, red ni conexiones productivas.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../../backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.conciliacion.service.js'),'utf8');
function createFixture(options={}){
  let sequence=100;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const state={
    equipment:{id_ins_fl:21,estatus:'06-A',activo:1,ajustador:'Ana',
      fecha_inicio_ajuste:'2026-11-12',fecha_fin_ajuste_real:null,
      fecha_fin_ajuste_modificado:null,fecha_fin_ajuste_planeado:'2026-11-15',
      id_sup:10,...options.equipment},
    people:options.people||[{id_personal:5,nombre:'Ana',activo:1,tipo_personal:'AJUSTADOR'}],
    assignments:copy(options.assignments||[]),
    commits:0,rollbacks:0,queries:[],writes:[],failWrite:options.failWrite||false,
    onLock:null
  };
  const plan=row=>{
    const begin=row.fecha_inicio_ajuste;
    const finish=row.fecha_fin_ajuste_real||row.fecha_fin_ajuste_modificado||row.fecha_fin_ajuste_planeado;
    const valid=typeof begin==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(begin)&&
      typeof finish==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(finish)&&begin<=finish;
    return {inicio:valid?begin:null,fin:valid?finish:null,valida:valid};
  };
  const errors=(code,status=409)=>Object.assign(new Error(code),{statusCode:status,code});
  const handle=working=>{
    let active=false,workingRows=working;
    return {
      async query(sql,params=[]){
        state.queries.push({sql,params});
        if(sql.includes('FROM ins_fl f')){
          const allowed=!sql.includes('f.id_sup=?')||state.equipment.id_sup===params[1];
          if(sql.includes('FOR UPDATE'))state.onLock?.();
          return [allowed?[copy(state.equipment)]:[]];
        }
        if(sql.includes('FROM instalaciones_personal')){
          const selected=sql.includes('IN (')?state.people.filter(p=>params.includes(p.id_personal)):state.people;
          const activeOnly=sql.includes('WHERE activo=1')||sql.includes('WHERE p.activo=1');
          return [copy(selected.filter(p=>p.tipo_personal==='AJUSTADOR'&&(!activeOnly||p.activo===1)))];
        }
        if(sql.includes('FROM instalaciones_programacion_asignaciones')){
          return [copy((workingRows||state.assignments).filter(a=>a.id_ins_fl===params[0]&&a.activo===1))];
        }
        throw Error('SQL no simulado: '+sql);
      },
      async execute(sql,params=[]){
        if(!active)throw Error('Escritura fuera de transaccion');
        state.writes.push({sql,params});
        if(state.failWrite)throw errors('ER_DUP_ENTRY');
        if(sql.includes('INSERT INTO instalaciones_programacion_asignaciones')){
          const [pid,id,from,to,notes]=params;
          if(workingRows.some(a=>a.activo===1&&a.id_personal===pid&&a.id_ins_fl===id&&a.origen==='AUTOMATICA_FL'))
            throw errors('ER_DUP_ENTRY');
          workingRows.push({id_asignacion:++sequence,id_personal:pid,id_ins_fl:id,
            origen:'AUTOMATICA_FL',es_historico:0,activo:1,fecha_desde:from,fecha_hasta:to,notas:notes});
          return [{affectedRows:1,insertId:sequence}];
        }
        if(sql.includes('UPDATE instalaciones_programacion_asignaciones')){
          if(sql.includes('es_historico=0')){
            const [from,to,,id]=params;
            const row=workingRows.find(a=>a.id_asignacion===id);
            Object.assign(row,{fecha_desde:from,fecha_hasta:to,es_historico:0});
          }else if(sql.includes('es_historico=1')){
            const [from,to,,id]=params;
            const row=workingRows.find(a=>a.id_asignacion===id);
            Object.assign(row,{fecha_desde:row.fecha_desde??from,fecha_hasta:row.fecha_hasta??to,es_historico:1});
          }else throw Error('UPDATE no permitido: '+sql);
          return [{affectedRows:1}];
        }
        throw Error('Escritura no simulada: '+sql);
      },
      async beginTransaction(){active=true;},
      async commit(){state.assignments=copy(workingRows);active=false;state.commits++;},
      async rollback(){active=false;state.rollbacks++;},
      release(){}
    };
  };
  const db={...handle(),async getConnection(){return handle(copy(state.assignments));}};
  const scope={_read:{
    parseDate:v=>v instanceof Date?v.toISOString().slice(0,10):typeof v==='string'?v:null,
    windowEquipo:(_type,row)=>plan(row),
    windowAsignacion:(_type,row,a)=>{
      const start=a.fecha_desde||plan(row).inicio,finish=a.fecha_hasta||plan(row).fin;
      return {inicio:start,fin:finish,valida:Boolean(start&&finish&&start<=finish)};
    },
    intersect:(a,b,c,d)=>a<=d&&b>=c
  }};
  const resolver=(raw,index)=>{
    const text=String(raw||'').trim();
    if(!text)return {estado:'SIN_REFERENCIA',personas:[]};
    const labels=text.split('/').map(x=>x.trim().toLowerCase());
    const out=[];
    if(labels.length>5||new Set(labels).size!==labels.length)return {estado:'AMBIGUO',personas:[]};
    for(const name of labels){
      const people=index.get(name)||[];
      if(people.length!==1)return {estado:people.length?'AMBIGUO':'SIN_COINCIDENCIA',personas:[]};
      out.push(people[0]);
    }
    return {estado:'IDENTIFICADO',personas:out};
  };
  const refs={_shared:{
    NOTA_AUTO:'[BLT_NOW_INT9_AJUSTADOR_AUTO_V1] Origen: ins_fl.ajustador; fechas heredadas de ins_fl.',
    MAX_AJUSTADORES_CATALOGO:5000,
    fallo:(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code}),
    indicePersonal:people=>{
      const idx=new Map();for(const person of people){
        const name=String(person.nombre).trim().toLowerCase();
        idx.set(name,[...(idx.get(name)||[]),person]);
      }return idx;
    },
    presentarEquipo:(row,index)=>{
      const ref=resolver(row.ajustador,index);
      const w=plan(row);
      return {estado:ref.estado==='IDENTIFICADO'?(w.valida?'VINCULABLE':'SIN_FECHAS_VALIDAS'):ref.estado,
        personas:ref.personas,...w};
    }
  }};
  const mod={exports:{}};
  new Function('require','module','exports',source)(request=>
    request==='../../config/db'?db:
    request.endsWith('.asignaciones.service')?scope:
    request.endsWith('.ajustadores.service')?refs:
    (()=>{throw Error('Dependencia inesperada '+request)})(),mod,mod.exports);
  return {state,api:mod.exports,errors};
}
function byOrigin(state,origin){return state.assignments.filter(x=>x.origen===origin);}
module.exports={createFixture,byOrigin,assert};
