(function(){
  const PIPELINE=['SIN PRODUCCIÓN / Documentación Pendiente','SIN PRODUCCIÓN / Primera Visita a Obra','SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente','SIN PRODUCCIÓN / Programados a Producción','EN PRODUCCIÓN','PARADOS POR CLIENTE','PENDIENTE PAGO LIBERACIÓN','PROGRAMADO','EN TRÁNSITO','PROGRAMA ENTREGA','ALMACENADOS','ENTREGADO'];
  const state={rows:[],loaded:false};
  const HTML=`<div class="dl-page">
  <section class="dl-card dl-head"><div><p class="dl-eyebrow">Aiven · Logística</p><h1>Dashboard Logística</h1><p>Seguimiento ejecutivo de producción, tránsito, almacenamiento y entrega.</p></div><div class="dl-actions"><span id="dl-status" class="dl-status"><span class="dl-dot"></span><span>Cargando Aiven...</span></span><button id="dl-refresh" class="dl-btn" type="button">↻ Actualizar</button></div></section>
  <section class="dl-card dl-section"><div class="dl-section-head"><div><h2>Pipeline por estatus</h2><p>Selecciona una etapa para consultar sus registros.</p></div><small id="dl-pipeline-count">—</small></div><div id="dl-pipeline" class="dl-pipeline"></div></section>
  <section class="dl-grid dl-two">
    <article class="dl-card dl-section"><div class="dl-section-head"><div><h2>Proyectos sin PP NS</h2><p>Registros con SIN PP NS / SIN CARPETA.</p></div><small id="dl-sin-count">—</small></div><div class="dl-table-wrap"><table class="dl-table"><thead><tr><th>Proyecto</th><th>Estatus</th><th>Marca</th></tr></thead><tbody id="dl-sin-body"></tbody></table></div></article>
    <article class="dl-card dl-section"><div class="dl-section-head"><div><h2>Movimientos semanales</h2><p>Estatus del corte anterior contra el actual.</p></div><small id="dl-mov-count">—</small></div><div class="dl-table-wrap"><table class="dl-table"><thead><tr><th>PP NS</th><th>Proyecto</th><th>Estatus</th><th>Marca</th></tr></thead><tbody id="dl-mov-body"></tbody></table></div></article>
  </section>
  <section id="dl-modal" class="dl-modal" hidden><div class="dl-modal-panel"><div class="dl-modal-head"><h2 id="dl-modal-title">Detalle</h2><button id="dl-modal-close" class="dl-modal-close" type="button">×</button></div><div id="dl-modal-body" class="dl-modal-body"></div></div></section>
</div>`;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null||v===''?'—':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v==null?'':v).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const num=v=>Number(v||0).toLocaleString('es-MX');
  const text=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  const api=()=>String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
  function isSin(r){const v=norm(r.id_ppns);return ['SIN PP NS','SIN PPNS','SIN CARPETA'].includes(v);}
  function isMov(r){const a=norm(r.estatus_corte_anterior),b=norm(r.estatus);return !!(a&&b&&a!==b);}
  function deliveredYear(r){const m=String(r.fecha_entrega_real_obra||'').match(/^(\d{4})/);return norm(r.estatus)==='ENTREGADO'&&m&&Number(m[1])===new Date().getFullYear();}
  function setStatus(cls,msg){const e=$('dl-status');if(!e)return;e.className='dl-status '+cls;e.innerHTML='<span class="dl-dot"></span><span>'+esc(msg)+'</span>';}
  async function fetchRows(){const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});const r=await fetch(api()+'/api/logistica?limit=5000',{headers,cache:'no-store'});const raw=await r.text();let j;try{j=raw?JSON.parse(raw):{};}catch(e){throw new Error('Respuesta no JSON del backend.');}if(!r.ok||!j.ok)throw new Error(j.message||j.error||'Error consultando Logística');return Array.isArray(j.data)?j.data:[];}
  function render(){
    const rows=state.rows,sin=rows.filter(isSin),mov=rows.filter(isMov);
    const counts=new Map();rows.forEach(r=>{const k=norm(r.estatus);counts.set(k,(counts.get(k)||0)+1);});const max=Math.max(1,...counts.values());
    $('dl-pipeline').innerHTML=PIPELINE.map(s=>{const c=counts.get(norm(s))||0;return `<div class="dl-stage" data-status="${esc(s)}"><div class="dl-stage-top"><span>${esc(s)}</span><span>${num(c)}</span></div><div class="dl-track"><div class="dl-fill" style="width:${Math.max(c?3:0,Math.round(c/max*100))}%"></div></div></div>`;}).join('');text('dl-pipeline-count',rows.length+' registros');
    $('dl-sin-body').innerHTML=sin.length?sin.map(r=>`<tr data-id="${r.id_log_ops}"><td><button class="dl-link">${esc(r.proyecto)}</button></td><td><span class="dl-chip">${esc(r.estatus)}</span></td><td>${esc(r.marca)}</td></tr>`).join(''):'<tr><td colspan="3" class="dl-empty">Sin proyectos pendientes de PP NS</td></tr>';text('dl-sin-count',sin.length+' registros');
    $('dl-mov-body').innerHTML=mov.length?mov.map(r=>`<tr data-id="${r.id_log_ops}"><td>${esc(r.id_ppns)}</td><td><button class="dl-link">${esc(r.proyecto)}</button></td><td><span class="dl-chip" title="Anterior: ${esc(r.estatus_corte_anterior)}">${esc(r.estatus)}</span></td><td>${esc(r.marca)}</td></tr>`).join(''):'<tr><td colspan="4" class="dl-empty">Sin movimientos semanales</td></tr>';text('dl-mov-count',mov.length+' movimientos');
    bindRows();document.querySelectorAll('.dl-stage').forEach(e=>e.onclick=()=>{ if(window.ManttoRouter) window.ManttoRouter.go('logistica-reporte',{ estatus:e.dataset.status, source:'logistica-dashboard' }); });
  }
  function openList(title,rows){text('dl-modal-title',title);$('dl-modal-body').innerHTML=`<div class="dl-table-wrap"><table class="dl-table"><thead><tr><th>PP NS</th><th>Proyecto</th><th>Estatus</th><th>Marca</th><th>No. control</th><th>Cantidad</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr data-id="${r.id_log_ops}"><td>${esc(r.id_ppns)}</td><td><button class="dl-link">${esc(r.proyecto)}</button></td><td>${esc(r.estatus)}</td><td>${esc(r.marca)}</td><td>${esc(r.no_control)}</td><td>${esc(r.cantidad)}</td></tr>`).join(''):'<tr><td colspan="6" class="dl-empty">Sin registros</td></tr>'}</tbody></table></div>`;$('dl-modal').hidden=false;bindRows();}
  function openDetail(id){const r=state.rows.find(x=>String(x.id_log_ops)===String(id));if(!r)return;text('dl-modal-title',(r.proyecto||'Detalle')+' · '+(r.id_ppns||'—'));const fields=['estatus','marca','no_control','cantidad','supervisor','asesor','ict','incoterm','pago_liberacion','pago_cliente','fecha_exw','puerto_origen','fecha_salida_estimada','fecha_salida_real','puerto_destino','fecha_llegada_estimada','fecha_llegada_real','lugar_entrega','fecha_entrega_programada','fecha_entrega_real_obra','proveedor','carpeta','pvo','fecha_produccion','fecha_estimada_obra','comentarios'];$('dl-modal-body').innerHTML='<div class="dl-fields">'+fields.map(k=>`<div class="dl-field"><small>${esc(k.replaceAll('_',' '))}</small><b>${esc(r[k])}</b></div>`).join('')+'</div>';$('dl-modal').hidden=false;}
  function bindRows(){document.querySelectorAll('[data-id]').forEach(e=>e.onclick=()=>openDetail(e.dataset.id));}
  async function load(){setStatus('','Cargando Aiven...');try{state.rows=await fetchRows();window.ManttoLogisticaStore={rows:state.rows,loadedAt:Date.now()};state.loaded=true;render();setStatus('ok','Aiven conectado · '+state.rows.length+' registros');}catch(e){setStatus('error',e.message);$('dl-pipeline').innerHTML='<div class="dl-empty">No se pudo cargar Dashboard Logística.</div>';}}
  function init(){
    const view=$('view-logistica-dashboard');
    if(!view) return;

    // El router coloca una tarjeta temporal de "Cargando módulo".
    // Si todavía no existe la estructura real del dashboard, la sustituimos.
    if(!view.querySelector('#dl-refresh') || !view.querySelector('#dl-modal')){
      view.innerHTML=HTML;
    }

    const refresh=$('dl-refresh');
    const modal=$('dl-modal');
    const modalClose=$('dl-modal-close');

    if(refresh){
      refresh.onclick=load;
    }

    if(modalClose && modal){
      modalClose.onclick=()=>{ modal.hidden=true; };
    }

    if(modal){
      modal.onclick=e=>{
        if(e.target===modal) modal.hidden=true;
      };
    }

    state.loaded ? render() : load();
  }
  window.ManttoDashboardLogistica={init,reload:load};
})();
