(function(){
'use strict';
// [Aster | 2026-09-24 | ASTER-MG | FIX PVO-PRODUCCION PREVIEW HOJA 1 FIT SCROLL V003]
// [Aster | 2026-09-24 | ASTER-MG | FIX PVO-PRODUCCION DOCUMENTOS MODAL RESPONSIVE V002]
// [Aster | 2026-09-03 | ASTER-MG | FIX PVO-PRODUCCION GUARDAR EDICION V002]
// [Aster | 2026-09-24 | ASTER-MG | FIX PVO-PRODUCCION DOCUMENTOS MODAL RESPONSIVE V001]
// [Aster | 2026-09-23 | ASTER-MG | FIX PVO-PRODUCCION NUEVO BUSQUEDA PROYECTO CALENDARIO V001]
// [Aster | 2026-09-04 | ASTER-MG | FIX FORMATO FECHAS DDMMYYYY V001]
// [Aster | 2026-09-01 | ASTER-MG | FASE 1 LOGISTICA PRODUCCION SEMIAUTOMATICO V001]
// [Aster | 2026-09-01 | ASTER-MG | FASE 3 LOGISTICA PRODUCCION AGREGAR MODO MANUAL V001]
// [Aster | 2026-09-01 | ASTER-MG | FASE 4 LOGISTICA PRODUCCION DETALLE DOBLE MODO V001]
// [Aster | 2026-09-01 | ASTER-MG | FIX LOGISTICA PRODUCCION UX PICKERS CATALOGO CANCEL V001]
// [Aster | 2026-09-01 | ASTER-MG | FIX REESTRUCTURACION LOGISTICA PRODUCCION V001]
// [Aster | 2026-09-01 | ASTER-MG | FIX PVO DOCUMENTOS GESTION 30X30 V002]
// [Aster | 2026-09-03 | ASTER-MG | FASE 1 PVO-PRODUCCION NAVEGACION V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 2 PVO-PRODUCCION FUENTES LOG_OPS INS_FL V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 3 PVO-PRODUCCION MAIN FILTROS GUARDAR V001]
// [Aster | 2026-09-03 | ASTER-MG | FASE 4 PVO-PRODUCCION DETALLE EDITAR SELECTOR PROYECTO V001]
// [Aster | 2026-09-04 | ASTER-MG | FASE 5 PVO-PRODUCCION DETALLE EDITAR GUARDAR V001]
// [Aster | 2026-09-23 | ASTER-MG | FIX PVO-PRODUCCION DETALLE RESUMEN TABLA PREVIEW PDF V001]
// [Aster | 2026-09-23 | ASTER-MG | FIX PVO-PRODUCCION ORDEN FILTROS EMOJIS V001]
const state={
  rows:[],options:[],statuses:[],detail:null,selectedOption:null,optionSearchTimer:null,optionSearchToken:0,
  newMode:'MANUAL',newSaving:false,pickerDismissCleanup:null,docPreviewKeyHandler:null,docPreviewLastFocus:null,mainSort:{key:'default',direction:'asc'},
  manual:{loaded:false,loading:null,catalogs:null,lists:{project:[],advisor:[],supervisor:[]},selected:{project:null,advisor:null,supervisor:null},timers:{},tokens:{}}
};
const $=id=>document.getElementById(id);
const esc=v=>String(v==null||v===''?'—':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escRaw=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const raw=v=>String(v==null?'':v).trim();
const norm=v=>raw(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const req=(path,options)=>window.ManttoHttp.request(path,Object.assign({cacheTtlMs:0,force:true},options||{}));
const json=(path,method,body)=>req(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
const go=(route,payload)=>window.ManttoRouter&&window.ManttoRouter.go(route,payload||null);
const fmt=v=>v?String(v).slice(0,10):'—';
const MONTHS=Object.freeze({JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'});
function fmtDisplayDateSingle(value){
  const text=raw(value);
  if(!text)return '';
  let match=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
  if(match)return `${match[3]}/${match[2]}/${match[1]}`;
  match=text.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})(?:\s|$)/);
  if(match&&MONTHS[match[1].toUpperCase()])return `${String(match[2]).padStart(2,'0')}/${MONTHS[match[1].toUpperCase()]}/${match[3]}`;
  match=text.match(/^[A-Za-z]{3},?\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:\s|$)/);
  if(match&&MONTHS[match[2].toUpperCase()])return `${String(match[1]).padStart(2,'0')}/${MONTHS[match[2].toUpperCase()]}/${match[3]}`;
  const parsed=new Date(text);
  if(!Number.isNaN(parsed.getTime()))return `${String(parsed.getUTCDate()).padStart(2,'0')}/${String(parsed.getUTCMonth()+1).padStart(2,'0')}/${parsed.getUTCFullYear()}`;
  return '';
}
function fmtDisplayDate(value){
  const text=raw(value);
  if(!text)return '—';
  const direct=fmtDisplayDateSingle(text);
  if(direct)return direct;
  const values=text.split(',').map(x=>x.trim()).filter(Boolean);
  if(values.length>1){
    const formatted=values.map(x=>fmtDisplayDateSingle(x)||x);
    return formatted.join(', ');
  }
  return text;
}
function fmtHumanDateTime(value){
  return window.ManttoHumanTime&&typeof window.ManttoHumanTime.formatDateTime==='function'
    ? window.ManttoHumanTime.formatDateTime(value,{fallback:raw(value)||'—'})
    : raw(value)||'—';
}
const STATUS_CATALOG=Object.freeze({area:'Logistica',elemento:'Estatus Produccion'});
function shell(view,title,subtitle,body,actions=''){view.innerHTML=`<div class="lp-page"><section class="lp-card lp-head"><div><p class="lp-eyebrow">Corellian · Logística</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="lp-actions">${actions}<button class="lp-btn ghost" data-lp-refresh type="button">↻ Actualizar</button></div></section><div id="lp-alert" aria-live="polite"></div>${body}</div>`;}
function alertMsg(message,type='error'){const el=$('lp-alert');if(el)el.innerHTML=`<div class="lp-alert ${type}">${esc(message)}</div>`;}
function clearAlert(){const el=$('lp-alert');if(el)el.innerHTML='';}
function empty(cols,text){return `<tr><td colspan="${cols}" class="lp-empty">${esc(text)}</td></tr>`;}
function indicators(row){return (row.indicadores||[]).map(x=>`<span class="lp-indicator" title="${esc(x.nombre)}">${esc(x.emoji)}</span>`).join('')||'<span class="lp-ok">✓</span>';}
function field(label,value,conflict=false){return `<div class="lp-field ${conflict?'conflict':''}"><small>${esc(label)}</small><strong>${esc(value)}</strong>${conflict?'<em>Valores distintos en FL</em>':''}</div>`;}
function markProductionDirty(){const sync=window.ManttoDataSync;if(!sync||typeof sync.markDirty!=='function')return;['logistica-produccion','logistica-pvo','logistica-documentos'].forEach(route=>sync.markDirty(route));}
async function uploadInitial(id,type,files){for(let i=0;i<files.length;i++){const data=new FormData();data.set('tipo_archivo',type);data.set('numero_archivo',String(i+1));data.set('archivo',files[i]);await req('/api/logistica/produccion/'+id+'/archivos',{method:'POST',body:data});}}
function optionLabel(x){return `${raw(x&&x.id_ppns)||'SIN PPNS'} · ${raw(x&&x.proyecto)||'Sin proyecto'}`;}
function setOptionListOpen(open){const input=$('lp-option-search'),box=$('lp-option-list');if(input)input.setAttribute('aria-expanded',open?'true':'false');if(box)box.hidden=!open;}
function comboOwnsFocus(inputId){const input=$(inputId),combo=input&&input.closest('.lp-combobox');return Boolean(combo&&combo.contains(document.activeElement));}
function catalogEmptyLabel(){return `Sin estatus activos · ${STATUS_CATALOG.area} / ${STATUS_CATALOG.elemento}`;}
function renderStatusOptions(){const select=$('lp-status');if(!select)return;const rows=Array.isArray(state.statuses)?state.statuses:[];select.innerHTML='<option value="">Sin estatus</option>'+rows.map(x=>`<option value="${escRaw(x.id_catalogo)}">${esc(x.articulo)}</option>`).join('')+(rows.length?'':`<option value="" disabled>${escRaw(catalogEmptyLabel())}</option>`);}
function renderSelectedOption(){const x=state.selectedOption;const host=$('lp-auto');if(!host)return;host.innerHTML=x?[field('PPNS',x.id_ppns),field('Proyecto',x.proyecto),field('Asesor',x.asesores),field('Supervisor',x.supervisores),field('Fecha PVO',fmtDisplayDate(x.pvo)),field('Fecha de Visita',fmtDisplayDate(x.fechas_visita||x.fechas_pvo_fl)),field('Fecha entrega cubos',fmtDisplayDate(x.fechas_cubos)),field('Estatus Logística',x.estatus),field('Disponibilidad',x.ya_registrado?'Ya registrado':'Disponible')].join(''):'';}
function selectOptionById(id){const x=state.options.find(item=>String(item.id_log_ops)===String(id));if(!x)return;state.selectedOption=x;const input=$('lp-option-search');if(input)input.value=optionLabel(x);renderSelectedOption();setOptionListOpen(false);}
function renderOptionList(rows,message='No se encontraron coincidencias.'){const box=$('lp-option-list');if(!box)return;const data=Array.isArray(rows)?rows:[];box.innerHTML=data.length?data.map(x=>`<button class="lp-option${x.ya_registrado?' is-used':''}" type="button" data-lp-option-id="${escRaw(x.id_log_ops)}"><strong>${esc(raw(x.id_ppns)||'SIN PPNS')}</strong><span>${esc(raw(x.proyecto)||'Sin proyecto')}</span><small>#${esc(x.id_log_ops)} · ${x.ya_registrado?'Ya registrado':'Disponible'}</small></button>`).join(''):`<div class="lp-option-empty">${esc(message)}</div>`;setOptionListOpen(comboOwnsFocus('lp-option-search'));box.querySelectorAll('[data-lp-option-id]').forEach(button=>button.onclick=()=>selectOptionById(button.dataset.lpOptionId));}
async function loadOptionData(query=''){const suffix=raw(query)?'?q='+encodeURIComponent(raw(query)):'';const data=await req('/api/logistica/produccion/opciones-ppns'+suffix);state.options=Array.isArray(data.data)?data.data:[];state.statuses=Array.isArray(data.catalogo_estatus)?data.catalogo_estatus:[];renderStatusOptions();return state.options;}
function bindOptionSearch(){const input=$('lp-option-search');if(!input)return;const open=()=>{closePickersExcept('semi');renderOptionList(state.options,'Escribe un PPNS o proyecto para buscar.');};input.onfocus=open;input.onclick=open;input.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeAllPickers();return;}if(event.key==='Tab'){setOptionListOpen(false);return;}if(event.key==='ArrowDown'){const first=$('lp-option-list')?.querySelector('[data-lp-option-id]');if(first){event.preventDefault();first.focus();}}};input.oninput=()=>{state.selectedOption=null;renderSelectedOption();const query=input.value.trim(),token=++state.optionSearchToken;clearTimeout(state.optionSearchTimer);state.optionSearchTimer=setTimeout(async()=>{try{renderOptionList([],'Buscando...');const rows=await loadOptionData(query);if(token!==state.optionSearchToken)return;renderOptionList(rows,query?'No se encontraron PPNS / proyectos.':'No hay filas logísticas disponibles.');}catch(error){if(token!==state.optionSearchToken)return;renderOptionList([],error.message||'No fue posible consultar PPNS / proyectos.');}},220);};}

const MANUAL_PROJECT=Object.freeze({endpoint:'/api/logistica/produccion/manual/proyectos',key:'id_log_ops'});
const MANUAL_PICKERS=Object.freeze({
  project:{input:'lp-manual-project-search',list:'lp-manual-project-list',endpoint:'/api/logistica/produccion/manual/proyectos',key:'id_log_ops'},
  advisor:{input:'lp-manual-advisor-search',list:'lp-manual-advisor-list',endpoint:'/api/logistica/produccion/manual/asesores',key:'id_SB'},
  supervisor:{input:'lp-manual-supervisor-search',list:'lp-manual-supervisor-list',endpoint:'/api/logistica/produccion/manual/supervisores',key:'id_SB'}
});
function manualPickerLabel(kind,row){
  if(kind==='project')return raw(row.proyecto)||'Proyecto';
  return raw(row.nombre)||raw(row.iniciales)||'Usuario';
}
function manualPickerSecondary(kind,row){
  if(kind==='project')return [raw(row.id_ppns)||'SIN PPNS',raw(row.estatus)].filter(Boolean).join(' · ');
  return [raw(row.iniciales),raw(row.rol),raw(row.puesto)].filter(Boolean).join(' · ');
}
function setManualPickerOpen(kind,open){const cfg=MANUAL_PICKERS[kind],input=$(cfg.input),box=$(cfg.list);if(input)input.setAttribute('aria-expanded',open?'true':'false');if(box)box.hidden=!open;}
function closeAllPickers(){setOptionListOpen(false);Object.keys(MANUAL_PICKERS).forEach(kind=>setManualPickerOpen(kind,false));}
function closePickersExcept(activeKey){if(activeKey!=='semi')setOptionListOpen(false);Object.keys(MANUAL_PICKERS).forEach(kind=>{if(kind!==activeKey)setManualPickerOpen(kind,false);});}
function pickerKeyFromTarget(target){const combo=target&&target.closest&&target.closest('.lp-combobox');if(!combo)return null;const input=combo.querySelector('[role="combobox"]');if(!input)return null;if(input.id==='lp-option-search')return 'semi';return Object.keys(MANUAL_PICKERS).find(kind=>MANUAL_PICKERS[kind].input===input.id)||null;}
function releasePickerDismiss(){if(typeof state.pickerDismissCleanup==='function')state.pickerDismissCleanup();state.pickerDismissCleanup=null;}
function bindPickerDismiss(view){releasePickerDismiss();const pointerHandler=event=>{if(!view.isConnected)return;closePickersExcept(pickerKeyFromTarget(event.target));};const focusHandler=event=>{if(!view.isConnected)return;closePickersExcept(pickerKeyFromTarget(event.target));};const keyHandler=event=>{if(event.key==='Escape')closeAllPickers();};document.addEventListener('pointerdown',pointerHandler,true);document.addEventListener('focusin',focusHandler,true);document.addEventListener('keydown',keyHandler,true);state.pickerDismissCleanup=()=>{document.removeEventListener('pointerdown',pointerHandler,true);document.removeEventListener('focusin',focusHandler,true);document.removeEventListener('keydown',keyHandler,true);};}
function manualOptionHtml(kind,row){const cfg=MANUAL_PICKERS[kind],key=row[cfg.key],secondary=manualPickerSecondary(kind,row),used=kind==='project'&&Number(row.ya_registrado)===1;return `<button class="lp-picker-option${used?' is-used':''}" type="button" data-lp-manual-kind="${kind}" data-lp-manual-key="${escRaw(key)}"${used?' disabled aria-disabled="true"':''}><strong>${esc(manualPickerLabel(kind,row))}</strong>${secondary?`<span>${esc(secondary)}</span>`:''}${used?'<small>Ya registrado en PVO-Producción</small>':''}</button>`;}
function renderManualPickerList(kind,rows,message='No se encontraron coincidencias.'){const cfg=MANUAL_PICKERS[kind],box=$(cfg.list);if(!box)return;const data=Array.isArray(rows)?rows:[];box.innerHTML=data.length?data.map(row=>manualOptionHtml(kind,row)).join(''):`<div class="lp-option-empty">${esc(message)}</div>`;setManualPickerOpen(kind,comboOwnsFocus(cfg.input));box.querySelectorAll('[data-lp-manual-key]:not(:disabled)').forEach(button=>button.onclick=()=>selectManualPicker(button.dataset.lpManualKind,button.dataset.lpManualKey));}
async function fetchManualProjects(query=''){const suffix=raw(query)?'?q='+encodeURIComponent(raw(query)):'';const data=await req(MANUAL_PROJECT.endpoint+suffix);const rows=Array.isArray(data.data)?data.data:[];state.manual.lists.project=rows;return rows;}
async function fetchManualPicker(kind,query=''){const cfg=MANUAL_PICKERS[kind],suffix=raw(query)?'?q='+encodeURIComponent(raw(query)):'';const data=await req(cfg.endpoint+suffix);const rows=Array.isArray(data.data)?data.data:[];state.manual.lists[kind]=rows;return rows;}
function renderManualSelectionMeta(kind){const row=state.manual.selected[kind],host=$('lp-manual-'+kind+'-meta');if(!host)return;if(!row){host.textContent='Selecciona una opción válida de la lista.';host.className='lp-picker-meta';return;}host.className='lp-picker-meta selected';if(kind==='project')host.textContent=Number(row.ya_registrado)===1?'Este proyecto ya tiene seguimiento activo de PVO-Producción.':'Proyecto vinculado directamente a Logística.';else host.textContent=[row.iniciales,row.rol,row.puesto].filter(Boolean).join(' · ');}
function manualProjectSelectOptions(){const rows=Array.isArray(state.manual.lists.project)?state.manual.lists.project:[],selected=state.manual.selected.project,selectedId=selected&&selected.id_log_ops!=null?String(selected.id_log_ops):'';return '<option value="">Selecciona proyecto</option>'+rows.map(row=>{const id=String(row.id_log_ops==null?'':row.id_log_ops),isSelected=id===selectedId,disabled=Number(row.ya_registrado)===1&&!isSelected;return `<option value="${escRaw(id)}"${isSelected?' selected':''}${disabled?' disabled':''}>${escRaw(raw(row.proyecto)||'Sin proyecto')}</option>`;}).join('');}
function renderManualProjectSelect(){const select=$('lp-manual-project-select');if(!select)return;select.innerHTML=manualProjectSelectOptions();const selected=state.manual.selected.project;if(selected&&selected.id_log_ops!=null)select.value=String(selected.id_log_ops);}
function bindManualProjectSelect(){const select=$('lp-manual-project-select');if(!select)return;select.onchange=()=>{const id=select.value,row=(state.manual.lists.project||[]).find(item=>String(item.id_log_ops)===String(id));state.manual.selected.project=row||null;renderManualSelectionMeta('project');syncManualProjectFields(row||null);};}
function sourceText(value){const text=raw(value);return text||'—';}
function sourceDateText(value){return fmtDisplayDate(value);}
function setManualSourceField(inputId,noteId,value,source){const input=$(inputId),note=$(noteId);if(input){input.value=sourceText(value);input.readOnly=true;input.setAttribute('aria-readonly','true');}if(note){note.textContent=`Solo lectura · ${source}`;note.className='lp-source-note automatic';}}
function syncManualProjectFields(fallback=null){const row=state.manual.selected.project||fallback||null;setManualSourceField('lp-manual-pvo','lp-manual-pvo-note',sourceDateText(row&&row.pvo),'log_ops.pvo');setManualSourceField('lp-manual-visita','lp-manual-visita-note',sourceDateText(row&&(row.fechas_visita||row.fecha_visita)),'ins_fl.fecha_visita');setManualSourceField('lp-manual-cubos','lp-manual-cubos-note',sourceDateText(row&&(row.fechas_cubos||row.fecha_cubos)),'ins_fl.fecha_posible_recepcion_cubo');setManualSourceField('lp-manual-log-status','lp-manual-log-status-note',row&&row.estatus,'log_ops.estatus');}
function selectManualPicker(kind,key){const cfg=MANUAL_PICKERS[kind],row=state.manual.lists[kind].find(item=>String(item[cfg.key])===String(key));if(!row)return;if(kind==='project'&&Number(row.ya_registrado)===1)return;state.manual.selected[kind]=row;const input=$(cfg.input);if(input)input.value=manualPickerLabel(kind,row);setManualPickerOpen(kind,false);renderManualSelectionMeta(kind);if(kind==='project')syncManualProjectFields();}
function clearManualSelection(kind){state.manual.selected[kind]=null;renderManualSelectionMeta(kind);if(kind==='project')syncManualProjectFields();}
function bindManualPicker(kind){const cfg=MANUAL_PICKERS[kind],input=$(cfg.input);if(!input)return;const open=()=>{closePickersExcept(kind);renderManualPickerList(kind,state.manual.lists[kind],kind==='project'?'Escribe un Proyecto o PPNS para buscar.':'Escribe para buscar.');};input.onfocus=open;input.onclick=open;input.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeAllPickers();return;}if(event.key==='Tab'){setManualPickerOpen(kind,false);return;}if(event.key==='ArrowDown'){const first=$(cfg.list)?.querySelector('[data-lp-manual-key]:not(:disabled)');if(first){event.preventDefault();first.focus();}}};input.oninput=()=>{if(state.manual.selected[kind])clearManualSelection(kind);const query=input.value.trim(),token=(state.manual.tokens[kind]||0)+1;state.manual.tokens[kind]=token;clearTimeout(state.manual.timers[kind]);state.manual.timers[kind]=setTimeout(async()=>{try{renderManualPickerList(kind,[],'Buscando...');const rows=await fetchManualPicker(kind,query);if(token!==state.manual.tokens[kind])return;renderManualPickerList(kind,rows,kind==='project'?'No se encontraron Proyectos / PPNS.':'No se encontraron opciones.');}catch(error){if(token!==state.manual.tokens[kind])return;renderManualPickerList(kind,[],error.message||'No fue posible consultar las opciones.');}},220);};}
function renderManualCatalogs(){const data=state.manual.catalogs||{},prod=Array.isArray(data.estatus_produccion)?data.estatus_produccion:[],source=data.catalogo_estatus_produccion||STATUS_CATALOG,label=`${raw(source.area)||STATUS_CATALOG.area} / ${raw(source.elemento)||STATUS_CATALOG.elemento}`,prodSelect=$('lp-manual-prod-status'),emptyLabel=`Sin estatus activos · ${label}`;if(prodSelect)prodSelect.innerHTML='<option value="">Sin estatus</option>'+prod.map(x=>`<option value="${escRaw(x.id_catalogo)}">${esc(x.articulo)}</option>`).join('')+(prod.length?'':`<option value="" disabled>${escRaw(emptyLabel)}</option>`);}
async function ensureManualData(){if(state.manual.loaded){renderManualCatalogs();renderManualProjectSelect();return;}if(state.manual.loading)return state.manual.loading;state.manual.loading=(async()=>{const [catalogs,projects,advisors,supervisors]=await Promise.all([req('/api/logistica/produccion/manual/catalogos'),fetchManualProjects(''),fetchManualPicker('advisor',''),fetchManualPicker('supervisor','')]);state.manual.catalogs=catalogs.data||{};state.manual.lists.project=projects;state.manual.lists.advisor=advisors;state.manual.lists.supervisor=supervisors;state.manual.loaded=true;renderManualCatalogs();renderManualProjectSelect();})();try{await state.manual.loading;}finally{state.manual.loading=null;}}
function resetManualNewState(){state.manual.loaded=false;state.manual.loading=null;state.manual.catalogs=null;state.manual.lists={project:[],advisor:[],supervisor:[]};state.manual.selected={project:null,advisor:null,supervisor:null};Object.values(state.manual.timers||{}).forEach(clearTimeout);state.manual.timers={};state.manual.tokens={};}
function manualPayload(){const project=state.manual.selected.project,advisor=state.manual.selected.advisor,supervisor=state.manual.selected.supervisor;if(!project||!project.id_log_ops)throw new Error('Selecciona un Proyecto válido de Logística.');if(Number(project.ya_registrado)===1)throw new Error('El proyecto seleccionado ya tiene seguimiento activo de PVO-Producción.');if(!advisor)throw new Error('Selecciona un Asesor válido.');if(!supervisor)throw new Error('Selecciona un Supervisor válido.');return {modo_registro:'MANUAL',id_log_ops:project.id_log_ops,id_asesor:advisor.id_SB,id_supervisor:supervisor.id_SB,id_estatus_produccion:$('lp-manual-prod-status').value||null,fecha_envio_docs_fabrica:$('lp-new-doc-date')?.value||null,fecha_envio_pago_fabrica:$('lp-new-pay-date')?.value||null,comentario:$('lp-manual-comment').value};}
function cancelNewCapture(){if(state.newSaving)return;state.optionSearchToken+=1;clearTimeout(state.optionSearchTimer);Object.values(state.manual.timers||{}).forEach(clearTimeout);Object.keys(state.manual.tokens||{}).forEach(kind=>{state.manual.tokens[kind]=(state.manual.tokens[kind]||0)+1;});closeAllPickers();go('logistica-produccion');}
function setNewSaving(busy){state.newSaving=Boolean(busy);['lp-save','lp-manual-save','lp-cancel','lp-manual-cancel','lp-cancel-new-header'].forEach(id=>{const el=$(id);if(el)el.disabled=state.newSaving;});}

