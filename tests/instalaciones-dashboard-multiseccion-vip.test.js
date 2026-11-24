'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Multiselección VIP: SQL, etapas, edición rápida y permisos',async()=>{
  const front=read('modules/instalaciones-dashboard/instalaciones-dashboard_cor.js'),html=read('modules/instalaciones-dashboard/instalaciones-dashboard_cor.html'),service=read('backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.service.js'),repository=read('backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js'),controller=read('backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.controller.js'),palette=read('core/instalaciones-estatus-colores.js');
  const check=(ok,name)=>assert.ok(ok,name);

const frag=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);if(i<0||j<=i)throw Error('Fragment missing '+a);return s.slice(i,j);};
const raw=v=>String(v??'').trim();
const esc=v=>raw(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sampleRows=[{id_ins_fl:1,estatus:'02-OC',proyecto:'P1',referencia_sitio:'E1',supervisor_fl:'AB',activo:1},{id_ins_fl:2,estatus:'06-A',proyecto:'P2',referencia_sitio:'E2',supervisor_fl:'AB',activo:1}];
let calls=[];
const fakeRepo={AJUSTE_STATUS_COR:'06-A',getRulesDate_cor:async()=>({fecha_actual:'2026-11-24',anio_actual:2026}),listReportRows_cor:async(...args)=>{calls.push(args);return sampleRows.filter(row=>(Array.isArray(args[1])?args[1]:[args[1]]).includes(row.estatus));}};
const getReport=new Function('repository','notificationsForRow_cor',frag(service,'const REPORT_SECTIONS_COR =','function permissionObject_cor(')+frag(service,'function reportSelection_cor(','function normalizeQuickEditValue_cor(')+'\nreturn getReport_cor;')(fakeRepo,()=>[]);
let result=await getReport({supervisores:'AB',secciones:'06-A,02-OC,06-A',modo_junta:'1'});
check(calls.length===1&&same(calls[0][1],['02-OC','06-A']),'Una consulta multiselección sin duplicados');
check(same(result.sections.map(s=>s.codigo),['02-OC','06-A'])&&result.rows.length===2&&result.modo_junta,'Contrato multi y orden');
calls=[];result=await getReport({supervisores:'AB',vip:'1'});
check(calls.length===1&&calls[0][1].length===8&&calls[0][3].vipOnly===true&&result.vip_only,'VIP solo: todas las etapas');
calls=[];result=await getReport({supervisores:'AB',secciones:'02-OC,06-A',vip:'1'});
check(same(calls[0][0],['AB'])&&calls[0][1].length===2&&calls[0][3].vipOnly&&result.vip_only,'VIP intersecta supervisor y etapas');
calls=[];result=await getReport({filtro_especial:'AFL',secciones:'02-OC,06-A',vip:'1'});
check(same(calls[0][1],['06-A'])&&result.section_forced&&result.vip_only,'AFL conserva 06-A');
calls=[];result=await getReport({supervisores:'AB',seccion:'02-OC'});
check(calls[0][1]==='02-OC'&&result.section.codigo==='02-OC'&&!Object.hasOwn(result,'sections'),'Contrato legacy');
for(const [query,code] of [[{supervisores:'AB',secciones:'09-X',vip:'1'},'INSTALACIONES_DASHBOARD_SECTION_INVALID'],[{vip:'1'},'INSTALACIONES_DASHBOARD_SUPERVISORES_REQUIRED']]){
  let rejected=false;try{await getReport(query);}catch(e){rejected=e.code===code;}check(rejected,code);
}
const sqlSource=frag(repository,'function placeholders_cor(','function projectKeySql_cor(')+frag(repository,'function supervisorClause_cor(','function ajusteClause_cor(')+frag(repository,'async function listReportRows_cor(','// Las columnas autorizadas');
const sqlCalls=[];
const listRows=new Function('db',sqlSource+'\nreturn listReportRows_cor;')({query:async(sql,params)=>{sqlCalls.push({sql,params});return [[]];}});
await listRows(['AB','CD'],['02-OC','08-T'],2026,{vipOnly:true});
check(sqlCalls.length===1&&same(sqlCalls[0].params,['AB','CD','02-OC','08-T',2026]),'SQL parametrizado');
for(const clause of ["f.activo = 1","TRIM(COALESCE(f.supervisor_fl, '')) IN (?, ?)","f.estatus IN (?, ?)","f.estatus <> '08-T' OR CAST(TRIM(f.anio_termino) AS UNSIGNED) = ?","TRIM(COALESCE(f.clientes_vip, '')) NOT IN ('', '-')"])check(sqlCalls[0].sql.includes(clause),'SQL: '+clause);
await listRows(['AB'],'02-OC',2026,{});
check(!sqlCalls[1].sql.includes('f.clientes_vip')&&!sqlCalls[1].sql.includes('CAST(TRIM(f.anio_termino)'),'Consulta normal compatible');
const win={};new Function('window',palette)(win);
const state={meetingMode:false,report:null,reportSections:['02-OC','06-A'],vipOnly:false,afl:false};
const host={innerHTML:''};
const stages=[{codigo:'02-OC',nombre:'OC',columnas:[['COMENTARIO','comentarios_fl','comentario']]},{codigo:'06-A',nombre:'Ajuste',columnas:[['AJUSTADOR','ajustador','texto'],['COMENTARIO','comentarios_fl','comentario']]}];
const renderSource=frag(front,'function installationStatusStyle_cor(','const DASHBOARD_CONFIG_KEY_PREFIX_COR')+frag(front,'const QUICK_EDIT_FIELDS_COR =','const PERMISSIONS_COR =')+frag(front,'function quickEditConfig_cor(','function dateInputValue_cor(')+frag(front,'function resolveColumnValue_cor(','  async function loadSummary_cor(')+frag(front,'function applyQuickEditResult_cor(','async function saveCellEditor_cor(');
const render=new Function('window','state','raw','esc','closeCellEditor_cor','hasPermission_cor','formatDate_cor','formatPct_cor','formatInteger_cor','emptyRow_cor','bindResultRows_cor','$','effectiveReportSections_cor',renderSource+'\nreturn {renderReport_cor,assertReportContract_cor,quickEditConfig_cor,applyQuickEditResult_cor};')(win,state,raw,esc,()=>{},()=>true,String,String,String,(n,msg)=>'<tr><td colspan="'+n+'">'+msg+'</td></tr>',()=>{},id=>id==='idb-cor-report-result'?host:null,()=>state.reportSections);
const data={ok:true,sections:stages,rows:sampleRows.map(row=>({...row,notificaciones:row.estatus==='06-A'?[{emoji:'👁️',texto:'Alerta'}]:[],numero_pisos:3,ajustador:'Ana'})),total:2,selected_supervisors:['AB'],current_year:2026};
for(const mode of [false,true]){
  state.meetingMode=mode;render.renderReport_cor(render.assertReportContract_cor(data));
  check((host.innerHTML.match(/data-report-section=/g)||[]).length===2,'Dos tablas '+mode);
  check(host.innerHTML.includes('No. Pisos')&&host.innerHTML.includes('👁️'),'Columnas y alertas '+mode);
  check(host.innerHTML.includes('data-field="ajustador"')===mode,'Edición por modo '+mode);
}
check(render.quickEditConfig_cor('06-A','ajustador').type==='personal','Conserva selector de ajustador');
check(render.quickEditConfig_cor('02-OC','comentarios_fl').type==='textarea','Editor específico de etapa');
const fakeCell={isConnected:true,querySelector:()=>null,closest:()=>({querySelector:()=>null})};
const ctx={rowId:'1',sectionCode:'02-OC',field:'estatus',cell:fakeCell,reportRef:state.report};
check(render.applyQuickEditResult_cor(ctx,{row:{...data.rows[0],estatus:'06-A'}}),'Actualiza estatus en grupos');
check(state.report.rows.length===2&&state.report.rows.every(r=>r.estatus==='06-A'),'Movimiento a otra etapa seleccionada');
const ctx2={rowId:'1',sectionCode:'06-A',field:'supervisor_fl',cell:fakeCell,reportRef:state.report};
check(render.applyQuickEditResult_cor(ctx2,{row:{...state.report.rows[0],supervisor_fl:'CD'}})&&state.report.rows.length===1,'No conserva equipo fuera del supervisor');
state.vipOnly=true;state.reportSections=[];
render.renderReport_cor({...data,vip_only:true,requested_sections:[],rows:[data.rows[0]],total:1});
check(!host.innerHTML.includes('data-report-section="02-OC"')&&host.innerHTML.includes('data-report-section="06-A"'),'VIP solo oculta tablas vacías');
let rejected=false;try{render.assertReportContract_cor({ok:true,section:stages[0],rows:[]});}catch(e){rejected=true;}
check(rejected,'Respuesta antigua no se presenta como VIP');
const bstate={loading:false,sections:stages,reportSections:['02-OC'],vipOnly:false,afl:false,selectedSupervisors:['AB'],reportRequest:0};
const bhost={innerHTML:''},help={},scope={};let loads=0;
const ctrl=new Function('state','raw','esc','$','hasPermission_cor','installationStatusStyle_cor','AJUSTE_STATUS_COR','closeCellEditor_cor','persistDashboardConfig_cor','validUniverse_cor','loadReport_cor','syncAdjustersCalendar_cor',frag(front,'function canFilterSections_cor(','function applyBootstrap_cor(response)')+'\nreturn {renderSectionButtons_cor,toggleReportSection_cor};')(bstate,raw,esc,id=>({'idb-cor-section-buttons':bhost,'idb-cor-report-help':help,'idb-cor-report-scope':scope}[id]),()=>true,()=>'', '06-A',()=>{},()=>{},()=>true,()=>{loads++;},()=>{});
ctrl.renderSectionButtons_cor();
check(bhost.innerHTML.includes('data-section-code="VIP"')&&bhost.innerHTML.includes('data-section-code="02-OC"')&&!bhost.innerHTML.includes('<select'),'Botones reales');
ctrl.toggleReportSection_cor('06-A');check(same(bstate.reportSections,['02-OC','06-A']),'Selección múltiple');
ctrl.toggleReportSection_cor('VIP');check(bstate.vipOnly&&bstate.reportSections.length===2,'VIP mantiene etapas');
ctrl.toggleReportSection_cor('02-OC');check(same(bstate.reportSections,['06-A']),'Deselección individual');
bstate.afl=true;check(!ctrl.toggleReportSection_cor('02-OC')&&ctrl.toggleReportSection_cor('VIP'),'AFL bloquea otras etapas');
bstate.loading=true;check(!ctrl.toggleReportSection_cor('VIP'),'Bloquea interacción durante carga');
check(controller.includes("(requestedSection || requestedVip || special === 'AFL')")&&controller.includes('permissions.reporte_listado_ver === true'),'Snapshot conserva permisos');
check(front.includes('state.reportRequest+=1;')&&front.includes('if(requestId !== state.reportRequest) return'),'Descarta respuestas anteriores');
check(html.includes('id="idb-cor-section-buttons"')&&!html.includes('idb-cor-section-select'),'HTML sin desplegable');

});
