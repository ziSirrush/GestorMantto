const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../core/instalaciones-estatus-colores.js'),'utf8');
const window={};
vm.runInNewContext(source,{window});
const p=window.ManttoInstalacionesEstatus;
test('colores oficiales de las ocho etapas',()=>{
  const expected={'01-SUS':'#D4D4D4','02-OC':'#FF9999','03-PM':'#FFD561','04-M':'#FF6461','05-PA':'#61FFB0','06-A':'#00944B','07-PE':'#3ADDE0','08-T':'#0D1BFF'};
  assert.deepEqual(Object.keys(p.colors),Object.keys(expected));
  for(const [key,value] of Object.entries(expected))assert.equal(p.color(key),value);
});
test('normaliza estatus y protege desconocidos',()=>{
  assert.equal(p.normalize('08 - t'),'08-T');
  assert.equal(p.color('8-t'),'#0D1BFF');
  assert.equal(p.color('99-XX'),null);
});
test('contraste de colores oscuros',()=>{
  assert.equal(p.textColor('06-A'),'#FFFFFF');
  assert.equal(p.textColor('08-T'),'#FFFFFF');
  assert.equal(p.textColor('03-PM'),'#0F172A');
});
