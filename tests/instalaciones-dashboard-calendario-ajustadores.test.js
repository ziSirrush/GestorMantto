'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Dashboard reutiliza calendario Ajustadores, permisos, orden y aislamiento',async()=>{
  const program=read('modules/instalaciones-programacion-personal/instalaciones-programacion-personal.js'),dash=read('modules/instalaciones-dashboard/instalaciones-dashboard_cor.js'),html=read('modules/instalaciones-dashboard/instalaciones-dashboard_cor.html'),loader=read('core/module-loader.js');
  const check=(ok,message)=>assert.ok(ok,message);

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const start=program.indexOf('function orderedCalendarPeople_cor('),end=program.indexOf('function renderCalendar(){',start);
const order=new Function(program.slice(start,end)+'\nreturn orderedCalendarPeople_cor;')();
const people=[{id_personal:1},{id_personal:2},{id_personal:3},{id_personal:4}];
check(same(order(people,new Map([[2,[]],[4,[]]]),'AJUSTADOR').map(x=>x.id_personal),[2,4,1,3]),'Orden estable asignados primero');
check(same(people.map(x=>x.id_personal),[1,2,3,4]),'No altera catálogo');
check(order(people,new Map([[2,[]]]),'MONTADOR')===people,'Montadores conserva orden');
const listeners={},nodes=new Map(),calls=[],warnings=[];
let route='instalaciones-dashboard',panelRead=true,tabRead=true,viewer=false,hold=false,release;
const permittedActions=new Set(['VER','CREAR','EDITAR','DESACTIVAR']);
const today=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
const iso=today.year+'-'+today.month+'-'+today.day;
function node(id,owner=null){
  const n={id,owner,hidden:false,value:'',disabled:false,events:{},classList:{toggle(){}},setAttribute(){},removeAttribute(){},focus(){},
    addEventListener(type,fn){this.events[type]=fn;},contains(){return true;},querySelector(){return null;},querySelectorAll(){return[];},
    insertAdjacentHTML(_where,html){this._html+=html;},replaceChildren(){this.innerHTML='';}};
  Object.defineProperty(n,'innerHTML',{get(){return this._html||'';},set(value){
    const remove=parent=>{for(const [key,child] of [...nodes])if(child.owner===parent){remove(child);nodes.delete(key);}};
    remove(n);n._html=String(value);
    for(const match of n._html.matchAll(/(?:^|\s)id="([a-z0-9-]+)"/g))if(!nodes.has(match[1]))nodes.set(match[1],node(match[1],n));
  }});
  return n;
}
const root=node('idb-cor-adjusters-calendar');nodes.set(root.id,root);
const normal=node('ppc-calendario');normal.innerHTML='NORMAL';nodes.set(normal.id,normal);
const document={getElementById:id=>nodes.get(id)||null,addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},hidden:false};
const window={ManttoRouter:{getCurrent:()=>({route})},ManttoPermissions:{state:code=>({exists:true,efectivo:panelRead&&permittedActions.has(code.split('.').pop())})},
  ManttoAuth:{isViewingAs:()=>viewer,api:async(url,options)=>{
    calls.push({url,method:options.method});
    if(url.endsWith('/accesos'))return {data:{montadores:true,ajustadores:tabRead}};
    const match=/[?&]supervisores=([^&]+)/.exec(url);
    const selection=match?{supervisores:decodeURIComponent(match[1]).split(',')}:{};
    if(url.includes('/calendario?')){
      if(hold)await new Promise(resolve=>{release=resolve;});
      return {data:{...selection,hoy:iso,personal:[{id_personal:1,nombre:'Libre',tipo_personal:'AJUSTADOR'},{id_personal:2,nombre:'Asignado',tipo_personal:'AJUSTADOR'},{id_personal:3,nombre:'Ocupado fuera',tipo_personal:'AJUSTADOR'}],asignaciones:[
        {id_personal:2,id_asignacion:20,valida:true,visible:true,origen:'MANUAL',inicio:iso,fin:iso,proyecto:'Proyecto autorizado',equipo:'EQ-1'},
        {id_personal:3,id_asignacion:30,valida:true,visible:false,origen:'AUTOMATICA_FL',inicio:iso,fin:iso,proyecto:'SECRETO',equipo:'OCULTO'}],sin_fechas:[]}};
    }
    if(url.includes('/equipos?'))return {data:{...selection,equipos:[],total:0}};
    if(url.includes('/ajustadores/incidencias-fl'))return {data:{...selection,registros:[],hay_mas:false}};
    throw Error('Unexpected request '+url);
  }}};
