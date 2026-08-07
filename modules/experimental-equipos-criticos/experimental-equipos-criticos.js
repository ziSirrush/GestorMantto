(function(){
  'use strict';
  const ROUTE_UNI='experimental-equipos-criticos';
  const ENDPOINT_UNI='/api/experimental/equipos-criticos';
  const state_uni={initialized:false,loading:false,page:1,pageSize:25,total:0,rows:[],criteria:null,filters:{zona:'',proyecto:'',search:''}};
  const $=id=>document.getElementById(id);
  const esc_uni=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const apiBase_uni=()=>String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
  async function request_uni(path){
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function') return window.ManttoAuth.api(path,{method:'GET'});
    const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
    const r=await fetch(apiBase_uni()+path,{headers}); const data=await r.json().catch(()=>({ok:false,message:'Respuesta inválida'}));
    if(!r.ok||!data.ok) throw new Error(data.message||'Error consultando backend'); return data;
  }
  function layout_uni(){
    const root=$('view-'+ROUTE_UNI); if(!root)return false;
    root.innerHTML=`<div class="ecx-uni-page">
      <section class="ecx-uni-head"><div><p>⚠️ Experimental · United</p><h1>Equipos Críticos</h1><span>Reincidencia de fallas con responsabilidad BLT usando las tablas actuales de Mantto Gestor.</span></div><button id="ecx-refresh" type="button">↻ Actualizar</button></section>
      <section class="ecx-uni-filters"><label>Zona<input id="ecx-zona" type="text" placeholder="Zona"></label><label>Proyecto<input id="ecx-proyecto" type="text" placeholder="Proyecto"></label><label>Buscar<input id="ecx-search" type="search" placeholder="Equipo, ticket o referencia"></label><button id="ecx-apply" type="button">Aplicar</button><button id="ecx-clear" type="button" class="soft">Limpiar</button></section>
      <section class="ecx-uni-summary"><article><small>Equipos críticos</small><strong id="ecx-total">—</strong></article><article><small>Criterio BLT</small><strong id="ecx-criteria">—</strong></article><article><small>Fuente</small><strong>tickets + portafolio</strong></article></section>
      <div id="ecx-feedback" class="ecx-uni-feedback" hidden></div>
      <section class="ecx-uni-card"><div class="ecx-uni-table-wrap"><table><thead><tr><th>Zona</th><th>Proyecto</th><th>Código</th><th>Ref. sitio</th><th>Estatus</th><th>Fallas BLT</th><th>Último BLT</th><th>MTBC</th><th></th></tr></thead><tbody id="ecx-body"></tbody></table></div><div class="ecx-uni-pages"><button id="ecx-prev">← Anterior</button><span id="ecx-page">—</span><button id="ecx-next">Siguiente →</button></div></section>
      <section id="ecx-detail" class="ecx-uni-detail" hidden><div class="ecx-uni-detail-panel"><header><div><small>Historial del período</small><h2 id="ecx-detail-title">Equipo</h2></div><button id="ecx-detail-close">×</button></header><div class="ecx-uni-table-wrap"><table><thead><tr><th>Ticket</th><th>Fecha</th><th>Estado</th><th>Proyecto</th><th>Responsabilidad</th><th>Causa</th></tr></thead><tbody id="ecx-detail-body"></tbody></table></div></div></section>
    </div>`;
    bind_uni(); return true;
  }
  function feedback_uni(msg,error){const el=$('ecx-feedback');if(!el)return;el.hidden=!msg;el.textContent=msg||'';el.dataset.error=error?'1':'0';}
  function params_uni(){const q=new URLSearchParams({page:String(state_uni.page),page_size:String(state_uni.pageSize)});Object.entries(state_uni.filters).forEach(([k,v])=>{if(v)q.set(k,v)});return q.toString();}
  function render_uni(){
    $('ecx-total').textContent=state_uni.total.toLocaleString('es-MX');
    const c=state_uni.criteria||{}; $('ecx-criteria').textContent=(c.min_fallas_blt||3)+' fallas / '+(c.dias||35)+' días';
    const body=$('ecx-body'); body.innerHTML=state_uni.rows.length?state_uni.rows.map(r=>`<tr><td>${esc_uni(r.zona||'—')}</td><td>${esc_uni(r.proyecto||'—')}</td><td><b>${esc_uni(r.codigo_equipo||'—')}</b></td><td>${esc_uni(r.referencia_en_sitio||'—')}</td><td>${esc_uni(r.estatus_servicio||'—')}</td><td><span class="ecx-uni-badge">${Number(r.fallas_blt_periodo||0)}</span></td><td>${esc_uni(String(r.ultimo_blt||'—').slice(0,10))}</td><td>${r.mtbc_dias==null?'—':esc_uni(r.mtbc_dias)+' d'}</td><td><button class="ecx-view" data-code="${esc_uni(r.codigo_equipo)}">Ver historial</button></td></tr>`).join(''):'<tr><td colspan="9" class="empty">Sin equipos críticos para el filtro actual.</td></tr>';
    body.querySelectorAll('.ecx-view').forEach(b=>b.addEventListener('click',()=>detail_uni(b.dataset.code)));
    const pages=Math.max(1,Math.ceil(state_uni.total/state_uni.pageSize)); $('ecx-page').textContent='Página '+state_uni.page+' de '+pages; $('ecx-prev').disabled=state_uni.page<=1; $('ecx-next').disabled=state_uni.page>=pages;
  }
  async function load_uni(page){if(state_uni.loading)return;state_uni.loading=true;state_uni.page=Math.max(1,page||1);feedback_uni('Cargando...',false);try{const d=await request_uni(ENDPOINT_UNI+'?'+params_uni());state_uni.rows=Array.isArray(d.data)?d.data:[];state_uni.total=Number(d.pagination&&d.pagination.total||0);state_uni.criteria=d.criteria||null;render_uni();feedback_uni('',false);}catch(e){feedback_uni(e.message,true);state_uni.rows=[];state_uni.total=0;render_uni();}finally{state_uni.loading=false;}}
  async function detail_uni(code){if(!code)return;const panel=$('ecx-detail');panel.hidden=false;$('ecx-detail-title').textContent=code;$('ecx-detail-body').innerHTML='<tr><td colspan="6" class="empty">Cargando...</td></tr>';try{const d=await request_uni(ENDPOINT_UNI+'/'+encodeURIComponent(code)+'/tickets');const rows=Array.isArray(d.data)?d.data:[];$('ecx-detail-body').innerHTML=rows.length?rows.map(t=>`<tr><td>${esc_uni(t.ticket||t.folio||'—')}</td><td>${esc_uni(String(t.fecha_reporte||'—').slice(0,10))}</td><td>${esc_uni(t.estado_ticket||t.estado||'—')}</td><td>${esc_uni(t.proyecto||'—')}</td><td>${esc_uni(t.responsabilidad||'—')}</td><td>${esc_uni(t.causa_falla||t.causa||'—')}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">Sin tickets en el período.</td></tr>';}catch(e){$('ecx-detail-body').innerHTML='<tr><td colspan="6" class="empty">'+esc_uni(e.message)+'</td></tr>';}}
  function bind_uni(){
    $('ecx-refresh').onclick=()=>load_uni(state_uni.page); $('ecx-apply').onclick=()=>{state_uni.filters={zona:$('ecx-zona').value.trim(),proyecto:$('ecx-proyecto').value.trim(),search:$('ecx-search').value.trim()};load_uni(1)};
    $('ecx-clear').onclick=()=>{['ecx-zona','ecx-proyecto','ecx-search'].forEach(id=>$(id).value='');state_uni.filters={zona:'',proyecto:'',search:''};load_uni(1)};
    $('ecx-prev').onclick=()=>load_uni(state_uni.page-1); $('ecx-next').onclick=()=>load_uni(state_uni.page+1); $('ecx-detail-close').onclick=()=>$('ecx-detail').hidden=true;
  }
  async function init_uni(){if(!state_uni.initialized){if(!layout_uni())return false;state_uni.initialized=true;}await load_uni(state_uni.page);return true;}
  window.ManttoEquiposCriticosExperimental_uni={init:init_uni};
})();
