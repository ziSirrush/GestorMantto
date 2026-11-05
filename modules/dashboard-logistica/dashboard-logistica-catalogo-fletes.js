(function(){
  'use strict';

  // BLT NOW | 2026-11-05 | Consulta de fletes CORELLIAN desde catalogo_conceptos.
  // Complemento aislado: no modifica el simulador historico de fletes.
  const dashboard=window.ManttoDashboardLogistica;
  if(!dashboard||dashboard.__catalogoFletesHook_cor)return;

  const ENDPOINT='/api/logistica/dashboard/fletes';
  let fletes=[],loading=false,error='',requestId=0;
  const el=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const norm=value=>String(value==null?'':value).trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function amount(value){
    if(value==null||value==='')return '—';
    const numeric=Number(value);
    return Number.isFinite(numeric)
      ? numeric.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})
      : '—';
  }

  const MARKUP=
    '<section id="dl-costs-widget" class="dl-card dl-costs-widget" aria-label="Costos de fletes de referencia">'+
      '<div class="dl-costs-strip">'+
        '<span class="dl-costs-label">FLETES</span>'+
        '<div id="dl-costs-marquee" class="dl-costs-marquee" tabindex="0" aria-label="Fletes y costos de referencia">'+
          '<div id="dl-costs-track" class="dl-costs-placeholder">Consultando costos de referencia...</div>'+
        '</div>'+
        '<button id="dl-costs-toggle" class="dl-costs-toggle" type="button" aria-expanded="false" aria-controls="dl-costs-panel">Consultar fletes</button>'+
      '</div>'+
      '<div id="dl-costs-panel" class="dl-costs-panel" hidden>'+
        '<div class="dl-costs-title"><div><h2>Tabulador de fletes</h2><p>Costos de referencia registrados en Aiven · Solo lectura</p></div>'+
          '<span id="dl-costs-count" aria-live="polite"></span></div>'+
        '<div class="dl-costs-filters">'+
          '<label for="dl-costs-search">Buscar <input id="dl-costs-search" type="search" placeholder="Concepto, proveedor o zona" autocomplete="off"></label>'+
          '<label for="dl-costs-currency">Moneda <select id="dl-costs-currency"><option value="">Todas las monedas</option></select></label>'+
        '</div>'+
        '<div class="dl-table-wrap" role="region" aria-label="Tabulador de costos de fletes" tabindex="0">'+
          '<table class="dl-table dl-costs-table"><thead><tr>'+
            '<th scope="col">ID</th><th scope="col">Concepto</th><th scope="col">Subcategoría</th>'+
            '<th scope="col">Unidad</th><th scope="col">Costo</th><th scope="col">Moneda</th>'+
            '<th scope="col">Proveedor</th><th scope="col">Zona</th>'+
          '</tr></thead><tbody id="dl-costs-body"></tbody></table>'+
        '</div>'+
      '</div>'+
    '</section>';

  function renderTicker(){
    const host=el('dl-costs-track');
    if(!host)return;
    if(loading||error||!fletes.length){
      host.className='dl-costs-placeholder';
      host.textContent=loading?'Consultando costos registrados en Aiven...':
        error||'Sin fletes activos con costo vigente.';
      return;
    }
    const items=fletes.map(f=>
      '<span class="dl-costs-item"><span>'+esc(f.concepto)+'</span>'+
      '<strong>'+esc(amount(f.costo_unitario))+' '+esc(f.moneda||'')+'</strong></span>'
    ).join('');
    host.className='dl-costs-track';
    host.innerHTML=
      '<span class="dl-costs-group">'+items+'</span>'+
      '<span class="dl-costs-group" aria-hidden="true">'+items+'</span>';
  }

  function renderCurrencies(){
    const select=el('dl-costs-currency');
    if(!select)return;
    const previous=select.value;
    const currencies=[...new Set(fletes.map(f=>String(f.moneda||'').trim()).filter(Boolean))].sort();
    select.innerHTML='<option value="">Todas las monedas</option>'+
      currencies.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
    if(currencies.includes(previous))select.value=previous;
  }

  function renderTable(){
    const body=el('dl-costs-body');
    if(!body)return;
    const search=norm(el('dl-costs-search')&&el('dl-costs-search').value);
    const currency=el('dl-costs-currency')?el('dl-costs-currency').value:'';
    const count=el('dl-costs-count');
    if(loading||error||!fletes.length){
      const msg=loading?'Consultando fletes...':error||'Sin fletes activos con costo vigente.';
      body.innerHTML='<tr><td colspan="8" class="dl-empty">'+esc(msg)+'</td></tr>';
      if(count)count.textContent='0 registros';
      return;
    }
    const filtered=fletes.filter(f=>{
      const haystack=norm([f.codigo_concepto,f.concepto,f.subcategoria,f.proveedor,f.zona_aplicable].join(' '));
      return (!search||haystack.includes(search))&&(!currency||String(f.moneda||'')===currency);
    });
    body.innerHTML=filtered.length?filtered.map(f=>
      '<tr><td>'+esc(f.id_concepto)+'</td>'+
      '<td>'+esc(f.concepto||'—')+'</td>'+
      '<td>'+esc(f.subcategoria||'—')+'</td>'+
      '<td>'+esc(f.unidad_medida||'—')+'</td>'+
      '<td class="dl-costs-money">'+esc(amount(f.costo_unitario))+'</td>'+
      '<td>'+esc(f.moneda||'—')+'</td>'+
      '<td>'+esc(f.proveedor||'—')+'</td>'+
      '<td>'+esc(f.zona_aplicable||'—')+'</td></tr>'
    ).join(''):'<tr><td colspan="8" class="dl-empty">No hay resultados para este filtro.</td></tr>';
    if(count)count.textContent=filtered.length+' de '+fletes.length+' registros';
  }

  async function loadCatalog(){
    const id=++requestId;
    loading=true;error='';fletes=[];
    renderTicker();renderTable();
    try{
      const api=String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
      const headers=Object.assign({Accept:'application/json'},
        window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
      const response=await fetch(api+ENDPOINT,{method:'GET',headers,cache:'no-store'});
      const payload=await response.json();
      if(!response.ok||!payload||payload.ok!==true||!Array.isArray(payload.data)){
        throw new Error('Respuesta no válida del catálogo.');
      }
      if(id!==requestId)return;
      fletes=payload.data;
    }catch(_err){
      if(id!==requestId)return;
      error='No se pudieron consultar los costos de fletes.';
    }finally{
      if(id===requestId){
        loading=false;
        renderCurrencies();renderTicker();renderTable();
      }
    }
  }

  function attachWidget(){
    const view=el('view-logistica-dashboard');
    const head=view&&view.querySelector('.dl-head');
    if(!head)return;
    if(!el('dl-costs-widget'))head.insertAdjacentHTML('afterend',MARKUP);
    const toggle=el('dl-costs-toggle'),panel=el('dl-costs-panel');
    if(toggle&&panel){
      toggle.onclick=()=>{
        const open=panel.hidden;
        panel.hidden=!open;
        toggle.setAttribute('aria-expanded',String(open));
        toggle.textContent=open?'Ocultar tabulador':'Consultar fletes';
        if(open)renderTable();
      };
    }
    const search=el('dl-costs-search');
    if(search)search.oninput=renderTable;
    const currency=el('dl-costs-currency');
    if(currency)currency.onchange=renderTable;
    const refresh=el('dl-refresh');
    if(refresh&&!refresh.__catalogoFletesBound_cor){
      refresh.__catalogoFletesBound_cor=true;
      refresh.addEventListener('click',()=>{void loadCatalog();});
    }
    renderTicker();renderTable();
  }

  const originalInit=dashboard.init;
  dashboard.init=function(){
    const result=originalInit.apply(this,arguments);
    attachWidget();
    void loadCatalog();
    return result;
  };
  const originalReload=dashboard.reload;
  dashboard.reload=function(){
    const result=originalReload.apply(this,arguments);
    attachWidget();
    void loadCatalog();
    return result;
  };
  dashboard.__catalogoFletesHook_cor=true;
  document.addEventListener('mantto:view-reused',event=>{
    if(event&&event.detail&&event.detail.route==='logistica-dashboard'){
      attachWidget();
      void loadCatalog();
    }
  });
})();
