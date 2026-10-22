(function(){
  'use strict';

  if(window.ManttoAlmacenStockReabasto) return;

  const state={
    page:1,
    reabasto:'todas',
    requestSeq:0,
    view:null,
    observer:null,
    timer:null,
    rendering:false
  };

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function number(value,decimals){
    if(value===null||value===undefined||value==='')return '—';
    const n=Number(value);if(!Number.isFinite(n))return '—';
    return new Intl.NumberFormat('es-MX',{maximumFractionDigits:decimals==null?2:decimals}).format(n);
  }

  function dateText(value){
    if(!value)return '';
    const raw=String(value).trim();
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if(!match)return raw;
    const base=match[3]+'/'+match[2]+'/'+match[1];
    return match[4]&&match[5]?base+' - '+match[4]+':'+match[5]:base;
  }

  function apiBase(){return String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');}

  function selectedSourceLot(){
    try{return String(window.sessionStorage.getItem('mantto:almacen:lote-seleccionado')||'').trim();}
    catch(_error){return '';}
  }

  function withLot(path){
    const lot=selectedSourceLot();
    if(!lot)return path;
    return path+(String(path).includes('?')?'&':'?')+'loteImportacion='+encodeURIComponent(lot);
  }

  async function requestJson(path,options){
    const target=withLot(path);
    const opts=Object.assign({credentials:'include',headers:{Accept:'application/json'}},options||{});
    opts.headers=Object.assign({Accept:'application/json'},opts.headers||{});
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function'){
      return window.ManttoAuth.api(target,opts);
    }
    if(window.ManttoAuth&&window.ManttoAuth.authHeaders)Object.assign(opts.headers,window.ManttoAuth.authHeaders());
    const response=await fetch(apiBase()+target,opts);
    let data={};try{data=await response.json();}catch(_error){}
    if(!response.ok||data.ok===false){
      const error=new Error(data.message||('HTTP '+response.status));
      error.status=response.status;error.code=data.code||null;error.details=data.details||null;throw error;
    }
    return data;
  }

  function queryString(params){
    const search=new URLSearchParams();
    Object.entries(params||{}).forEach(function(entry){
      const value=entry[1];if(value===''||value===null||value===undefined)return;
      search.set(entry[0],String(value));
    });
    const value=search.toString();return value?'?'+value:'';
  }

  function currentFilters(view){
    const q=view.querySelector('#alm-stock-query');
    const company=view.querySelector('#alm-stock-company');
    const abc=view.querySelector('#alm-stock-abc');
    const alert=view.querySelector('#alm-stock-alert');
    return {
      q:q?q.value:'',
      company:company?company.value:'todas',
      abc:abc?abc.value:'todas',
      alert:alert?alert.value:'todas',
      reabasto:state.reabasto,
      page:state.page
    };
  }

  function technicalNeed(row){
    const alert=String(row&&row.alertaTecnica||'').toLowerCase();
    return alert==='critico'||alert==='reorden';
  }

  function operationalLabel(row){
    if(row&&row.noRequiereReabasto)return {text:'No requiere reabasto',tone:'skip'};
    if(technicalNeed(row))return {text:'Requiere reabasto',tone:'need'};
    return {text:'Sin necesidad',tone:'none'};
  }



  function renderRows(rows){
    if(!rows||!rows.length){
      return '<tr><td class="alm-empty-cell" colspan="13">Sin registros para los filtros seleccionados.</td></tr>';
    }
    return rows.map(function(row){
      const op=operationalLabel(row);

      const reason=row.motivoReabasto||'';
      const updated=row.reabastoUpdatedAt?dateText(row.reabastoUpdatedAt):'';
      const meta=reason?'<small class="alm-reabasto-reason" title="'+escapeHtml(reason)+'">'+escapeHtml(reason)+(updated?' · '+escapeHtml(updated):'')+'</small>':'';
      return '<tr data-alm-reabasto-key="'+escapeHtml(row.stockKey||'')+'">'+
        '<td><strong>'+escapeHtml(row.articulo||row.codigo||'—')+'</strong><small class="alm-cell-sub">'+escapeHtml(row.codigo||'')+'</small></td>'+
        '<td>'+escapeHtml(row.empresa||'—')+'</td>'+
        '<td>'+escapeHtml(row.abc||'—')+'</td>'+
        '<td>'+escapeHtml(row.criticidad||'—')+'</td>'+
        '<td>'+number(row.demanda,2)+'</td>'+
        '<td>'+number(row.fisico,2)+'</td>'+
        '<td>'+number(row.stockSeguridad,2)+'</td>'+
        '<td>'+number(row.puntoReorden,2)+'</td>'+
        '<td>'+number(row.minimo,2)+'</td>'+
        '<td>'+number(row.maximo,2)+'</td>'+
        '<td><span class="alm-reabasto-technical">'+escapeHtml(row.alertaTecnica||'—')+'</span></td>'+
        '<td><span class="alm-reabasto-state is-'+op.tone+'">'+escapeHtml(op.text)+'</span>'+meta+'</td>'+
        '<td>Solo lectura</td>'+
      '</tr>';
    }).join('');
  }

  function renderSummary(view,data){
    const technicalGrid=view.querySelector('.alm-kpi-grid');
    if(!technicalGrid)return;
    let summary=view.querySelector('#alm-reabasto-summary');
    if(!summary){
      summary=document.createElement('section');summary.id='alm-reabasto-summary';summary.className='alm-reabasto-summary';
      technicalGrid.insertAdjacentElement('afterend',summary);
    }
    const k=data.operationalKpis||{};
    summary.innerHTML='<div class="alm-reabasto-summary-head"><div><strong>Estado operativo de reabasto</strong><small>No modifica la alerta técnica de Stock.</small></div></div>'+
      '<div class="alm-reabasto-kpis">'+
        '<article><small>Pendientes de reabasto</small><strong>'+number(k.requierenReabasto||0,0)+'</strong><span>Crítico + ROP accionables</span></article>'+
        '<article><small>Excluidos por decisión</small><strong>'+number(k.excluidosReabasto||0,0)+'</strong><span>Bajo stock con excepción activa</span></article>'+
        '<article><small>Excepciones activas</small><strong>'+number(k.excepcionesActivas||0,0)+'</strong><span>Histórico vigente por artículo</span></article>'+
      '</div>';
  }

  function ensureFilter(view){
    const row=view.querySelector('.alm-filter-row-main');if(!row)return;
    let wrap=view.querySelector('#alm-reabasto-filter-wrap');
    if(!wrap){
      wrap=document.createElement('label');wrap.id='alm-reabasto-filter-wrap';wrap.className='alm-field';
      wrap.innerHTML='<span>Reabasto</span><select id="alm-stock-reabasto"><option value="todas">Todos</option><option value="requiere">Requiere reabasto</option><option value="no_requiere">No requiere reabasto</option><option value="sin_necesidad">Sin necesidad</option></select>';
      row.appendChild(wrap);
    }
    const select=wrap.querySelector('#alm-stock-reabasto');
    if(select){
      select.value=state.reabasto;
      if(select.dataset.almReabastoBound!=='1'){
        select.dataset.almReabastoBound='1';
        select.addEventListener('change',function(){state.reabasto=select.value||'todas';state.page=1;schedule(view,0);});
      }
    }
  }

  function bindBaseFilters(view){
    ['#alm-stock-query','#alm-stock-company','#alm-stock-abc','#alm-stock-alert'].forEach(function(selector){
      const element=view.querySelector(selector);if(!element||element.dataset.almReabastoResetBound==='1')return;
      element.dataset.almReabastoResetBound='1';
      const eventName=element.tagName==='INPUT'?'input':'change';
      element.addEventListener(eventName,function(){state.page=1;});
    });
  }

  function renderTable(view,data){
    const table=view.querySelector('.alm-table-card .alm-table');if(!table)return;
    table.style.minWidth='1480px';
    const head=table.querySelector('thead');
    const body=table.querySelector('tbody');
    if(head)head.innerHTML='<tr><th>Artículo</th><th>Empresa</th><th>ABC</th><th>Criticidad</th><th>Demanda</th><th>Stock actual</th><th>Stock seg.</th><th>Pto. reorden</th><th>Mínimo</th><th>Máximo</th><th>Alerta técnica</th><th>Estado reabasto</th><th>Acción</th></tr>';
    if(body)body.innerHTML=renderRows(data.rows||[]);

    const pager=view.querySelector('.alm-table-card .alm-pager');
    const p=data.pagination||{page:1,pages:1,total:0};
    state.page=Number(p.page||1);
    if(pager){
      pager.innerHTML='<span>Página '+number(p.page,0)+' de '+number(p.pages,0)+' · '+number(p.total,0)+' registros</span><div><button type="button" data-alm-reabasto-page="prev"'+(Number(p.page)<=1?' disabled':'')+'>← Ant</button><button type="button" data-alm-reabasto-page="next"'+(Number(p.page)>=Number(p.pages)?' disabled':'')+'>Sig →</button></div>';
      pager.querySelectorAll('[data-alm-reabasto-page]').forEach(function(button){
        button.addEventListener('click',function(){
          const dir=button.dataset.almReabastoPage==='next'?1:-1;
          state.page=Math.max(1,Math.min(Number(p.pages||1),state.page+dir));schedule(view,0);
        });
      });
    }

  }

  function ensureErrorNote(view,message){
    let note=view.querySelector('#alm-reabasto-error');
    if(!note){note=document.createElement('section');note.id='alm-reabasto-error';note.className='alm-card alm-reabasto-error';const table=view.querySelector('.alm-table-card');if(table)table.insertAdjacentElement('beforebegin',note);}
    if(note)note.innerHTML='<strong>No se pudo cargar el estado operativo de reabasto</strong><small>'+escapeHtml(message||'Error no identificado.')+'</small>';
  }

  function clearErrorNote(view){const note=view.querySelector('#alm-reabasto-error');if(note)note.remove();}

  function observe(view){
    if(state.observer){try{state.observer.disconnect();}catch(_error){}}
    state.observer=new MutationObserver(function(){if(!state.rendering)schedule(view,120);});
    state.observer.observe(view,{childList:true,subtree:true});
  }

  function schedule(view,delay){
    state.view=view||state.view;if(!state.view)return;
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(function(){enhance(state.view);},delay==null?120:delay);
  }

  async function enhance(view){
    if(!view||!view.isConnected)return;
    if(!view.querySelector('#alm-stock-query')||!view.querySelector('.alm-table-card .alm-table'))return;
    const seq=++state.requestSeq;
    try{
      const filters=currentFilters(view);
      const data=await requestJson('/api/almacen/stock/reabasto'+queryString(filters),{method:'GET'});
      if(seq!==state.requestSeq)return;
      state.rendering=true;if(state.observer)state.observer.disconnect();
      ensureFilter(view);bindBaseFilters(view);renderSummary(view,data);renderTable(view,data);clearErrorNote(view);
    }catch(error){
      if(seq!==state.requestSeq)return;
      state.rendering=true;if(state.observer)state.observer.disconnect();ensureFilter(view);bindBaseFilters(view);ensureErrorNote(view,error.message);
    }finally{
      state.rendering=false;observe(view);
    }
  }





  function attachStock(){
    const view=document.getElementById('view-almacen-stock');if(!view)return;
    state.view=view;observe(view);schedule(view,0);
  }

  const original=window.ManttoAlmacen;
  if(original&&typeof original.init==='function'){
    window.ManttoAlmacen=Object.freeze({
      init:function(route){
        const result=original.init.apply(original,arguments);
        if(String(route||'')==='almacen-stock')setTimeout(attachStock,0);
        return result;
      }
    });
  }

  document.addEventListener('mantto:almacen-source-changed',function(){state.page=1;state.reabasto='todas';if(state.view)schedule(state.view,120);});
  document.addEventListener('mantto:data-mutated',function(event){const path=String(event&&event.detail&&event.detail.path||'');if(path.includes('/api/almacen/stock/reabasto')&&state.view)schedule(state.view,0);});

  window.ManttoAlmacenStockReabasto=Object.freeze({refresh:function(){if(state.view)schedule(state.view,0);}});
})();