class QueryParams {
  constructor(entries){this.entries=entries;}
  toString(){return this.entries.map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');}
}
new Function('window','document','BroadcastChannel','setTimeout','clearTimeout','URLSearchParams','console',program)(
  window,document,undefined,()=>0,()=>{},QueryParams,{warn:(...args)=>warnings.push(args.map(a=>a?.message||String(a)).join(' '))});
const comp=window.ManttoInstalacionesCalendarioAjustadores_cor;
check(typeof window.ManttoInstalacionesProgramacionPersonal.init==='function'&&typeof comp.mount==='function','Exporta ambas instancias');
check(await comp.mount()===true,'Monta calendario autorizado: '+warnings.join('; '));
check(calls.length===4&&calls.filter(c=>c.url.includes('/calendario?')).length===1,'Una consulta calendario y auxiliares existentes');
check(calls.every(c=>c.method==='GET'&&!c.url.includes('MONTADOR')&&!c.url.includes('/montadores/')),'Sólo lecturas de Ajustadores');
let holder=nodes.get('idb-cal-ppc-cal-contenido');
check(holder.innerHTML.indexOf('Asignado')<holder.innerHTML.indexOf('Libre')&&holder.innerHTML.indexOf('Ocupado fuera')<holder.innerHTML.indexOf('Libre'),'Orden visible asignados y ocupados antes de libres');
check(holder.innerHTML.includes('Proyecto autorizado')&&holder.innerHTML.includes('Ocupado (fuera de tu alcance)')&&!holder.innerHTML.includes('SECRETO')&&!holder.innerHTML.includes('OCULTO'),'Respeta redacción del alcance');
check(nodes.has('idb-cal-ppc-a-title')&&root.innerHTML.includes('aria-labelledby="idb-cal-ppc-a-title"')&&normal.innerHTML==='NORMAL','IDs aislados y ARIA');
check(nodes.get('idb-cal-ppc-calendario').innerHTML.includes('data-ppc="asignar-nueva"')&&holder.innerHTML.includes('data-ppc="editar-asignacion"'),'Conserva controles de asignación con permiso');
let before=calls.length;
check(await comp.mount()===true&&calls.length===before,'Cambiar modo sin cambiar alcance no repite consulta');
before=calls.length;
check(await comp.mount({supervisors:['CD','AB']})===true,'Monta con supervisores');
check(calls.slice(before).filter(c=>!c.url.endsWith('/accesos')).every(c=>c.url.includes('supervisores=AB%2CCD')),'Todas las lecturas incluidas en el filtro');
before=calls.length;
check(await comp.mount({supervisors:['AB','CD']})===true&&calls.length===before,'No duplica solicitudes al mantener selección');
check(await comp.mount({supervisors:null})===true&&calls.slice(before).every(c=>!c.url.includes('supervisores=')),'AFL restaura todas las lecturas autorizadas');
viewer=true;check(await comp.mount({refresh:true})===true,'Visor conserva lectura autorizada');
check(!nodes.get('idb-cal-ppc-calendario').innerHTML.includes('data-ppc="asignar-nueva"')&&!nodes.get('idb-cal-ppc-cal-contenido').innerHTML.includes('data-ppc="editar-asignacion"'),'Visor no ofrece escritura');
viewer=false;
comp.dispose();check(root.innerHTML===''&&!nodes.has('idb-cal-ppc-cal-contenido')&&normal.innerHTML==='NORMAL','Desmonta sin tocar otra instancia');
panelRead=false;let count=calls.length;check(await comp.mount()===false&&calls.length===count,'Sin VER no consulta API');
panelRead=true;tabRead=false;count=calls.length;check(await comp.mount()===false&&calls.length===count+1&&root.innerHTML==='','Sin pestaña Ajustadores no carga datos');
tabRead=true;hold=true;const mounting=comp.mount();
for(let i=0;i<20&&!release;i++)await Promise.resolve();
check(typeof release==='function','Consulta en curso simulada');
route='home';comp.dispose();release();check(await mounting===false&&root.innerHTML==='','Descarta respuesta después de navegar');
route='instalaciones-dashboard';hold=false;check(await comp.mount()===true,'Remonta correctamente al volver');
comp.dispose({reset:true});
check(warnings.length===0,'Sin errores inesperados de montaje');
check(html.indexOf('id="idb-cor-report-card"')<html.indexOf('id="idb-cor-adjusters-card"')&&html.indexOf('id="idb-cor-adjusters-card"')<html.indexOf('id="idb-cor-documentation-card"'),'Ubicación bajo reporte');
const allowedCode=dash.slice(dash.indexOf('function calendarAllowed_cor('),dash.indexOf('function disposeAdjustersCalendar_cor('));
check(!allowedCode.includes('meetingMode')&&allowedCode.includes('effectiveReportSections_cor().includes(AJUSTE_STATUS_COR)')&&!allowedCode.includes('vipOnly'),'Visible en ambos modos solo con 06-A efectivo');
const ds={ready:true,reportSections:['02-OC'],selectedSupervisors:['AB'],afl:false,calendarMountRequest:0,calendarScopeKey:null,meetingMode:false};
const card={hidden:true},mounts=[],disposes=[];
const dashFns=dash.slice(dash.indexOf('function calendarAllowed_cor('),dash.indexOf('function updateSelectionUi_cor('));
const dashboard=new Function('state','window','$','raw','validUniverse_cor','effectiveReportSections_cor','AJUSTE_STATUS_COR','hasPermission_cor',dashFns+'\nreturn {calendarAllowed_cor,syncAdjustersCalendar_cor};')(
  ds,{ManttoRouter:{getCurrent:()=>({route:'instalaciones-dashboard'})},ManttoInstalacionesCalendarioAjustadores_cor:{mount:async o=>{mounts.push(o);return true;},dispose:o=>disposes.push(o)}},()=>card,String,()=>ds.afl||ds.selectedSupervisors.length>0,()=>ds.afl?['06-A']:ds.reportSections,'06-A',()=>true);
await dashboard.syncAdjustersCalendar_cor();
check(card.hidden&&mounts.length===0,'Sin 06-A no monta ni consulta');
ds.reportSections.push('06-A');await dashboard.syncAdjustersCalendar_cor();
check(!card.hidden&&same(mounts.at(-1).supervisors,['AB']),'06-A consulta el supervisor activo');
ds.selectedSupervisors=['CD','AB'];ds.meetingMode=true;await dashboard.syncAdjustersCalendar_cor();
check(!card.hidden&&same(mounts.at(-1).supervisors,['AB','CD']),'Junta admite varios supervisores');
ds.afl=true;await dashboard.syncAdjustersCalendar_cor();
check(!card.hidden&&mounts.at(-1).supervisors===null,'AFL muestra todos incluso con otros supervisores activos');
ds.afl=false;ds.reportSections=['02-OC'];await dashboard.syncAdjustersCalendar_cor();
check(card.hidden&&disposes.length>0,'Deseleccionar 06-A desmonta');
check(dash.includes('void syncAdjustersCalendar_cor(true);')&&dash.includes('clearPersonalCatalog_cor();disposeAdjustersCalendar_cor();return;'),'Integra actualización y salida');
check(loader.split('instalaciones-programacion-personal.js?v=20261124-int9-calendario-supervisores-v002').length===3,'Misma versión de JS en ambas rutas');
check(loader.split('instalaciones-programacion-personal.css?v=20261124-int9-calendario-compartido-v001').length===3,'Mismo CSS en ambas rutas');

});
