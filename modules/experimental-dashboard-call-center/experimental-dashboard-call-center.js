(function(){
  'use strict';
  const ROUTE_UNI='experimental-dashboard-call-center';
  const ENDPOINT_UNI='/api/experimental/dashboard-call-center';
  const state_uni={initialized:false,loading:false,data:null,filterKey:'',search:'',status:''};
  const $=id=>document.getElementById(id);
  const esc_uni=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm_uni=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const apiBase_uni=()=>String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');

  async function request_uni(path){
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function') return window.ManttoAuth.api(path,{method:'GET'});
    const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
    const r=await fetch(apiBase_uni()+path,{headers});
    const data=await r.json().catch(()=>({ok:false,message:'Respuesta inválida del backend'}));
    if(!r.ok||!data.ok) throw new Error(data.message||'Error consultando Dashboard Call Center');
    return data;
  }

  function isoLocal_uni(date){
    const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function layout_uni(){
    const root=$('view-'+ROUTE_UNI); if(!root)return false;
    root.innerHTML=`<div class="ccx-uni-page">
      <section class="ccx-uni-head"><div><p>☎️ Experimental · United</p><h1>Dashboard Call Center</h1><span>Lectura operativa de tickets usando la información actual de Mantto Gestor.</span></div><button id="ccx-refresh" type="button">↻ Actualizar</button></section>
      <section class="ccx-uni-filters"><label>Desde<input id="ccx-from" type="date"></label><label>Hasta<input id="ccx-to" type="date"></label><label>Zona<select id="ccx-zona"><option value="">Todas</option></select></label><button id="ccx-apply" type="button">Aplicar</button><button id="ccx-clear" type="button" class="soft">Mes actual</button><span id="ccx-updated"></span></section>
      <div id="ccx-feedback" class="ccx-uni-feedback" hidden></div>
      <section class="ccx-uni-kpis" id="ccx-kpis"></section>
      <section class="ccx-uni-grid">
        <article class="ccx-uni-card"><header><h2>Responsabilidad</h2></header><div id="ccx-resp" class="ccx-uni-bars"></div></article>
        <article class="ccx-uni-card"><header><h2>Vo.Bo. supervisor</h2></header><div id="ccx-vobo" class="ccx-uni-bars"></div></article>
        <article class="ccx-uni-card"><header><h2>Tickets por zona</h2></header><div id="ccx-zonas" class="ccx-uni-bars"></div></article>
        <article class="ccx-uni-card"><header><h2>Tipo de equipo</h2></header><div id="ccx-tipos" class="ccx-uni-bars"></div></article>
      </section>
      <section class="ccx-uni-card"><header><div><h2>Equipos críticos</h2><small>3 o más fallas BLT dentro del período seleccionado</small></div><span id="ccx-critical-count"></span></header><div class="ccx-uni-table-wrap"><table><thead><tr><th>Equipo</th><th>Proyecto</th><th>Ciudad</th><th>Zona</th><th>Fallas BLT</th><th>Último ticket</th></tr></thead><tbody id="ccx-critical-body"></tbody></table></div></section>
      <section class="ccx-uni-card"><header><div><h2>Tickets del período</h2><small id="ccx-table-caption">Sin filtro adicional</small></div><div class="ccx-uni-table-tools"><input id="ccx-search" type="search" placeholder="Buscar ticket, equipo, proyecto..."><select id="ccx-status"><option value="">Todos los estados</option><option value="abierto">Abiertos</option><option value="en_curso">En curso</option><option value="cerrado">Cerrados</option></select><button id="ccx-reset-table" class="soft" type="button">Quitar filtro KPI</button></div></header><div class="ccx-uni-table-wrap"><table><thead><tr><th>Ticket</th><th>Estado</th><th>Proyecto</th><th>Equipo</th><th>Zona</th><th>Fecha</th><th>Responsabilidad</th><th>Vo.Bo.</th><th>SLA</th><th>Equipo final</th></tr></thead><tbody id="ccx-ticket-body"></tbody></table></div></section>
    </div>`;
    bind_uni(); return true;
  }

  function feedback_uni(msg,error){const el=$('ccx-feedback');if(!el)return;el.hidden=!msg;el.textContent=msg||'';el.dataset.error=error?'1':'0';}
  function status_uni(v){const s=norm_uni(v);if(s.includes('cerr'))return'cerrado';if(s.includes('curso')||s.includes('proceso'))return'en_curso';if(s.includes('abier')||s.includes('pend'))return'abierto';return'otro';}
  function resp_uni(v){const s=norm_uni(v);if(s.includes('blt')||s.includes('correctivo'))return'blt';if(s.includes('client'))return'cliente';return'otro';}
  function sla_uni(t){const x=norm_uni(t.ticket_excede);if(x&&x!=='null'&&x!=='no'&&x!=='0')return true;const n=Number(t.tiempo_llegada_ii);return Number.isFinite(n)&&n>0;}
  function noFunc_uni(t){return norm_uni(t.estatus_equipo_final).includes('no func');}

  function kpiCard_uni(key,label,value,sub,tone){return `<button class="ccx-uni-kpi ${tone||''}" data-kpi="${key}" type="button"><small>${esc_uni(label)}</small><strong>${Number(value||0).toLocaleString('es-MX')}</strong><span>${esc_uni(sub||'')}</span></button>`;}
  function renderKpis_uni(){
    const s=state_uni.data.summary||{},e=s.estados||{},v=s.vobo||{},r=s.responsabilidad||{};
    const total=Number(s.total||0),val=Number(v.validado||0);
    $('ccx-kpis').innerHTML=[
      kpiCard_uni('','Tickets',total,'Período seleccionado','primary'),
      kpiCard_uni('cerrados','Cerrados',e.cerrados,'Estado ticket','good'),
      kpiCard_uni('en_curso','En curso',e.en_curso,'Estado ticket','warn'),
      kpiCard_uni('abiertos','Abiertos',e.abiertos,'Estado ticket','warn'),
      kpiCard_uni('vobo','Vo.Bo. validado',val,total?Math.round(val/total*100)+'% del total':'0%','good'),
      kpiCard_uni('pendiente','Vo.Bo. pendiente',v.pendiente,'Sin validación final','warn'),
      kpiCard_uni('sla','Fuera de SLA',s.fuera_sla,'Atención excedida','bad'),
      kpiCard_uni('equipos','Equipos',s.equipos_unicos,'Códigos únicos',''),
      kpiCard_uni('criticos','Críticos',s.equipos_criticos,'≥ 3 fallas BLT','bad'),
      kpiCard_uni('nofunc','No funcionando',s.no_funcionando,'Estatus final','bad'),
      kpiCard_uni('blt','Responsabilidad BLT',r.blt,'Tickets BLT',''),
      kpiCard_uni('cliente','Responsabilidad cliente',r.cliente,'Tickets cliente','')
    ].join('');
    $('ccx-kpis').querySelectorAll('[data-kpi]').forEach(b=>b.onclick=()=>{state_uni.filterKey=b.dataset.kpi||'';renderTickets_uni();});
  }

  function bars_uni(id,items,total){
    const el=$(id),arr=Array.isArray(items)?items:[]; const max=Math.max(1,...arr.map(x=>Number(x.value||0)));
    el.innerHTML=arr.slice(0,10).map(x=>`<div class="ccx-uni-bar"><div><span>${esc_uni(x.label)}</span><b>${Number(x.value||0).toLocaleString('es-MX')}</b></div><i><em style="width:${Math.round(Number(x.value||0)/max*100)}%"></em></i><small>${total?Math.round(Number(x.value||0)/total*100):0}%</small></div>`).join('')||'<p class="empty">Sin datos</p>';
  }
  function renderCharts_uni(){
    const s=state_uni.data.summary||{},d=s.distribuciones||{},r=s.responsabilidad||{},v=s.vobo||{},total=Number(s.total||0);
    bars_uni('ccx-resp',[{label:'BLT',value:r.blt},{label:'Cliente',value:r.cliente},{label:'Otro / sin dato',value:r.otros}],total);
    bars_uni('ccx-vobo',[{label:'Validado',value:v.validado},{label:'Pendiente',value:v.pendiente},{label:'Rechazado',value:v.rechazado},{label:'Requiere información',value:v.requiere_informacion},{label:'Escalado',value:v.escalado}],total);
    bars_uni('ccx-zonas',d.zona,total); bars_uni('ccx-tipos',d.tipo_equipo,total);
  }
  function renderCritical_uni(){
    const rows=(state_uni.data.summary&&state_uni.data.summary.criticos)||[];$('ccx-critical-count').textContent=rows.length+' equipos';
    $('ccx-critical-body').innerHTML=rows.length?rows.map(r=>`<tr><td><b>${esc_uni(r.codigo_equipo||'—')}</b></td><td>${esc_uni(r.proyecto||'—')}</td><td>${esc_uni(r.ciudad||'—')}</td><td>${esc_uni(r.zona||'—')}</td><td><span class="ccx-uni-badge bad">${Number(r.fallas_blt||0)}</span></td><td>${esc_uni(String(r.ultimo_ticket||'—').slice(0,10))}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">Sin equipos críticos en el período.</td></tr>';
  }
  function matchesKpi_uni(t,key){if(!key)return true;if(['cerrados','en_curso','abiertos'].includes(key))return status_uni(t.estado_ticket)===(key==='cerrados'?'cerrado':key==='abiertos'?'abierto':'en_curso');if(key==='vobo')return norm_uni(t.vobo_estado)==='validado';if(key==='pendiente')return !norm_uni(t.vobo_estado)||norm_uni(t.vobo_estado)==='pendiente';if(key==='sla')return sla_uni(t);if(key==='nofunc')return noFunc_uni(t);if(key==='blt')return resp_uni(t.responsabilidad)==='blt';if(key==='cliente')return resp_uni(t.responsabilidad)==='cliente';if(key==='criticos'){const set=new Set(((state_uni.data.summary||{}).criticos||[]).map(x=>String(x.codigo_equipo)));return set.has(String(t.codigo_equipo||''));}return true;}
  function renderTickets_uni(){
    let rows=Array.isArray(state_uni.data.tickets)?state_uni.data.tickets:[]; const q=norm_uni(state_uni.search),st=state_uni.status;
    rows=rows.filter(t=>matchesKpi_uni(t,state_uni.filterKey)).filter(t=>!st||status_uni(t.estado_ticket)===st).filter(t=>!q||norm_uni([t.ticket,t.folio,t.proyecto,t.codigo_equipo,t.zona,t.descripcion,t.causa_falla].join(' ')).includes(q));
    const labels={cerrados:'Cerrados',en_curso:'En curso',abiertos:'Abiertos',vobo:'Vo.Bo. validado',pendiente:'Vo.Bo. pendiente',sla:'Fuera de SLA',criticos:'Equipos críticos',nofunc:'No funcionando',blt:'Responsabilidad BLT',cliente:'Responsabilidad cliente'};
    $('ccx-table-caption').textContent=(state_uni.filterKey?'Filtro: '+(labels[state_uni.filterKey]||state_uni.filterKey):'Sin filtro KPI')+' · '+rows.length.toLocaleString('es-MX')+' tickets';
    $('ccx-ticket-body').innerHTML=rows.length?rows.slice(0,1000).map(t=>`<tr><td><b>${esc_uni(t.ticket||t.folio||'—')}</b></td><td>${esc_uni(t.estado_ticket||'—')}</td><td>${esc_uni(t.proyecto||'—')}</td><td>${esc_uni(t.codigo_equipo||'—')}</td><td>${esc_uni(t.zona||'—')}</td><td>${esc_uni(String(t.fecha_reporte||'—').slice(0,10))}</td><td>${esc_uni(t.responsabilidad||'—')}</td><td>${esc_uni(t.vobo_estado||'Pendiente')}</td><td>${sla_uni(t)?'<span class="ccx-uni-badge bad">Excedido</span>':'—'}</td><td>${esc_uni(t.estatus_equipo_final||'—')}</td></tr>`).join(''):'<tr><td colspan="10" class="empty">Sin tickets para los filtros seleccionados.</td></tr>';
  }
  function render_uni(){renderKpis_uni();renderCharts_uni();renderCritical_uni();renderTickets_uni();const f=state_uni.data.selected_filters||{};$('ccx-updated').textContent='Actualizado '+new Date(state_uni.data.generated_at||Date.now()).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});const z=$('ccx-zona'),current=z.value;z.innerHTML='<option value="">Todas</option>'+((state_uni.data.filters&&state_uni.data.filters.zonas)||[]).map(x=>`<option value="${esc_uni(x)}">${esc_uni(x)}</option>`).join('');z.value=f.zona||current||'';}
  function query_uni(){const q=new URLSearchParams();if($('ccx-from').value)q.set('desde',$('ccx-from').value);if($('ccx-to').value)q.set('hasta',$('ccx-to').value);if($('ccx-zona').value)q.set('zona',$('ccx-zona').value);return q.toString();}
  async function load_uni(){if(state_uni.loading)return;state_uni.loading=true;feedback_uni('Cargando Dashboard Call Center...',false);try{state_uni.data=await request_uni(ENDPOINT_UNI+'?'+query_uni());state_uni.filterKey='';render_uni();feedback_uni('',false);}catch(e){feedback_uni(e.message,true);}finally{state_uni.loading=false;}}
  function setMonth_uni(){const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);$('ccx-from').value=isoLocal_uni(first);$('ccx-to').value=isoLocal_uni(now);$('ccx-zona').value='';}
  function bind_uni(){$('ccx-refresh').onclick=load_uni;$('ccx-apply').onclick=load_uni;$('ccx-clear').onclick=()=>{setMonth_uni();load_uni();};$('ccx-search').oninput=e=>{state_uni.search=e.target.value;renderTickets_uni();};$('ccx-status').onchange=e=>{state_uni.status=e.target.value;renderTickets_uni();};$('ccx-reset-table').onclick=()=>{state_uni.filterKey='';state_uni.search='';state_uni.status='';$('ccx-search').value='';$('ccx-status').value='';renderTickets_uni();};}
  async function init_uni(){if(!state_uni.initialized){if(!layout_uni())return false;setMonth_uni();state_uni.initialized=true;}await load_uni();return true;}
  window.ManttoDashboardCallCenterExperimental_uni={init:init_uni};
})();