const MAIN_SORT_KEYS=Object.freeze(['docs','proyecto','asesor','supervisor','fecha_pvo','fecha_visita','fecha_cubos','semana','comentario','estatus']);
function mainDateSortValue(value){
 const text=raw(value);
 if(!text)return null;
 const matches=text.match(/\d{4}-\d{2}-\d{2}/g)||[];
 if(!matches.length)return null;
 const times=matches.map(x=>Date.parse(x+'T00:00:00Z')).filter(Number.isFinite);
 return times.length?Math.min(...times):null;
}
function mainSortValue(row,key){
 switch(key){
  case 'docs':return Array.isArray(row.indicadores)?row.indicadores.length:0;
  case 'proyecto':return [raw(row.proyecto),raw(row.ppns)].filter(Boolean).join(' · ');
  case 'asesor':return raw(row.asesores);
  case 'supervisor':return raw(row.supervisores);
  case 'fecha_pvo':return mainDateSortValue(row.fecha_pvo);
  case 'fecha_visita':return mainDateSortValue(row.fechas_visita||row.fechas_pvo_fl);
  case 'fecha_cubos':return mainDateSortValue(row.fechas_cubos);
  case 'semana':{
   const year=Number(row.anio_registro),week=Number(row.semana_registro);
   return Number.isFinite(year)&&Number.isFinite(week)?(year*100+week):null;
  }
  case 'comentario':return raw(row.comentario);
  case 'estatus':return raw(row.estatus_produccion);
  default:return null;
 }
}
function mainSortedRows(){
 const rows=Array.isArray(state.rows)?state.rows:[];
 const sort=state.mainSort||{key:'default',direction:'asc'};
 if(!MAIN_SORT_KEYS.includes(sort.key))return rows.slice();
 return rows.map((row,index)=>({row,index})).sort((a,b)=>{
  const av=mainSortValue(a.row,sort.key),bv=mainSortValue(b.row,sort.key);
  const aMissing=av===null||av===undefined||av==='';
  const bMissing=bv===null||bv===undefined||bv==='';
  if(aMissing!==bMissing)return aMissing?1:-1;
  if(aMissing&&bMissing)return a.index-b.index;
  let cmp=0;
  if(typeof av==='number'&&typeof bv==='number')cmp=av-bv;
  else cmp=String(av).localeCompare(String(bv),'es',{numeric:true,sensitivity:'base'});
  if(cmp===0)return a.index-b.index;
  return sort.direction==='desc'?-cmp:cmp;
 }).map(item=>item.row);
}
function mainWeekLabel(row){
 const year=Number(row&&row.anio_registro),week=Number(row&&row.semana_registro);
 return Number.isInteger(year)&&Number.isInteger(week)?`S${String(week).padStart(2,'0')} / ${year}`:'—';
}
function updateMainSortHeaders(view){
 const sort=state.mainSort||{key:'default',direction:'asc'};
 view.querySelectorAll('[data-lp-sort]').forEach(button=>{
  const active=button.dataset.lpSort===sort.key;
  const th=button.closest('th');
  if(th)th.setAttribute('aria-sort',active?(sort.direction==='asc'?'ascending':'descending'):'none');
  const mark=button.querySelector('.lp-sort-dir');
  if(mark)mark.textContent=active?(sort.direction==='asc'?'↑':'↓'):'↕';
  button.classList.toggle('active',active);
 });
}
function renderMainRows(view){
 const rows=mainSortedRows();
 const body=$('lp-main-body');
 if(!body)return;
 body.innerHTML=rows.length?rows.map(r=>`<tr data-detail="${r.id_produccion}"><td>${indicators(r)}</td><td><button class="lp-link" type="button">${esc(r.proyecto)}</button><small>${esc(r.ppns)}</small></td><td>${esc(r.asesores)}</td><td>${esc(r.supervisores)}</td><td>${fmtDisplayDate(r.fecha_pvo)}</td><td>${esc(fmtDisplayDate(r.fechas_visita||r.fechas_pvo_fl))}</td><td>${esc(fmtDisplayDate(r.fechas_cubos))}</td><td>${esc(mainWeekLabel(r))}</td><td>${esc(r.comentario)}</td><td>${esc(r.estatus_produccion)}</td></tr>`).join(''):empty(10,'No hay registros para la vista seleccionada.');
 view.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>go('logistica-produccion-detalle',{id:el.dataset.detail}));
 updateMainSortHeaders(view);
}
function bindMainSort(view){
 view.querySelectorAll('[data-lp-sort]').forEach(button=>{
  button.onclick=event=>{
   event.stopPropagation();
   const key=button.dataset.lpSort;
   if(!MAIN_SORT_KEYS.includes(key))return;
   if(state.mainSort&&state.mainSort.key===key)state.mainSort.direction=state.mainSort.direction==='asc'?'desc':'asc';
   else state.mainSort={key,direction:key==='semana'?'desc':'asc'};
   renderMainRows(view);
  };
 });
 updateMainSortHeaders(view);
}

