'use strict';
/* Smoke de render HTML en un DOM minimo; no llama red ni escribe a Aiven. */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert=require('node:assert/strict');
const src=fs.readFileSync(path.resolve(__dirname,'../installer/replacements/equipmentRows_cor.txt'),'utf8');
const nodes=Object.fromEntries(['iadm-cor-equipment-list','iadm-cor-project-title','iadm-cor-project-meta','iadm-cor-bulk-bar']
  .map(id=>[id,{innerHTML:'',textContent:'',hidden:false}]));
let paged=false;
const env={
  st:{
    selectedProject:{proyecto:'Proyecto A',id_proyecto:'P150'},
    projectRecordsTotal:2,equipmentOffset:0,
    tableColumns:['id_ins_fl','proyecto','comentarios_fl'],
    records:[
      {id_ins_fl:15,proyecto:'Proyecto A',comentarios_fl:'Inspeccion OK'},
      {id_ins_fl:16,proyecto:'Proyecto A',comentarios_fl:'<script>alert(1)</script>'}
    ]
  },
  $:id=>nodes[id],
  esc:value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  label:f=>({'id_ins_fl':'ID ins_fl',proyecto:'Proyecto',comentarios_fl:'Comentarios FL'}[f]||f),
  display:(_field,val)=>val==null?'--':String(val),
  pager_cor:()=>{paged=true;},
  EQUIPMENTS_PAGE_SIZE_COR:30
};
vm.runInNewContext(src+'\nequipmentRows_cor();',env,{timeout:1000});
const html=nodes['iadm-cor-equipment-list'].innerHTML;
assert.ok(html.includes('<table class="iadm-cor-matrix">'));
assert.equal((html.match(/<th scope="col"/g)||[]).length,3);
assert.equal((html.match(/<tr data-equipment-id=/g)||[]).length,2);
assert.ok(html.includes('Inspeccion OK'));
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(!html.includes('<script>'));
assert.ok(!html.includes('data-record-id'));
assert.ok(!html.includes('data-bulk-record-id'));
assert.ok(!html.includes('data-field-control'));
assert.equal(nodes['iadm-cor-bulk-bar'].hidden,true);
assert.ok(paged);
console.log('PASS - 11 comprobaciones tabla frontend (columnas, XSS, no edicion, paginacion)');
