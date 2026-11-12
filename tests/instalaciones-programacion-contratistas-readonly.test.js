'use strict';
// BLT NOW: QA aislado del calendario Contratistas y detalles de solo lectura.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.js');
const css=fs.readFileSync(path.join(__dirname,'../modules/instalaciones-programacion-personal/instalaciones-programacion-personal.css'),'utf8');
const source=fs.readFileSync(file,'utf8');

function renderer(cal) {
  const start=source.indexOf('function contractorName(');
  const stop=source.indexOf('function renderCalendar(){',start);
  assert.ok(start>0&&stop>start,'Faltan funciones de Contratistas');
  const esc=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const lanePositions=items=>({rows:items.map((item,i)=>({item,from:0,through:2,lane:i})),lanes:Math.max(1,items.length)});
  const factory=new Function('cal','esc','CELL_WIDTH','lanePositions','formatWindow',
    source.slice(start,stop)+'\nreturn {contractorKey,contractorColor,renderContractorCalendar};');
  return factory(cal,esc,30,lanePositions,()=> '12 nov – 14 nov (3 días)');
}

test('Contratistas: colores estables y agrupación por proyecto',()=>{
  const cal={desde:'2026-11-12',span:14,personal:[
    {id_personal:1,nombre:'A',contratista:'Contrato Uno'},
    {id_personal:2,nombre:'B',contratista:'Contrato Uno'},
    {id_personal:3,nombre:'C',contratista:'Contrato Dos'}
  ],asignaciones:[
    {id_asignacion:10,id_personal:1,id_proyecto:'P1',proyecto:'Plaza Central',equipo:'E1',inicio:'2026-11-12',fin:'2026-11-14',valida:true,visible:true,origen:'AUTOMATICA_FL'},
    {id_asignacion:11,id_personal:2,id_proyecto:'P1',proyecto:'Plaza Central',equipo:'E2',inicio:'2026-11-12',fin:'2026-11-14',valida:true,visible:true,origen:'MANUAL'},
    {id_asignacion:12,id_personal:3,id_proyecto:'P2',proyecto:'Obra Sur',equipo:'E3',inicio:'2026-11-12',fin:'2026-11-14',valida:true,visible:true,origen:'AUTOMATICA_FL'}
  ]};
  const r=renderer(cal),holder={innerHTML:''};
  r.renderContractorCalendar(holder,'<span>12</span>');
  assert.equal((holder.innerHTML.match(/class="ppc-contractor" /g)||[]).length,2);
  assert.equal((holder.innerHTML.match(/<b>Plaza Central<\/b>/g)||[]).length,1);
  assert.equal((holder.innerHTML.match(/data-ppc="ver-asignacion"/g)||[]).length,3);
  assert.doesNotMatch(holder.innerHTML,/data-ppc="(?:editar|asignar|quitar)/);
  assert.equal(r.contractorColor(r.contractorKey(' Contrato Uno ')),r.contractorColor(r.contractorKey('contrato uno')));
  assert.match(css,/ppc-contractor-bar/);
});

test('Contratistas: fuera de alcance no expone el nombre del proyecto',()=>{
  const cal={desde:'2026-11-12',span:14,personal:[{id_personal:1,nombre:'A',contratista:'Contrato Uno'}],
    asignaciones:[{id_personal:1,id_asignacion:null,id_proyecto:'PRIVADO',proyecto:'PROYECTO_SECRETO',inicio:'2026-11-12',fin:'2026-11-14',valida:true,visible:false}]};
  const holder={innerHTML:''};
  renderer(cal).renderContractorCalendar(holder,'<span>12</span>');
  assert.doesNotMatch(holder.innerHTML,/PROYECTO_SECRETO|PRIVADO|data-ppc="ver-asignacion"/);
  assert.match(holder.innerHTML,/Ocupación fuera de tu alcance/);
});

test('Ajustadores: barras azules abren detalle sin escrituras',()=>{
  assert.match(source,/item\.origen==='AUTOMATICA_FL'\?'ppc-cal-bar-auto'/);
  assert.match(source,/canView\?'data-ppc="ver-asignacion"'/);
  assert.match(source,/function openReadOnlyAssignment\(id\)/);
  assert.match(source,/assignment\.mode='view'/);
  assert.match(source,/configureAssignmentReadOnly\(true\)/);
  assert.match(source,/assignment\.mode==='view'\|\|state\.view!=='calendario'/);
  assert.match(source,/state\.view==='contratistas'&&state\.type!=='MONTADOR'/);
});
