'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

test('Equipos vuelve a partir de ins_fl y muestra una fila por equipo',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/state\.equipos=mergeEquipos_cor\(Array\.isArray\(selection&&selection\.equipos\)/);
  assert.match(frontend,/id="ccor-ec-form-equipment-body"/);
  assert.match(frontend,/state\.equipos\.map\(\(row,index\)=>/);
  assert.match(frontend,/Ref en sitio \/ identificador/);
  assert.match(frontend,/id_ins_fl:/);
  assert.doesNotMatch(frontend,/id="ccor-ec-form-equipment-ids"/);
});

test('PHNS se toma solo de log_ops.ph_ns y se normaliza a Pxxxxx',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/function normalizedLogOpsPhns_cor/);
  assert.match(frontend,/splitLogOpsPhns_cor\(row&&row\.ph_ns\)/);
  assert.match(frontend,/\^P\\d\+\$/);
  assert.match(frontend,/data-equipo-logops/);
  assert.doesNotMatch(frontend,/\[phns\|\|row\.ph_ns,row\.no_control,row\.marca,row\.estatus\]/);
});

test('Carga manual relaciona Ref de ins_fl con PHNS sin crear equipos fuera de Instalaciones',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/id="ccor-ec-form-manual-ref"/);
  assert.match(frontend,/id="ccor-ec-form-manual-phns"/);
  assert.match(frontend,/id="ccor-ec-form-manual-apply"/);
  assert.match(frontend,/function applyManualEquipmentRelation_cor/);
  assert.match(frontend,/debe corresponder a un equipo existente en ins_fl/);
});

test('Equipos relacionados vuelven a viajar en Crear Editar',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/const equipos=\[\];[\s\S]*?state\.equipos\.forEach/);
  assert.match(frontend,/id_equipo_cor:row\.id_equipo_cor\|\|null/);
  assert.match(frontend,/id_ins_fl:Number\(row\.id_ins_fl\)\|\|null/);
  assert.match(frontend,/id_log_ops:row\.id_log_ops\?Number\(row\.id_log_ops\):null/);
  assert.match(frontend,/activo:row\.incluir!==false/);
});

test('Validacion del 100 por moneda es visible y bloquea Guardar en tiempo real',()=>{
  const frontend=read('modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js');
  assert.match(frontend,/id="ccor-ec-form-percentage-validation"/);
  assert.match(frontend,/function currencyCoverage_cor/);
  assert.match(frontend,/function currencyValidationOk_cor/);
  assert.match(frontend,/Falta \$\{delta\}%/);
  assert.match(frontend,/Excede \$\{Math\.abs\(delta\)\}%/);
  assert.match(frontend,/button\.disabled=Boolean\(state\.saving\)\|\|!allOk/);
  assert.match(frontend,/No puedes guardar: cada moneda de General debe sumar exactamente 100%/);
  assert.match(frontend,/Los porcentajes de \$\{currency\} deben sumar exactamente 100%/);
});

test('Loader fuerza la version del FIX V001',()=>{
  const loader=read('core/module-loader.js');
  assert.match(loader,/cobranza-cor-estados-cuenta-form\.js\?v=20260930-equipos-validacion100-v001/);
});