async function loadMain(view){
 state.mainSort={key:'default',direction:'asc'};
 const sortTh=(key,label)=>`<th aria-sort="none"><button class="lp-sort" type="button" data-lp-sort="${key}" title="Ordenar ${escRaw(label)}">${esc(label)} <span class="lp-sort-dir" aria-hidden="true">↕</span></button></th>`;
 shell(view,'PVO-Producción','Seguimiento consolidado sin duplicar las fuentes operativas.',`<section class="lp-card lp-toolbar"><input id="lp-q" type="search" placeholder="Buscar proyecto o PPNS"><label>Faltantes<select id="lp-main-filter" aria-label="Filtrar registros de PVO-Producción por faltante"><option value="todos">Ver Todos</option><option value="falta_archivo_pvo">Falta Archivo PVO</option><option value="falta_ppns">Falta PPNS</option><option value="sin_documentos">Faltan Docs de Producción</option><option value="sin_pvo">Sin Fecha PVO</option><option value="sin_visita">Sin Fecha de Visita</option><option value="sin_cubos">Sin Fecha entrega cubos</option><option value="sin_asesor">Sin Asesor</option><option value="sin_supervisor">Sin Supervisor</option><option value="sin_estatus_produccion">Sin Estatus Producción</option></select></label></section><section class="lp-card lp-indicator-legend" aria-label="Significado de indicadores de PVO-Producción"><strong>Indicadores</strong><div><span><b>📍</b> Falta Archivo PVO</span><span><b>🥨</b> Falta PPNS</span><span><b>💾</b> Faltan Docs de Producción</span><span><b class="lp-legend-ok">✓</b> Sin faltantes detectados</span></div></section><section class="lp-card"><div class="lp-main-order-note"><strong>Orden inicial:</strong> semana de registro más reciente primero; dentro de cada semana, Fecha PVO más antigua primero. Los registros sin PVO quedan al final de su semana.</div><div class="lp-table-wrap"><table class="lp-table lp-main-table"><thead><tr>${sortTh('docs','Docs')}${sortTh('proyecto','Proyecto')}${sortTh('asesor','Asesor')}${sortTh('supervisor','Supervisor')}${sortTh('fecha_pvo','Fecha PVO')}${sortTh('fecha_visita','Fecha de Visita')}${sortTh('fecha_cubos','Fecha entrega cubos')}${sortTh('semana','Semana/Año')}${sortTh('comentario','Comentario')}${sortTh('estatus','Estatus Producción')}</tr></thead><tbody id="lp-main-body"></tbody></table></div></section>`,`<button id="lp-add" class="lp-btn primary" type="button">＋ Agregar nuevo</button>`);
 bindMainSort(view);
 const load=async()=>{
  try{
   clearAlert();
   const p=new URLSearchParams(),filter=$('lp-main-filter').value;
   if($('lp-q').value.trim())p.set('q',$('lp-q').value.trim());
   if(filter&&filter!=='todos')p.set('vista',filter);
   const suffix=p.toString()?'?'+p.toString():'';
   const data=await req('/api/logistica/produccion'+suffix);
   state.rows=Array.isArray(data.data)?data.data:[];
   renderMainRows(view);
  }catch(e){alertMsg(e.message);}
 };
 $('lp-add').onclick=()=>go('logistica-produccion-nuevo');
 $('lp-q').oninput=()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(load,250);};
 $('lp-main-filter').onchange=load;
 view.querySelector('[data-lp-refresh]').onclick=load;
 await load();
}

