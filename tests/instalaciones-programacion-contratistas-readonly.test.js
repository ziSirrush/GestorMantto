'use strict';
// INT9 04-M | Contratistas: mismo calendario Gantt que Ajustadores,
// con detalle de proyecto/equipo y guardado independiente de personal manual.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,
  '../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,
  '../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.css'),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,x=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[x]));
function factory(cal,canMutate=false){
  const start=source.indexOf('function contractorName(');
  const end=source.indexOf('function renderCalendar(){',start);
  assert.ok(start>0&&end>start);
  const permitted=code=>canMutate&&['CREAR','DESACTIVAR'].includes(code);
  const span=Number(cal.span)||14;
  const dateNum=s=>Date.parse(s+'T00:00:00Z')/86400000;
  const offsetDate=(s,n)=>new Date((dateNum(s)+n)*86400000).toISOString().slice(0,10);
  const lanePositions=items=>{
    const laneEnds=[],rows=[];
    for(const item of items){
      const from=Math.max(0,dateNum(item.inicio)-dateNum(cal.desde));
      const through=Math.min(span-1,dateNum(item.fin)-dateNum(cal.desde));
      let lane=laneEnds.findIndex(end=>end<from);
      if(lane<0){lane=laneEnds.length;laneEnds.push(-1);}
      laneEnds[lane]=through;rows.push({item,from,through,lane});
    }
    return {rows,lanes:Math.max(1,laneEnds.length)};
  };
  const model={exports:{}},body=source.slice(start,end);
  const fn=new Function('cal','esc','permitted','api','state','root','window',
    'reloadCalendar','lanePositions','offsetDate','dateNum','DAY_NAMES','CELL_WIDTH','formatWindow','canRead','el',
    body+'\nreturn {renderContractorCalendar,contractorDrafts,contractorExpanded,openContractorEquipo,contractorKey,contractorColor};');
  return fn(cal,esc,permitted,async()=>({}),{type:'MONTADOR',view:'calendario'},
    ()=>({}),{},async()=>{},lanePositions,offsetDate,dateNum,
    ['D','L','M','M','J','V','S'],30,()=> 'Fechas programadas',()=>true,()=>null);
}
function data(){
  return {desde:'2026-11-09',span:31,hoy:'2026-11-12',personal:[],asignaciones:[],
    montajeError:'',montajeRelations:[
      {id_ins_fl:11,id_proyecto:'P1',proyecto:'Plaza Norte',equipo:'Elevador A',
        contratista:'AL CA',iniciales:'AL CA',inicio:'2026-11-10',fin:'2026-11-20'},
      {id_ins_fl:12,id_proyecto:'P1',proyecto:'Plaza Norte',equipo:'Elevador B',
        contratista:'AL CA',iniciales:'AL CA',inicio:'2026-11-12',fin:'2026-11-18'},
      {id_ins_fl:13,id_proyecto:'P2',proyecto:'Hotel Centro',equipo:'Elevador C',
        contratista:'DC GH',iniciales:'DC GH',inicio:'2026-11-10',fin:'2026-11-20'}
    ]};
}
test('04-M usa un Gantt con columna CONTRATISTA y franjas por Proyecto — Equipo',()=>{
  const c=data(),r=factory(c),holder={innerHTML:''};
  r.renderContractorCalendar(holder,'<span>09</span>');
  assert.match(holder.innerHTML,/ppc-cal-row ppc-cal-header/);
  assert.match(holder.innerHTML,/ppc-cal-days/);
  assert.match(holder.innerHTML,/<b>CONTRATISTA<\/b>/);
  assert.equal((holder.innerHTML.match(/class="ppc-cal-row ppc-contractor-row"/g)||[]).length,2);
  assert.equal((holder.innerHTML.match(/data-ppc="montaje-detalle"/g)||[]).length,3);
  assert.match(holder.innerHTML,/Plaza Norte — Elevador A/);
  assert.match(holder.innerHTML,/Plaza Norte — Elevador B/);
  assert.match(holder.innerHTML,/Hotel Centro — Elevador C/);
  assert.doesNotMatch(holder.innerHTML,/ppc-contractor-projects|ppc-contractor-equipo-toggle/);
});
test('04-M coloca barras simultaneas en carriles distintos en una misma fila',()=>{
  const c=data(),holder={innerHTML:''};
  factory(c).renderContractorCalendar(holder,'');
  const section=holder.innerHTML.slice(holder.innerHTML.indexOf('AL CA'),holder.innerHTML.indexOf('DC GH'));
  assert.match(section,/top:7px/);
  assert.match(section,/top:35px/);
  assert.match(section,/left:31px/);
});
test('04-M: lectura y permisos de guardar no alteran vista ni datos automaticos',()=>{
  const c=data(),read={innerHTML:''},edit={innerHTML:''};
  factory(c,false).renderContractorCalendar(read,'');
  factory(c,true).renderContractorCalendar(edit,'');
  assert.doesNotMatch(read.innerHTML,/data-ppc="montaje-guardar"/);
  assert.equal((edit.innerHTML.match(/data-ppc="montaje-guardar"/g)||[]).length,2);
  assert.match(edit.innerHTML,/Guardar agrupación/);
  assert.match(source,/ids_personal:\[\.\.\.draft\.selected\]/);
  assert.match(source,/api\('\/montadores\/agrupaciones\/guardar','POST'/);
});
test('04-M: los equipos ocultos por alcance no se mezclan con barra de contratista',()=>{
  const c=data();
  c.personal=[{id_personal:20,nombre:'Persona',contratista:'AL CA'}];
  c.asignaciones=[{id_personal:20,visible:false,id_proyecto:'SECRETO',
    proyecto:'PROYECTO_PRIVADO',equipo:'OCULTO',valida:true,inicio:'2026-11-10',fin:'2026-11-20'}];
  const holder={innerHTML:''};
  factory(c).renderContractorCalendar(holder,'');
  assert.doesNotMatch(holder.innerHTML,/PROYECTO_PRIVADO|SECRETO|OCULTO/);
});
test('04-M: al hacer clic en la barra se abre el detalle de mecánicos y ayudantes',()=>{
  assert.match(source,/data-ppc="montaje-detalle"/);
  assert.match(source,/api\(`\/montadores\/equipo\/\$\{id\}\/detalle`\)/);
  assert.match(source,/renderRole\('Mecánicos','Mecánico'\)/);
  assert.match(source,/renderRole\('Ayudantes','Ayudante'\)/);
  assert.match(source,/data-ppc="montaje-persona"/);
  assert.match(css,/\.ppc-contractor-editor/);
});
test('06-A conserva las filas individuales PERSONAL y barras de Ajustadores',()=>{
  assert.match(source,/if\(state\.type==='MONTADOR'\)\{/);
  assert.match(source,/Vista original de Ajustadores 06-A/);
  assert.match(source,/class="ppc-cal-row ppc-cal-header"/);
  assert.match(source,/<b>PERSONAL<\/b><small>Ocupación por día<\/small>/);
  assert.match(source,/item\.origen==='AUTOMATICA_FL'\?'ppc-cal-bar-auto'/);
  assert.match(source,/function openReadOnlyAssignment\(id,fromContractor=false\)/);
  assert.match(source,/configureAssignmentReadOnly\(true\)/);
});

test('04-M: el detalle de equipo aparece en una ventana flotante con desplazamiento local',()=>{
 assert.match(source,/id="ppc-contractor-modal" class="ppc-overlay ppc-contractor-modal"/);
 assert.match(source,/role="dialog"/);
 assert.match(source,/aria-modal="true"/);
 assert.match(source,/class="ppc-contractor-modal-body"/);
 assert.match(source,/data-ppc="montaje-cerrar"/);
 assert.match(css,/\.ppc-contractor-modal-dialog/);
 assert.match(css,/overflow-y:auto/);
 assert.match(source,/function closeContractorDetail\(\)/);
 assert.match(source,/const modalScroll=holder\.querySelector/);
});
test('04-M: un solo modal activo, conserva borradores, Escape cierra y vuelve a barra',()=>{
 assert.match(source,/contractorExpanded\.clear\(\);\s*contractorExpanded\.add\(id\)/);
 assert.match(source,/if\(ev\.key==='Escape'&&contractorExpanded\.size\)/);
 assert.match(source,/contractorDrafts\.set\(id,/);
 assert.match(source,/focusContractorDetail\(\)/);
 assert.match(source,/data-ppc="montaje-fondo"/);
});
