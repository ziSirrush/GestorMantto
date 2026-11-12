'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.js');
const source=fs.readFileSync(file,'utf8');
const css=fs.readFileSync(path.join(__dirname,'../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.css'),'utf8');
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function renderer(cal,canMutate=false){
 const start=source.indexOf('function contractorName('),end=source.indexOf('function renderCalendar(){',start);
 assert.ok(start>0&&end>start);
 const permitted=code=>canMutate&&['CREAR','DESACTIVAR'].includes(code);
 const body=source.slice(start,end);
 const api=async()=>({}),state={type:'MONTADOR',view:'calendario'};
 const root=()=>({}),window={};
 const testAPI=new Function('cal','esc','permitted','api','state','root','window','reloadCalendar',
   body+'\nreturn {renderContractorCalendar,contractorKey,contractorColor,contractorDrafts,contractorExpanded,openContractorEquipo};');
 return testAPI(cal,esc,permitted,api,state,root,window,async()=>{});
}
test('Contratistas: proyectos y equipos auto relacionados aparecen sin montador',()=>{
 const cal={montajeRelations:[{id_ins_fl:11,id_proyecto:'P1',proyecto:'Proyecto A',equipo:'E1',contratista:'AL CA',iniciales:'AL CA',inicio:'2026-11-10',fin:'2026-11-20'},
   {id_ins_fl:12,id_proyecto:'P1',proyecto:'Proyecto A',equipo:'E2',contratista:'AL CA',iniciales:'AL CA',inicio:'2026-11-10',fin:'2026-11-20'},
   {id_ins_fl:13,id_proyecto:'P2',proyecto:'Proyecto B',equipo:'E3',contratista:'DC GH',iniciales:'DC GH',inicio:'2026-11-10',fin:'2026-11-20'}],
   personal:[],asignaciones:[],montajeError:''};
 const r=renderer(cal),holder={innerHTML:''};
 r.renderContractorCalendar(holder,'');
 assert.equal((holder.innerHTML.match(/class="ppc-contractor" /g)||[]).length,2);
 assert.equal((holder.innerHTML.match(/data-ppc="montaje-detalle"/g)||[]).length,3);
 assert.match(holder.innerHTML,/Proyecto A/);
 assert.match(holder.innerHTML,/E1/);
 assert.match(holder.innerHTML,/DC GH/);
 assert.doesNotMatch(holder.innerHTML,/data-ppc="montaje-guardar"/);
});
test('Contratistas: boton guardar solo si CREAR y DESACTIVAR; no permite escritura por clic de equipo',()=>{
 const cal={montajeRelations:[{id_ins_fl:11,id_proyecto:'P1',proyecto:'Proyecto A',equipo:'E1',contratista:'AL CA',iniciales:'AL CA'}],
  personal:[],asignaciones:[],montajeError:''};
 const readonly={innerHTML:''},editable={innerHTML:''};
 renderer(cal,false).renderContractorCalendar(readonly,'');
 renderer(cal,true).renderContractorCalendar(editable,'');
 assert.doesNotMatch(readonly.innerHTML,/data-ppc="montaje-guardar"/);
 assert.match(editable.innerHTML,/data-ppc="montaje-guardar"/);
 assert.match(editable.innerHTML,/data-ppc="montaje-detalle"/);
});
test('Contratistas: fuera de alcance no expone datos de proyecto ajeno',()=>{
 const cal={montajeRelations:[],personal:[{id_personal:7,nombre:'N',contratista:'AL CA'}],
  asignaciones:[{id_personal:7,id_ins_fl:null,id_proyecto:'SECRETO',proyecto:'PRIVADO',visible:false,valida:true,
    inicio:'2026-11-10',fin:'2026-11-20'}],montajeError:''};
 const holder={innerHTML:''};
 renderer(cal).renderContractorCalendar(holder,'');
 assert.doesNotMatch(holder.innerHTML,/SECRETO|PRIVADO/);
 assert.match(holder.innerHTML,/Ocupación fuera de tu alcance/);
});
test('Detalle por equipo agrupa perfiles, conserva revision y no genera altas automaticas',()=>{
 assert.match(source,/Mecánicos/);
 assert.match(source,/Ayudantes/);
 assert.match(source,/data-ppc="montaje-persona"/);
 assert.match(source,/revision:detail\.revision/);
 assert.match(source,/contratista:contractor\.name/);
 assert.match(source,/ids_personal:\[\.\.\.draft\.selected\]/);
 assert.match(source,/api\('\/montadores\/agrupaciones\/guardar','POST'/);
 assert.match(source,/api\(`\/montadores\/equipo\/\$\{id\}\/detalle`\)/);
 assert.match(css,/ppc-contractor-equipo/);
});
test('Ajustadores: barras azules mantienen acceso a detalle de solo lectura',()=>{
 assert.match(source,/item\.origen==='AUTOMATICA_FL'\?'ppc-cal-bar-auto'/);
 assert.match(source,/function openReadOnlyAssignment\(id,fromContractor=false\)/);
 assert.match(source,/assignment\.mode='view'/);
 assert.match(source,/configureAssignmentReadOnly\(true\)/);
 assert.match(source,/data-ppc="ver-asignacion"/);
});
test('Contratistas permanece dentro de Calendario, separado de personal',()=>{
 assert.match(source,/class="ppc-contractor-calendar"/);
 assert.match(source,/class="ppc-contractor-title">CONTRATISTAS<\/h2>/);
 assert.match(source,/if\(state\.type==='MONTADOR'\)renderContractorCalendar\(el\('ppc-contractor-content'\),dayCells\)/);
 assert.match(css,/\.ppc-contractor-calendar/);
});