async function loadNew(view,resetMode=true){
 state.newMode='MANUAL';state.newSaving=false;state.selectedOption=null;state.options=[];state.statuses=[];state.optionSearchToken+=1;resetManualNewState();
 shell(view,'Agregar PVO-Producción','Captura manual. El Proyecto se relaciona directamente con Logística; PVO, Visita, Cubos y Estatus Logística son de solo lectura.',`<section id="lp-manual-form" class="lp-card lp-form"><div class="lp-form-heading wide"><div><h2>Manual</h2><p>Selecciona el Proyecto desde Logística. Los datos operativos se consultan desde su fuente y no se duplican en PVO-Producción.</p></div></div>
 <label class="wide">Proyecto *<div class="lp-combobox lp-project-combobox"><input id="lp-manual-project-search" type="search" autocomplete="off" placeholder="Buscar proyecto o PPNS..." role="combobox" aria-autocomplete="list" aria-controls="lp-manual-project-list" aria-expanded="false"><div id="lp-manual-project-list" class="lp-options lp-picker-options lp-project-options" role="listbox" hidden></div></div><small id="lp-manual-project-meta" class="lp-picker-meta">Escribe para filtrar y selecciona un Proyecto disponible.</small></label>
 <label>Asesor *<div class="lp-combobox"><input id="lp-manual-advisor-search" type="search" autocomplete="off" placeholder="Buscar asesor, gerente o director" role="combobox" aria-autocomplete="list" aria-controls="lp-manual-advisor-list" aria-expanded="false"><div id="lp-manual-advisor-list" class="lp-options lp-picker-options" role="listbox" hidden></div></div><small id="lp-manual-advisor-meta" class="lp-picker-meta">Selecciona una opción válida de la lista.</small></label>
 <label>Supervisor *<div class="lp-combobox"><input id="lp-manual-supervisor-search" type="search" autocomplete="off" placeholder="Buscar supervisor o superintendente" role="combobox" aria-autocomplete="list" aria-controls="lp-manual-supervisor-list" aria-expanded="false"><div id="lp-manual-supervisor-list" class="lp-options lp-picker-options" role="listbox" hidden></div></div><small id="lp-manual-supervisor-meta" class="lp-picker-meta">Selecciona una opción válida de la lista.</small></label>
 <div class="lp-manual-source-grid wide"><label>Fecha PVO<input id="lp-manual-pvo" type="text" value="—" readonly><small id="lp-manual-pvo-note" class="lp-source-note">Solo lectura · log_ops.pvo</small></label><label>Fecha de Visita<input id="lp-manual-visita" type="text" value="—" readonly><small id="lp-manual-visita-note" class="lp-source-note">Solo lectura · ins_fl.fecha_visita</small></label><label>Fecha entrega cubos<input id="lp-manual-cubos" type="text" value="—" readonly><small id="lp-manual-cubos-note" class="lp-source-note">Solo lectura · ins_fl.fecha_posible_recepcion_cubo</small></label><label>Estatus Logística<input id="lp-manual-log-status" type="text" value="—" readonly><small id="lp-manual-log-status-note" class="lp-source-note">Solo lectura · log_ops.estatus</small></label></div>
 <label>Estatus Producción<select id="lp-manual-prod-status"><option value="">Cargando catálogo...</option></select></label><label>Fecha envío Docs a Fábrica<input id="lp-new-doc-date" type="date"></label><label>Fecha envío Pago a Fábrica<input id="lp-new-pay-date" type="date"></label><label class="wide">Comentario inicial<textarea id="lp-manual-comment" maxlength="5000" rows="4"></textarea></label><label>CPVO (máximo 2 · 25 MB por archivo)<input id="lp-manual-cpvo" type="file" multiple></label><label>GM (máximo 10 · 25 MB por archivo)<input id="lp-manual-gm" type="file" multiple></label><p class="lp-policy-note wide">Máximo total: 12 archivos activos. El límite de 25 MB se valida individualmente.</p><div class="lp-form-actions wide"><button id="lp-manual-cancel" class="lp-btn ghost" type="button" title="Descarta esta captura. No elimina, desactiva ni bloquea registros.">Cancelar registro</button><button id="lp-manual-save" class="lp-btn primary" type="button">Crear registro</button></div></section>`,`<button id="lp-cancel-new-header" class="lp-btn ghost" type="button" title="Descarta esta captura. No elimina, desactiva ni bloquea registros.">✕ Cancelar registro</button>`);
 ['project','advisor','supervisor'].forEach(bindManualPicker);bindPickerDismiss(view);
 try{await ensureManualData();}catch(e){alertMsg(e.message||'No fue posible cargar la captura Manual.');}
 syncManualProjectFields();
 $('lp-manual-cancel').onclick=cancelNewCapture;$('lp-cancel-new-header').onclick=cancelNewCapture;
 $('lp-manual-save').onclick=async()=>{const cpvo=[...$('lp-manual-cpvo').files],gm=[...$('lp-manual-gm').files];if(cpvo.length>2||gm.length>10)return alertMsg('Solo se permiten 2 archivos CPVO y 10 GM.');let payload;try{payload=manualPayload();}catch(error){return alertMsg(error.message);}setNewSaving(true);let createdId=null;try{const out=await json('/api/logistica/produccion','POST',payload);createdId=out.data.produccion.id_produccion;markProductionDirty();await uploadInitial(createdId,'CPVO',cpvo);await uploadInitial(createdId,'GM',gm);markProductionDirty();go('logistica-produccion-detalle',{id:createdId});}catch(error){if(createdId){markProductionDirty();window.alert('El registro se creó, pero no todos los archivos pudieron cargarse: '+error.message);go('logistica-produccion-detalle',{id:createdId});}else alertMsg(error.message);}finally{setNewSaving(false);}};
 view.querySelector('[data-lp-refresh]').onclick=()=>loadNew(view,false);
}

