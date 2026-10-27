'use strict';
// Experimental NS F7: pruebas sin Aiven/NetSuite/GitHub, con objetos de navegador simulados.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const FRONT=path.join(__dirname,'../../modules/experimental-ns');
const DRIVER=path.join(FRONT,'experimental-ns-protection.js');
const SOURCE=fs.readFileSync(DRIVER,'utf8');
function setup(options={}){
  const events=new Map(),windowEvents=new Map();
  const data=new Map(options.store||[]);
  let id=options.id||123, actor=options.actor||123;
  const window={
    ManttoAuth:{getUser:()=>id?{id_SB:id}:null,getActorUser:()=>actor?{id_SB:actor}:null,getViewUser:()=>null},
    sessionStorage:options.noStorage?undefined:{
      getItem:key=>data.has(key)?data.get(key):null,
      setItem:(key,value)=>data.set(key,String(value)),
      removeItem:key=>data.delete(key)
    },
    setTimeout:()=>1,clearTimeout:()=>{},
    addEventListener:(name,cb)=>windowEvents.set(name,cb)
  };
  const document={addEventListener:(name,cb)=>events.set(name,cb)};
  vm.runInNewContext(SOURCE,{window,document,navigator:{onLine:true},console,Date},{filename:DRIVER});
  return {protection:window.ManttoExperimentalNsProtection,events,windowEvents,data,window,
    setIdentity:(next,actorId)=>{id=next;actor=actorId??next;}};
}
const R1='experimental-ns-resumen-dia';
const R2='experimental-ns-equipos-criticos';
const R3='experimental-ns-proyectos-mantenimiento';
test('F7: solo registra rutas experimentales, no Core ni endpoints de escritura',()=>{
  assert.match(SOURCE,/Experimental NS/);
  assert.match(SOURCE,/experimental-ns-resumen-dia/);
  assert.match(SOURCE,/experimental-ns-equipos-criticos/);
  assert.match(SOURCE,/experimental-ns-proyectos-mantenimiento/);
  assert.doesNotMatch(SOURCE,/ManttoDataSync|\.apiPost\(|\.api\(/);
  assert.doesNotMatch(SOURCE,/\/api\/(?:tickets|portafolio|proyectos|equipos-criticos)/);
  assert.match(SOURCE,/sessionStorage/);
});
test('F7: primera lectura establece referencia, no genera historia falsa',()=>{
  const f=setup();const p=f.protection;
  assert.equal(p.observe(R1,[{ticket:'T1',estado_ticket:'Abierto'}]),0);
  assert.equal(p.getHistory('T1').length,0);
});
test('F7: captura cambios externos solo con valores previos verificables',()=>{
  const p=setup().protection;
  p.observe(R1,[{ticket:'T1',estado_ticket:'Abierto',codigo_equipo:'EQ1'}]);
  assert.equal(p.observe(R1,[{ticket:'T1',estado_ticket:'Cerrado',codigo_equipo:'EQ1'}]),1);
  const rows=p.getHistory('T1');
  assert.equal(rows[0].field,'Estado ticket');
  assert.equal(rows[0].before,'Abierto');
  assert.equal(rows[0].after,'Cerrado');
  assert.equal(rows[0].source,'NS / actor no confirmado');
});
test('F7: lecturas parciales de modulos diferentes no inventan cambios por campos ausentes',()=>{
  const p=setup().protection;
  p.observe(R1,[{n:'T1',et:'Abierto',cod:'EQ1'}]);
  assert.equal(p.observe(R2,[{ticket:'T1',estado_ticket:'Abierto',responsabilidad:'BLT'}]),0);
  assert.equal(p.observe(R3,[{ticket:'T1',responsabilidad:'BLT'}]),0);
  assert.equal(p.getHistory('T1').length,0);
});
test('F7: invalida identidad, historial y almacenamiento al cambiar de visor/usuario',()=>{
  const f=setup(),p=f.protection;
  p.observe(R1,[{ticket:'T1',estado_ticket:'Abierto'}]);
  p.observe(R1,[{ticket:'T1',estado_ticket:'Cerrado'}]);
  assert.equal(p.getHistory('T1').length,1);
  f.setIdentity(456);
  assert.equal(p.getHistory('T1').length,0);
  assert.equal(f.data.size,0);
});
test('F7: cierre de sesion limpia borradores e historial',()=>{
  const f=setup(),p=f.protection;
  p.observe(R1,[{ticket:'T1',estado_ticket:'Abierto'}]);
  p.observe(R1,[{ticket:'T1',estado_ticket:'Cerrado'}]);
  f.events.get('mantto:logout')();
  assert.equal(p.getHistory('T1').length,0);
  assert.equal(f.data.size,0);
});
test('F7: no falla si sessionStorage no esta disponible',()=>{
  const p=setup({noStorage:true}).protection;
  assert.equal(p.observe(R1,[{ticket:'T2',estado_ticket:'Abierto'}]),0);
  assert.equal(p.flush(),false);
});
test('F7: estado en otras rutas no se registra ni se muestra',()=>{
  const p=setup().protection;
  assert.equal(p.observe('ventas-dashboard',[{ticket:'T1',estado_ticket:'Abierto'}]),0);
  assert.equal(p.getHistory('T1').length,0);
});
test('F7: los tres modulos conservan llamadas exclusivamente a API NS y sus botones F7',()=>{
  const paths=[
    'resumen-dia/resumen-dia-ns.js',
    'equipos-criticos/equipos-criticos-ns.js',
    'proyectos-mantenimiento/proyectos-mantenimiento-ns.js'
  ];
  const source=paths.map(p=>fs.readFileSync(path.join(FRONT,p),'utf8'));
  for(const s of source){
    assert.match(s,/ManttoExperimentalNsProtection/);
    assert.match(s,/\.observe\(ROUTE/);
    assert.match(s,/\.openTicket\(/);
    assert.doesNotMatch(s,/\/api\/(?:tickets|portafolio|proyectos)(?:[\/?'"`])/);
  }
  assert.match(source[1],/data-ecns-draft-ticket/);
  assert.match(source[2],/data-proyns-draft-ticket/);
});
test('F7: el cargador incorpora JS y CSS del piloto antes de cada modulo NS',()=>{
  const source=fs.readFileSync(path.join(FRONT,'experimental-ns.js'),'utf8');
  const js=source.match(/experimental-ns-protection\.js/g)||[];
  const css=source.match(/experimental-ns-protection\.css/g)||[];
  assert.equal(js.length,3);
  assert.equal(css.length,3);
});
test('F7: revocacion de acceso F6 tambien borra borradores F7',()=>{
  const live=fs.readFileSync(path.join(FRONT,'experimental-ns-live.js'),'utf8');
  assert.match(live,/ManttoExperimentalNsProtection\?\.clear\(\)/);
});
test('F7: limites de almacenamiento y caducidad son finitos',()=>{
  const p=setup().protection;
  assert.equal(p.limits.maxText,5000);
  assert.equal(p.limits.maxDrafts,20);
  assert.equal(p.limits.expireMs,8*60*60*1000);
});
test('F7: sin base de datos de auditoria; historial en memoria no atribuye actor NS',()=>{
  const p=setup().protection;
  p.observe(R1,[{ticket:'T1',estado_ticket:'Abierto'}]);
  p.observe(R1,[{ticket:'T1',estado_ticket:'Cerrado'}]);
  assert.equal(p.getHistory('T1')[0].source,'NS / actor no confirmado');
  assert.doesNotMatch(SOURCE,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s+(?:INTO|TABLE|ns_)/i);
});
