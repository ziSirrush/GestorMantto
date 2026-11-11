'use strict';
// INT9: diagnósticos de FL y conciliación. Aislado: sin Azure ni escrituras Aiven.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function fixture(records) {
  const sql=[];
  const people=[{id_personal:1,nombre:'Ana'}, {id_personal:2,nombre:'José'}];
  const db={query:async(query,values=[])=>{
    sql.push(String(query));
    if(query.includes('FROM instalaciones_personal'))return[people];
    if(query.includes('FROM ins_fl')){
      assert.match(query,/f\.activo=1/);
      assert.match(query,/ORDER BY f\.id_ins_fl ASC/);
      const supervisor=Number(values[0]);
      const last=Number(values.at(-1));
      const limit=Number(/LIMIT (\d+)/.exec(query)?.[1]||150);
      return [records.filter(x=>x.activo===1&&x.id_sup===supervisor&&x.estatus==='06-A'&&x.id_ins_fl>last)
        .sort((a,b)=>a.id_ins_fl-b.id_ins_fl).slice(0,limit)];
    }
    throw Error('Consulta SQL no simulada');
  },execute(){throw Error('No debe escribir');},getConnection(){throw Error('No debe abrir transacciones');}};
  const parse=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?v:null;
  const assignments={_read:{
    scope(req){if(req.informationAccess?.empresa!=='CORELLIAN')throw Error('Acceso inválido');
      return{sql:'f.id_sup=?',params:[req.informationAccess.id_sup]};},
    windowEquipo(_,r){const inicio=parse(r.fecha_inicio_ajuste);
      const fin=parse(r.fecha_fin_ajuste_real)||parse(r.fecha_fin_ajuste_modificado)||parse(r.fecha_fin_ajuste_planeado);
      return {inicio,fin,fuente_fin:fin?'planeado':null,valida:Boolean(inicio&&fin&&fin>=inicio)};}
  }};
  const context={require:name=>name==='../../config/db'?db:assignments,module:{exports:{}}};
  vm.runInNewContext(read('backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.ajustadores.service.js'),context);
  const req=(query={},id_sup=10)=>({query,informationAccess:{empresa:'CORELLIAN',id_sup}});
  return {api:context.module.exports,req,sql};
}
const eq=(id,ajustador,more={})=>({id_ins_fl:id,id_sup:10,activo:1,estatus:'06-A',proyecto:'Prueba',
  referencia_sitio:'Equipo '+id,ajustador,fecha_inicio_ajuste:'2026-11-10',
  fecha_fin_ajuste_real:null,fecha_fin_ajuste_modificado:null,fecha_fin_ajuste_planeado:'2026-11-30',...more});
test('INT9: 06-A sin ajustador y sin fechas muestra todas las causas sin escribir',async()=>{
 const {api,req,sql}=fixture([eq(1,'',{fecha_inicio_ajuste:null,fecha_fin_ajuste_planeado:null})]);
 const data=await api.incidenciasFL(req());
 assert.equal(data.registros.length,1);
 assert.deepEqual(Array.from(data.registros[0].incidencias),
   ['SIN_REFERENCIA','INICIO_FALTANTE','FIN_FALTANTE']);
 assert.ok(sql.every(x=>/^\s*SELECT/.test(x)));
});
test('INT9: referencia sin coincidencia y fechas invertidas se ven juntas',async()=>{
 const {api,req}=fixture([eq(3,'Nombre desconocido',{fecha_fin_ajuste_planeado:'2026-11-01'})]);
 const data=await api.incidenciasFL(req());
 assert.deepEqual(Array.from(data.registros[0].incidencias),['SIN_COINCIDENCIA','FECHAS_INVERTIDAS']);
});
test('INT9: solo equipos activos 06-A dentro del alcance, cursor creciente',async()=>{
 const records=[eq(2,'',{fecha_inicio_ajuste:null}),eq(3,'Ana'),
  eq(4,'',{id_sup:20}),eq(5,'',{estatus:'05-PA'}),eq(6,'',{activo:0}),eq(7,'',{fecha_fin_ajuste_planeado:null})];
 const {api,req}=fixture(records);
 const first=await api.incidenciasFL(req({limit:1}));
 assert.equal(first.registros[0].id_ins_fl,2);
 assert.equal(first.hay_mas,true);
 assert.equal(first.siguiente_cursor,2);
 const second=await api.incidenciasFL(req({limit:1,cursor:2}));
 assert.equal(second.registros[0].id_ins_fl,7);
 assert.ok(second.registros.every(x=>x.id_ins_fl!==4&&x.id_ins_fl!==5&&x.id_ins_fl!==6));
});
test('INT9: barrido progresivo cuenta correcciones FL sin declarar error tecnico',async()=>{
 const code=read('backend/src/jobs/instalacionesProgramacionPersonal.job.js');
 const sql=[];let acquired=0,released=0;
 const db={
   query:async(query,params=[])=>{
     sql.push(String(query));
     if(query.includes('FROM ins_fl f'))
       return [[{id_ins_fl:23,estatus:'06-A'}].filter(r=>r.id_ins_fl>Number(params[0]))];
     if(query.includes('FROM instalaciones_programacion_asignaciones a'))return [[]];
     throw Error('No se permite escribir en control nocturno');
   },
   getConnection:async()=>({
     query:async query=>{
       if(query.includes('GET_LOCK')){acquired++;return [[{acquired:1}]];}
       if(query.includes('RELEASE_LOCK')){released++;return [[{released:1}]];}
       throw Error('SQL inesperado');
     },release(){},destroy(){}
   })
 };
 const ctx={module:{exports:{}},Date,Intl,JSON,Object,Number,String,console,
  setTimeout,setInterval:()=>null,clearInterval:()=>{},
  require:p=>p==='../config/db'?db:{reconciliarEquipo:async()=>({
   estado:'REQUIERE_REVISION',motivo:'SIN_REFERENCIA',
   incidencias:['SIN_REFERENCIA','INICIO_FALTANTE'],creadas:0,actualizadas:0})}};
 vm.runInNewContext(code,ctx);
 const out=await ctx.module.exports.scanEquipos({manual:true});
 assert.equal(out.total_equipos,1);
 assert.equal(out.revisiones,1);
 assert.equal(out.errores,0);
 assert.equal(out.detalles[0].codigos.length,2);
 assert.equal(acquired,released);
 assert.ok(sql.every(x=>!x.includes('instalaciones_programacion_conciliacion_diaria')));
});