function statusOptions(selected){return '<option value="">Sin estatus</option>'+state.statuses.map(x=>`<option value="${x.id_catalogo}" ${String(x.id_catalogo)===String(selected)?'selected':''}>${esc(x.articulo)}</option>`).join('');}
function modeName(mode){return String(mode||'SEMI_AUTOMATICO')==='MANUAL'?'Manual':'Semi automático';}
function fieldSource(label,value,source='',conflict=false){return `<div class="lp-field ${conflict?'conflict':''}"><small>${esc(label)}</small><strong>${esc(value)}</strong>${source?`<span class="lp-field-source">${esc(source)}</span>`:''}${conflict?'<em>Valores distintos en FL</em>':''}</div>`;}
function existingManualSelection(kind,key,fallback){
  const cfg=kind==='project'?MANUAL_PROJECT:MANUAL_PICKERS[kind],
        rows=state.manual.lists[kind]||[],
        found=rows.find(row=>String(row[cfg.key])===String(key||''));
  return found||fallback||null;
}

function manualDetailPersonSelection(kind,storedId,visibleValues){
  const rows=state.manual.lists[kind]||[];
  const stored=storedId==null?'':String(storedId);

  if(stored){
    const byId=rows.find(row=>String(row.id_SB)===stored);
    if(byId)return byId;
  }

  const labels=(Array.isArray(visibleValues)?visibleValues:[visibleValues])
    .map(raw)
    .filter(Boolean);

  if(labels.length===1){
    const target=norm(labels[0]);

    const byVisibleValue=rows.find(row=>
      norm(row.nombre)===target ||
      norm(row.iniciales)===target
    );

    if(byVisibleValue)return byVisibleValue;
  }

  if(!stored && !labels.length)return null;

  const label=labels.join(', ');

  return {
    id_SB:storedId||null,
    nombre:label,
    iniciales:label,
    rol:stored?'Referencia guardada':'Referencia existente'
  };
}

