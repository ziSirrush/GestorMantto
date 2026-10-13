'use strict';
/* Validacion de transformaciones unitarias, sin manipular repo o BD. */
const test=require('node:test');
const assert=require('node:assert/strict');
const inst=require('../installer/aplicar-fase2');

test('Transformer aplica solo una version concreta y bloquea reaplicacion',()=>{
  const phase1=`\nconst VERSION_COR='20261012-admin-tabla-fase1-v001';\n`+
  `  // No es un motor de permisos: solo invalida datos ya renderizados cuando\n`+
  `st.bulkSelected.clear();st.bulkSnapshots.clear();st.bulkTouched.clear();st.bulkConflict=false;\n    invalidateAutoSave_cor();st.listStale=false;\n`+
  `  function equipmentRows_cor(){return 'tabla';}\n  async function loadFilterOptions_cor(){\n`+
  `    clearBulkSelection_cor();\n    st.selectedProject=project;\n`+
  `  function hasUnsaved(){\n    if(st.page==='multiple')\n`+
  `    const recordId=st.selectedRecord?.id_ins_fl||options.recordId;\n    invalidateAutoSave_cor();\n`+
  `  function backToProjects_cor(){\n    clearBulkSelection_cor();\n`+
  `    if(st.bound)return;st.bound=true;\n    $('iadm-cor-search-form')\n`+
  `if(pager&&!pager.disabled&&confirmLeave()){\n`+
  `      st.records=[];st.tableColumns=[];st.projectRecordsTotal=0;equipmentRows_cor();status(e.message,'error');\n`+
  `    if(d.route!=='instalaciones-administracion')return;\n    ensureContext_cor();\n`;
  const next=inst.transformModule(phase1);
  assert.match(next,/ghost\.render\(\)/);
  assert.match(next,/ghost\.clear\(\)/);
  assert.match(next,/ghost\.bind\(view\(\)\)/);
  assert.match(next,/ghost\.hasPending\(\)/);
  assert.match(next,/ghost\.changeEquipmentPage\(\)/);
  assert.match(next,/20261013-admin-ghost-fase2-v001/);
  assert.doesNotMatch(next,/method:'PATCH'|method:"PATCH"|method:'POST'/);
  assert.throws(()=>inst.transformModule(next),/Ancla ausente|Ancla ausente o ambigua/);
});

test('Anclas de cache-bust del module loader y del index',()=>{
  const old="'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css?v=20261012-fase1-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261012-fase1-v001']},";
  const current=inst.transformLoader(old);
  assert.match(current,/instalaciones-administracion-ghost_cor\.css/);
  assert.match(current,/instalaciones-administracion-ghost_cor\.js/);
  assert.match(current,/20261013-fase2-v001/);
  assert.ok(current.indexOf('instalaciones-administracion-ghost_cor.js')<current.indexOf('instalaciones-administracion_cor.js'));
  assert.throws(()=>inst.transformLoader(current),/Ancla ausente/);
  const oldIndex='<script src="./core/module-loader.js?v=20261012-instalaciones-administracion-tabla-fase1-v001"></script>';
  const next=inst.transformIndex(oldIndex);
  assert.match(next,/20261013-instalaciones-administracion-ghost-fase2-v001/);
  assert.throws(()=>inst.transformIndex(next),/Ancla ausente/);
});