function prepareManualDetailSelections(p,fl){
  const projectFallback={
    id_log_ops:p.id_log_ops,
    proyecto:p.proyecto||'',
    id_ppns:p.ppns||'',
    pvo:p.fecha_pvo||'',
    fechas_visita:p.fechas_visita||p.fecha_visita||'',
    fechas_cubos:p.fechas_cubos||p.fecha_cubos||'',
    estatus:p.estatus_logistica||'',
    ya_registrado:1
  };

  state.manual.selected.project=
    existingManualSelection('project',p.id_log_ops,projectFallback);

  if(
    state.manual.selected.project &&
    state.manual.selected.project.id_log_ops!=null &&
    !state.manual.lists.project.some(
      row=>String(row.id_log_ops)===String(state.manual.selected.project.id_log_ops)
    )
  ){
    state.manual.lists.project.unshift(state.manual.selected.project);
  }

  state.manual.selected.advisor=
    manualDetailPersonSelection('advisor',p.id_asesor,fl.asesores);

  state.manual.selected.supervisor=
    manualDetailPersonSelection('supervisor',p.id_supervisor,fl.supervisores);
}
function semiDetailEditForm(p){return `<form id="lp-edit-form" class="lp-form compact" hidden><div class="lp-detail-mode-note wide"><strong>Registro histórico Semi automático</strong><span>La captura nueva está limitada a modo Manual. Este registro conserva su modo de origen.</span></div><label>Estatus Producción<select id="lp-edit-status">${statusOptions(p.id_estatus_produccion)}</select></label><label>Fecha envío Docs a Fábrica<input id="lp-doc-date" type="date" value="${escRaw(fmt(p.fecha_envio_docs_fabrica)==='—'?'':fmt(p.fecha_envio_docs_fabrica))}"></label><label>Fecha envío Pago a Fábrica<input id="lp-pay-date" type="date" value="${escRaw(fmt(p.fecha_envio_pago_fabrica)==='—'?'':fmt(p.fecha_envio_pago_fabrica))}"></label><label class="wide">Comentario<textarea id="lp-edit-comment" maxlength="5000" rows="4">${escRaw(p.comentario||'')}</textarea></label><div id="lp-edit-feedback" class="wide" aria-live="polite"></div><div class="lp-form-actions wide"><button id="lp-edit-cancel" class="lp-btn ghost" type="button">Cancelar cambios</button><button class="lp-btn primary" type="submit">Guardar cambios</button></div></form>`;}
function manualDetailEditForm(p){return `<form id="lp-edit-form" class="lp-form compact" hidden><div class="lp-detail-mode-note wide"><strong>Modo Manual</strong><span>Proyecto se relaciona por id_log_ops. PVO, Visita, Cubos y Estatus Logística se consultan desde sus fuentes y no son editables aquí.</span></div><label class="wide">Proyecto *<select id="lp-manual-project-select">${manualProjectSelectOptions()}</select></label><label>Asesor *<div class="lp-combobox"><input id="lp-manual-advisor-search" type="search" autocomplete="off" placeholder="Buscar asesor, gerente o director" role="combobox" aria-autocomplete="list" aria-controls="lp-manual-advisor-list" aria-expanded="false"><div id="lp-manual-advisor-list" class="lp-options lp-picker-options" role="listbox" hidden></div></div><small id="lp-manual-advisor-meta" class="lp-picker-meta"></small></label><label>Supervisor *<div class="lp-combobox"><input id="lp-manual-supervisor-search" type="search" autocomplete="off" placeholder="Buscar supervisor o superintendente" role="combobox" aria-autocomplete="list" aria-controls="lp-manual-supervisor-list" aria-expanded="false"><div id="lp-manual-supervisor-list" class="lp-options lp-picker-options" role="listbox" hidden></div></div><small id="lp-manual-supervisor-meta" class="lp-picker-meta"></small></label><div class="lp-manual-source-grid wide"><label>Fecha PVO<input id="lp-manual-pvo" type="text" readonly><small id="lp-manual-pvo-note" class="lp-source-note"></small></label><label>Fecha de Visita<input id="lp-manual-visita" type="text" readonly><small id="lp-manual-visita-note" class="lp-source-note"></small></label><label>Fecha entrega cubos<input id="lp-manual-cubos" type="text" readonly><small id="lp-manual-cubos-note" class="lp-source-note"></small></label><label>Estatus Logística<input id="lp-manual-log-status" type="text" readonly><small id="lp-manual-log-status-note" class="lp-source-note"></small></label></div><label>Estatus Producción<select id="lp-manual-prod-status"></select></label><label>Fecha envío Docs a Fábrica<input id="lp-doc-date" type="date" value="${escRaw(fmt(p.fecha_envio_docs_fabrica)==='—'?'':fmt(p.fecha_envio_docs_fabrica))}"></label><label>Fecha envío Pago a Fábrica<input id="lp-pay-date" type="date" value="${escRaw(fmt(p.fecha_envio_pago_fabrica)==='—'?'':fmt(p.fecha_envio_pago_fabrica))}"></label><label class="wide">Comentario<textarea id="lp-edit-comment" maxlength="5000" rows="4">${escRaw(p.comentario||'')}</textarea></label><div id="lp-edit-feedback" class="wide" aria-live="polite"></div><div class="lp-form-actions wide"><button id="lp-edit-cancel" class="lp-btn ghost" type="button">Cancelar cambios</button><button class="lp-btn primary" type="submit">Guardar cambios</button></div></form>`;}
function hydrateManualDetailForm(p){const project=state.manual.selected.project,advisor=state.manual.selected.advisor,supervisor=state.manual.selected.supervisor;renderManualProjectSelect();bindManualProjectSelect();if($('lp-manual-advisor-search'))$('lp-manual-advisor-search').value=advisor?manualPickerLabel('advisor',advisor):'';if($('lp-manual-supervisor-search'))$('lp-manual-supervisor-search').value=supervisor?manualPickerLabel('supervisor',supervisor):'';renderManualSelectionMeta('project');renderManualSelectionMeta('advisor');renderManualSelectionMeta('supervisor');renderManualCatalogs();syncManualProjectFields(project||{pvo:p.fecha_pvo,fechas_visita:p.fechas_visita||p.fecha_visita,fechas_cubos:p.fechas_cubos||p.fecha_cubos,estatus:p.estatus_logistica});const prod=$('lp-manual-prod-status');if(prod)prod.value=p.id_estatus_produccion==null?'':String(p.id_estatus_produccion);['advisor','supervisor'].forEach(bindManualPicker);}
function normalizedInputDate(value){const text=fmt(value);return text==='—'?'':text;}
function commonEditPayload(p,statusId){const payload={},status=$(statusId)?.value||null,comment=$('lp-edit-comment')?.value||'',docDate=$('lp-doc-date')?.value||null,payDate=$('lp-pay-date')?.value||null,currentDoc=normalizedInputDate(p.fecha_envio_docs_fabrica)||null,currentPay=normalizedInputDate(p.fecha_envio_pago_fabrica)||null;if(String(status||'')!==String(p.id_estatus_produccion||''))payload.id_estatus_produccion=status;if(String(comment)!==String(p.comentario||''))payload.comentario=comment;if(String(docDate||'')!==String(currentDoc||''))payload.fecha_envio_docs_fabrica=docDate;if(String(payDate||'')!==String(currentPay||''))payload.fecha_envio_pago_fabrica=payDate;return payload;}
function semiEditPayload(p){return commonEditPayload(p,'lp-edit-status');}
function manualEditPayload(p){const payload=commonEditPayload(p,'lp-manual-prod-status'),project=state.manual.selected.project,advisor=state.manual.selected.advisor,supervisor=state.manual.selected.supervisor,currentProject=p.id_log_ops==null?'':String(p.id_log_ops),selectedProject=project&&project.id_log_ops!=null?String(project.id_log_ops):'',currentAdvisor=p.id_asesor==null?'':String(p.id_asesor),selectedAdvisor=advisor&&advisor.id_SB!=null?String(advisor.id_SB):'',currentSupervisor=p.id_supervisor==null?'':String(p.id_supervisor),selectedSupervisor=supervisor&&supervisor.id_SB!=null?String(supervisor.id_SB):'';if(selectedProject!==currentProject){if(!project||!project.id_log_ops)throw new Error('Selecciona un Proyecto válido de Logística.');if(Number(project.ya_registrado)===1&&String(project.id_log_ops)!==currentProject)throw new Error('El proyecto seleccionado ya tiene seguimiento activo de PVO-Producción.');payload.id_log_ops=project.id_log_ops;}if(selectedAdvisor!==currentAdvisor){if(!advisor||!advisor.id_SB)throw new Error('Selecciona un Asesor válido.');payload.id_asesor=advisor.id_SB;}if(selectedSupervisor!==currentSupervisor){if(!supervisor||!supervisor.id_SB)throw new Error('Selecciona un Supervisor válido.');payload.id_supervisor=supervisor.id_SB;}return payload;}
async function loadDetail(view,id){
 if(!id){shell(view,'Detalle de PVO-Producción','No se recibió un registro válido','');return alertMsg('Falta el identificador del registro.');}
 try{
  const [out,catalogs]=await Promise.all([req('/api/logistica/produccion/'+encodeURIComponent(id)),req('/api/logistica/produccion/manual/catalogos')]);
  state.detail=out.data;state.statuses=(catalogs.data&&Array.isArray(catalogs.data.estatus_produccion))?catalogs.data.estatus_produccion:[];
  if(String(state.detail.produccion.modo_registro||'SEMI_AUTOMATICO')==='MANUAL'){
   resetManualNewState();await ensureManualData();prepareManualDetailSelections(state.detail.produccion,state.detail.instalaciones||{});
  }
  renderDetail(view);
 }catch(e){shell(view,'Detalle de PVO-Producción','No fue posible abrir el registro','');alertMsg(e.message);}
}
function detailSummaryTable(p,fl){
 const fields=[
  ['Modo',modeName(p.modo_registro),'Origen del registro'],
  ['Proyecto',p.proyecto],
  ['Supervisor',(fl.supervisores||[]).join(', ')],
  ['Asesor',(fl.asesores||[]).join(', ')],
  ['Semana Registro','S'+String(p.semana_registro).padStart(2,'0')+' / '+p.anio_registro],
  ['Estatus Producción',p.estatus_produccion],
  ['PPNS',p.ppns],
  ['Fecha PVO',fmtDisplayDate(p.fecha_pvo)],
  ['Fecha de Visita',fmtDisplayDate(p.fechas_visita||p.fecha_visita)],
  ['Fecha entrega cubos',fmtDisplayDate(p.fechas_cubos||p.fecha_cubos)],
  ['Estatus Logística',p.estatus_logistica],
  ['Comentario',p.comentario]
 ];
 const cell=item=>`<th scope="row" class="lp-summary-label">${esc(item[0])}</th><td class="lp-summary-value"><strong>${esc(item[1])}</strong>${item[2]?`<small>${esc(item[2])}</small>`:''}</td>`;
 const rows=[];
 for(let i=0;i<fields.length;i+=2)rows.push(`<tr>${cell(fields[i])}${fields[i+1]?cell(fields[i+1]):'<th></th><td></td>'}</tr>`);
 return `<div class="lp-summary-table-wrap"><table class="lp-summary-table" aria-label="Resumen del registro de PVO-Producción"><tbody>${rows.join('')}</tbody></table></div>`;
}
function isPdfFile(file){const mime=norm(file&&file.mime_type),ext=norm(file&&file.extension),name=norm(file&&(file.nombre_original||file.nombre_archivo));return mime==='APPLICATION/PDF'||ext==='PDF'||name.endsWith('.PDF');}
function pdfPreviewUrl(url,mode='thumb'){const value=raw(url);if(!value)return '';const fragment=mode==='modal'?'#page=1&view=FitV&toolbar=0&navpanes=0&scrollbar=1':'#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0';return value.split('#')[0]+fragment;}
function documentPreview(type,file){
 const name=raw(file.nombre_original||file.nombre_archivo)||`${type} ${file.numero_archivo}`;
 const url=raw(file.url_acceso),id=escRaw(file.id_archivo);
 let preview='<div class="lp-doc-preview-empty">Vista previa no disponible.</div>';
 if(url&&isPdfFile(file))preview=`<div class="lp-pdf-preview-window"><iframe src="${escRaw(pdfPreviewUrl(url))}" title="Hoja 1 de ${escRaw(name)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe><span>Hoja 1</span></div>`;
 else if(url)preview='<div class="lp-doc-preview-empty">Vista previa disponible únicamente para archivos PDF.</div>';
 const hit=url?`<button class="lp-doc-preview-hitbox" data-doc-preview-id="${id}" type="button" aria-label="Ampliar vista previa de ${escRaw(name)}"></button>`:'';
 const open=url?`<button class="lp-link lp-doc-preview-inline" data-doc-preview-id="${id}" type="button">Ampliar vista previa</button>`:'<span>Sin enlace de lectura</span>';
 return `<article class="lp-doc-preview"><div class="lp-doc-preview-head"><button class="lp-doc-preview-title" data-doc-preview-id="${id}" type="button" ${url?'':'disabled'}><strong>${esc(type)} ${esc(file.numero_archivo)}</strong><small>${esc(name)}</small></button><button data-file-delete="${id}" type="button">Eliminar</button></div><div class="lp-doc-preview-clickable">${preview}${hit}</div><div class="lp-doc-preview-actions">${open}<small>Click para ampliar · hoja 1.</small></div></article>`;
}
function documentModalShell(){return `<div id="lp-doc-modal" class="lp-doc-modal" hidden aria-hidden="true"><div class="lp-doc-modal-backdrop" data-doc-modal-close></div><section class="lp-doc-modal-panel" role="dialog" aria-modal="true" aria-labelledby="lp-doc-modal-title"><header class="lp-doc-modal-header"><div><small id="lp-doc-modal-kind">Documento</small><h3 id="lp-doc-modal-title">Vista previa</h3></div><button class="lp-doc-modal-close" data-doc-modal-close type="button" aria-label="Cerrar vista previa">×</button></header><div id="lp-doc-modal-body" class="lp-doc-modal-body"></div><footer class="lp-doc-modal-footer"><span id="lp-doc-modal-note">Vista previa fija de la primera hoja.</span><div class="lp-doc-modal-actions"><a id="lp-doc-modal-download" class="lp-btn ghost" href="#" hidden>⬇ Descargar</a><a id="lp-doc-modal-open" class="lp-btn primary" href="#" target="_blank" rel="noopener noreferrer" hidden>↗ Abrir documento</a></div></footer></section></div>`;}
function closeDocumentModal(restoreFocus=true){
 const modal=$('lp-doc-modal');
 if(modal){
  const frame=modal.querySelector('iframe');if(frame)frame.src='about:blank';
  modal.hidden=true;modal.setAttribute('aria-hidden','true');
 }
 document.documentElement.classList.remove('lp-doc-preview-open');
 if(state.docPreviewKeyHandler){document.removeEventListener('keydown',state.docPreviewKeyHandler);state.docPreviewKeyHandler=null;}
 const last=state.docPreviewLastFocus;state.docPreviewLastFocus=null;
 if(restoreFocus&&last&&typeof last.focus==='function'&&document.contains(last)){try{last.focus();}catch(_e){}}
}
function openDocumentModal(file){
 const modal=$('lp-doc-modal');if(!modal||!file)return;
 closeDocumentModal(false);
 const name=raw(file.nombre_original||file.nombre_archivo)||'Documento';
 const url=raw(file.url_acceso),downloadUrl=raw(file.url_descarga);
 const title=$('lp-doc-modal-title'),kind=$('lp-doc-modal-kind'),body=$('lp-doc-modal-body'),note=$('lp-doc-modal-note'),download=$('lp-doc-modal-download'),open=$('lp-doc-modal-open');
 if(title)title.textContent=name;
 if(kind)kind.textContent=`${raw(file.tipo_archivo)||'Documento'} ${file.numero_archivo||''}`.trim();
 if(body){
  if(url&&isPdfFile(file))body.innerHTML=`<div class="lp-doc-modal-viewer"><iframe src="${escRaw(pdfPreviewUrl(url,'modal'))}" title="Vista previa hoja 1 de ${escRaw(name)}" tabindex="0"></iframe><span class="lp-doc-modal-page-chip">Hoja 1</span></div>`;
  else body.innerHTML='<div class="lp-doc-modal-empty">La vista previa ampliada está disponible únicamente para archivos PDF.</div>';
 }
 if(note)note.textContent=url&&isPdfFile(file)?'Hoja 1 ajustada al alto. Puedes desplazar o hacer zoom dentro del visor si el navegador lo requiere.':'Vista previa no disponible para este tipo de archivo.';
 if(download){download.hidden=!downloadUrl;if(downloadUrl){download.href=downloadUrl;download.setAttribute('download',name);}else{download.removeAttribute('href');download.removeAttribute('download');}}
 if(open){open.hidden=!url;if(url)open.href=url;else open.removeAttribute('href');}
 state.docPreviewLastFocus=document.activeElement;
 modal.hidden=false;modal.setAttribute('aria-hidden','false');document.documentElement.classList.add('lp-doc-preview-open');
 state.docPreviewKeyHandler=event=>{if(event.key==='Escape'){event.preventDefault();closeDocumentModal();}};
 document.addEventListener('keydown',state.docPreviewKeyHandler);
 const close=modal.querySelector('.lp-doc-modal-close');if(close)requestAnimationFrame(()=>close.focus());
}
function bindDocumentPreview(view){
 view.querySelectorAll('[data-doc-preview-id]').forEach(control=>control.onclick=event=>{event.preventDefault();event.stopPropagation();const file=(state.detail&&state.detail.archivos||[]).find(item=>String(item.id_archivo)===String(control.dataset.docPreviewId));if(file)openDocumentModal(file);});
 view.querySelectorAll('[data-doc-modal-close]').forEach(control=>control.onclick=event=>{event.preventDefault();closeDocumentModal();});
}
function renderDetail(view){closeDocumentModal(false);const d=state.detail,p=d.produccion,fl=d.instalaciones||{},files=d.archivos||[];const cpvo=files.filter(x=>x.tipo_archivo==='CPVO'),gm=files.filter(x=>x.tipo_archivo==='GM'),manual=String(p.modo_registro||'SEMI_AUTOMATICO')==='MANUAL';const summary=detailSummaryTable(p,fl);const editForm=manual?manualDetailEditForm(p):semiDetailEditForm(p);const canInstall=Boolean(raw(p.ppns));shell(view,p.proyecto||'Detalle',`PPNS ${p.ppns||'—'} · PVO-Producción · ${modeName(p.modo_registro)}`,`<section class="lp-card"><div class="lp-detail-title"><div><h2>Resumen</h2><span class="lp-mode-badge ${manual?'manual':'semi'}">${esc(modeName(p.modo_registro))}</span></div><button id="lp-edit" class="lp-btn" type="button">✏️ Editar</button></div>${summary}${editForm}</section><section class="lp-card"><div class="lp-detail-title"><div><h2>Zona de carga</h2><p>CPVO ${cpvo.length}/2 · GM ${gm.length}/10 · Click en un documento para ampliar la hoja 1</p></div></div><div class="lp-upload-grid">${uploadBlock('CPVO',2,cpvo)}${uploadBlock('GM',10,gm)}</div></section>${documentModalShell()}`,`<button id="lp-install" class="lp-btn" type="button" ${canInstall?'':'disabled title="El registro no tiene PPNS para abrir Instalaciones"'}>🏗️ Ver en Instalaciones</button>`);if(manual)hydrateManualDetailForm(p);bindDetail(view,p.id_produccion);}
function uploadBlock(type,max,files){return `<div class="lp-upload"><h3>${type}</h3><div class="lp-doc-preview-grid">${files.length?files.map(f=>documentPreview(type,f)).join(''):'<div class="lp-doc-preview-empty">Sin archivos</div>'}</div><form data-upload="${type}"><label>Slot<select name="numero_archivo">${Array.from({length:max},(_,i)=>`<option value="${i+1}">${type} ${i+1}</option>`).join('')}</select></label><label>Archivo (máximo 25 MB por archivo)<input name="archivo" type="file" required></label><button class="lp-btn" type="submit">＋ Cargar / reemplazar</button></form></div>`;}
function detailEditMsg(message,type='error'){const host=$('lp-edit-feedback');if(host){host.innerHTML=`<div class="lp-alert ${type}">${esc(message)}</div>`;return;}alertMsg(message,type);}
function clearDetailEditMsg(){const host=$('lp-edit-feedback');if(host)host.innerHTML='';}
function setDetailSaving(form,busy){
 if(!form)return;
 form.dataset.saving=busy?'1':'0';
 form.setAttribute('aria-busy',busy?'true':'false');
 const save=form.querySelector('button[type="submit"]'),cancel=$('lp-edit-cancel');
 if(save){
  if(!save.dataset.defaultLabel)save.dataset.defaultLabel=save.textContent||'Guardar cambios';
  save.disabled=Boolean(busy);
  save.textContent=busy?'Guardando...':save.dataset.defaultLabel;
 }
 if(cancel)cancel.disabled=Boolean(busy);
}
async function refreshDetailAfterSave(view,id){
 const fresh=await req('/api/logistica/produccion/'+encodeURIComponent(id));
 state.detail=fresh.data;
 if(String(state.detail.produccion.modo_registro||'')==='MANUAL')prepareManualDetailSelections(state.detail.produccion,state.detail.instalaciones||{});
 renderDetail(view);
 alertMsg('Cambios guardados correctamente.','ok');
}
function bindDetail(view,id){
 const p=state.detail.produccion,manual=String(p.modo_registro||'SEMI_AUTOMATICO')==='MANUAL',install=$('lp-install');
 if(install&&!install.disabled)install.onclick=()=>go('instalaciones-proyectos',{id:p.ppns});
 $('lp-edit').onclick=()=>{clearAlert();clearDetailEditMsg();$('lp-edit-form').hidden=false;$('lp-edit').hidden=true;};
 $('lp-edit-cancel').onclick=()=>renderDetail(view);
 if(manual)bindPickerDismiss(view);
 bindDocumentPreview(view);
 const editForm=$('lp-edit-form');
 editForm.onsubmit=async e=>{
  e.preventDefault();
  if(editForm.dataset.saving==='1')return;
  clearAlert();clearDetailEditMsg();
  let payload;
  if(manual){try{payload=manualEditPayload(p);}catch(error){return detailEditMsg(error.message);}}
  else payload=semiEditPayload(p);
  if(!Object.keys(payload).length)return detailEditMsg('No hay cambios por guardar.','ok');
  setDetailSaving(editForm,true);
  try{
   await json('/api/logistica/produccion/'+encodeURIComponent(id),'PATCH',payload);
   markProductionDirty();
   await refreshDetailAfterSave(view,id);
  }catch(err){
   if(editForm.isConnected)setDetailSaving(editForm,false);
   detailEditMsg(err.message||'No fue posible guardar los cambios.');
  }
 };
 view.querySelectorAll('[data-upload]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const data=new FormData(form);data.set('tipo_archivo',form.dataset.upload);try{await req('/api/logistica/produccion/'+id+'/archivos',{method:'POST',body:data});markProductionDirty();const fresh=await req('/api/logistica/produccion/'+id);state.detail=fresh.data;if(String(state.detail.produccion.modo_registro||'')==='MANUAL')prepareManualDetailSelections(state.detail.produccion,state.detail.instalaciones||{});renderDetail(view);}catch(err){alertMsg(err.message);}});
 view.querySelectorAll('[data-file-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm('¿Eliminar este archivo del registro?'))return;try{await req('/api/logistica/produccion/'+id+'/archivos/'+btn.dataset.fileDelete,{method:'DELETE'});markProductionDirty();const fresh=await req('/api/logistica/produccion/'+id);state.detail=fresh.data;if(String(state.detail.produccion.modo_registro||'')==='MANUAL')prepareManualDetailSelections(state.detail.produccion,state.detail.instalaciones||{});renderDetail(view);}catch(err){alertMsg(err.message);}});
 view.querySelector('[data-lp-refresh]').onclick=()=>loadDetail(view,id);
}
const LP_TABLE_PAGE_SIZE=30;
function lpPage(rows,page){const data=Array.isArray(rows)?rows:[],pages=Math.max(1,Math.ceil(data.length/LP_TABLE_PAGE_SIZE)),current=Math.min(Math.max(1,Number(page)||1),pages),start=(current-1)*LP_TABLE_PAGE_SIZE;return {rows:data.slice(start,start+LP_TABLE_PAGE_SIZE),page:current,pages,total:data.length,start,end:Math.min(start+LP_TABLE_PAGE_SIZE,data.length)};}
function lpRenderPager(hostId,rows,page,onChange){const host=$(hostId);if(!host)return page;const info=lpPage(rows,page);if(!info.total){host.innerHTML='';return info.page;}host.innerHTML=`<div class="lp-actions"><span>${info.start+1}-${info.end} de ${info.total}</span><button class="lp-btn ghost" type="button" data-lp-page-prev ${info.page<=1?'disabled':''}>← Anterior</button><span>Página ${info.page} de ${info.pages}</span><button class="lp-btn ghost" type="button" data-lp-page-next ${info.page>=info.pages?'disabled':''}>Siguiente →</button></div>`;const prev=host.querySelector('[data-lp-page-prev]'),next=host.querySelector('[data-lp-page-next]');if(prev&&!prev.disabled)prev.onclick=()=>onChange(info.page-1);if(next&&!next.disabled)next.onclick=()=>onChange(info.page+1);return info.page;}
function lpBindDetailActions(view){view.querySelectorAll('[data-detail]').forEach(button=>button.onclick=()=>go('logistica-produccion-detalle',{id:button.dataset.detail}));}
async function loadPvo(view){shell(view,'PVO','Control de integridad: CPVO + Fecha PVO + Fecha de Visita.',`<section class="lp-card"><h2>PVO completos</h2><div class="lp-table-wrap"><table class="lp-table"><thead><tr><th>Proyecto</th><th>PPNS</th><th>CPVO</th><th>Fecha PVO</th><th>Fecha de Visita</th><th>Supervisor</th><th>Asesor</th><th>Acción</th></tr></thead><tbody id="lp-pvo-ok"></tbody></table></div><div id="lp-pvo-ok-pager"></div></section><section class="lp-card"><h2>Faltan datos PVO</h2><div class="lp-table-wrap"><table class="lp-table"><thead><tr><th>Proyecto</th><th>PPNS</th><th>CPVO</th><th>Fecha PVO</th><th>Fecha de Visita</th><th>Falta</th><th>Acción</th></tr></thead><tbody id="lp-pvo-missing"></tbody></table></div><div id="lp-pvo-missing-pager"></div></section>`);let okRows=[],missingRows=[],okPage=1,missingPage=1;const render=()=>{const okInfo=lpPage(okRows,okPage);okPage=okInfo.page;$('lp-pvo-ok').innerHTML=okInfo.rows.length?okInfo.rows.map(pvoRow).join(''):empty(8,'Sin PVO completos.');okPage=lpRenderPager('lp-pvo-ok-pager',okRows,okPage,page=>{okPage=page;render();});const missingInfo=lpPage(missingRows,missingPage);missingPage=missingInfo.page;$('lp-pvo-missing').innerHTML=missingInfo.rows.length?missingInfo.rows.map(r=>{const faltan=[];if(!r.pvo.cpvo)faltan.push('CPVO');if(!r.pvo.pvo_log)faltan.push('PVO Log');if(!r.pvo.pvo_fl)faltan.push('Fecha de Visita');return `<tr><td>${esc(r.proyecto)}</td><td>${esc(r.ppns)}</td><td>${r.pvo.cpvo?'✅':'❌'}</td><td>${r.pvo.pvo_log?'✅':'❌'}</td><td>${r.pvo.pvo_fl?'✅':'❌'}</td><td>${esc(faltan.join(' / '))}</td><td><button class="lp-link" data-detail="${r.id_produccion}">Ver / Gestionar</button></td></tr>`;}).join(''):empty(7,'Sin faltantes PVO.');missingPage=lpRenderPager('lp-pvo-missing-pager',missingRows,missingPage,page=>{missingPage=page;render();});lpBindDetailActions(view);};const load=async()=>{try{const [ok,missing]=await Promise.all([req('/api/logistica/produccion/pvo/completos'),req('/api/logistica/produccion/pvo/faltantes')]);okRows=Array.isArray(ok.data)?ok.data:[];missingRows=Array.isArray(missing.data)?missing.data:[];okPage=1;missingPage=1;render();}catch(e){alertMsg(e.message);}};view.querySelector('[data-lp-refresh]').onclick=load;await load();}
function pvoRow(r){return `<tr><td>${esc(r.proyecto)}</td><td>${esc(r.ppns)}</td><td>✅ ${r.cpvo_count}/2</td><td>✅ ${fmtDisplayDate(r.fecha_pvo)}</td><td>✅ ${esc(fmtDisplayDate(r.fechas_visita||r.fechas_pvo_fl))}</td><td>${esc(r.supervisores)}</td><td>${esc(r.asesores)}</td><td><button class="lp-link" data-detail="${r.id_produccion}">Ver / Gestionar</button></td></tr>`;}
async function loadDocuments(view){shell(view,'Documentos de Producción','Consulta documental; la carga y manipulación se realiza en el Detalle de Producción.',`<section class="lp-card lp-toolbar"><input id="lp-doc-q" type="search" placeholder="Buscar Proyecto, PPNS, tipo o documento"></section><section class="lp-card"><h2>Documentos</h2><div class="lp-table-wrap"><table class="lp-table"><thead><tr><th>Proyecto</th><th>PPNS</th><th>Tipo</th><th>Documento</th><th>Fecha de carga</th><th>Usuario</th><th>Acción</th></tr></thead><tbody id="lp-docs"></tbody></table></div><div id="lp-docs-pager"></div></section><section class="lp-card"><h2>Faltan documentos <span class="lp-rule">regla provisional</span></h2><div class="lp-table-wrap"><table class="lp-table"><thead><tr><th>Proyecto</th><th>PPNS</th><th>CPVO</th><th>GM</th><th>Pendiente</th><th>Acción</th></tr></thead><tbody id="lp-docs-missing"></tbody></table></div><div id="lp-docs-missing-pager"></div></section>`);let docRows=[],missingRows=[],docPage=1,missingPage=1;const render=()=>{const docInfo=lpPage(docRows,docPage);docPage=docInfo.page;$('lp-docs').innerHTML=docInfo.rows.length?docInfo.rows.map(r=>`<tr><td>${esc(r.proyecto)}</td><td>${esc(r.ppns)}</td><td>${esc(r.tipo_archivo)} ${r.numero_archivo}</td><td>${esc(r.nombre_original||r.nombre_archivo)}</td><td>${fmtHumanDateTime(r.created_at)}</td><td>${esc(r.usuario_iniciales)}</td><td><button class="lp-link" data-detail="${r.id_produccion}">Ver / Gestionar</button></td></tr>`).join(''):empty(7,'Sin documentos.');docPage=lpRenderPager('lp-docs-pager',docRows,docPage,page=>{docPage=page;render();});const missingInfo=lpPage(missingRows,missingPage);missingPage=missingInfo.page;$('lp-docs-missing').innerHTML=missingInfo.rows.length?missingInfo.rows.map(r=>`<tr><td>${esc(r.proyecto)}</td><td>${esc(r.ppns)}</td><td>${r.cpvo_count}/2</td><td>${r.gm_count}/10</td><td>💾 Sin archivos activos</td><td><button class="lp-link" data-detail="${r.id_produccion}">Ver / Gestionar</button></td></tr>`).join(''):empty(6,'Sin faltantes documentales.');missingPage=lpRenderPager('lp-docs-missing-pager',missingRows,missingPage,page=>{missingPage=page;render();});lpBindDetailActions(view);};const load=async()=>{try{const q=$('lp-doc-q').value.trim(),suffix=q?'?q='+encodeURIComponent(q):'';const [docs,missing]=await Promise.all([req('/api/logistica/produccion/documentos'+suffix),req('/api/logistica/produccion/documentos/faltantes'+suffix)]);docRows=Array.isArray(docs.data)?docs.data:[];missingRows=Array.isArray(missing.data)?missing.data:[];docPage=1;missingPage=1;render();}catch(e){alertMsg(e.message);}};$('lp-doc-q').oninput=()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(load,250);};view.querySelector('[data-lp-refresh]').onclick=load;await load();}
async function init(route,payload){closeDocumentModal(false);releasePickerDismiss();const view=$('view-'+route);if(!view)return;try{if(route==='logistica-produccion')await loadMain(view);else if(route==='logistica-produccion-nuevo')await loadNew(view);else if(route==='logistica-produccion-detalle')await loadDetail(view,payload&&payload.id);else if(route==='logistica-pvo')await loadPvo(view);else if(route==='logistica-documentos')await loadDocuments(view);}catch(e){alertMsg(e.message);}}
window.ManttoLogisticaProduccion={init};
})();
