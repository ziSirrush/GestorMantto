(function(){
  'use strict';
  if(window.ManttoAlmacenCarga)return;
  // BLT NOW | LIMPIEZA V002: el flujo Excel fue retirado; solo fuentes NetSuite.
  const state={busy:false,requestId:0};
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function dateText(value){
    if(!value)return '\u2014';
    const raw=String(value),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m?m[3]+'/'+m[2]+'/'+m[1]:raw;
  }
  async function read(url){
    if(window.ManttoAuth&&typeof window.ManttoAuth.api==='function')return window.ManttoAuth.api(url,{method:'GET'});
    const headers=Object.assign({Accept:'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
    const response=await fetch(String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'')+url,{method:'GET',headers,cache:'no-store'});
    const payload=await response.json();
    if(!response.ok||payload.ok===false){const error=new Error(payload.message||'No fue posible consultar Almacen.');error.status=response.status;throw error;}
    return payload;
  }
  function render(view,source,sources,message){
    const rows=sources.map(item=>'<tr><td>'+esc(item.loteImportacion)+'</td><td>'+esc(item.tipoFuente||'INVENTARIO_230')+'</td><td>'+esc(dateText(item.fechaCorte))+'</td><td>'+esc(item.estado||'PUBLICADO')+'</td><td>'+((item.activo===true||Number(item.activo)===1)?'Activo':'Historico')+'</td></tr>').join('');
    view.innerHTML='<div class="almload-shell"><section class="almload-card almload-head"><div><span class="almload-eyebrow">Gestion de Almacen</span><h1>Carga de Informacion</h1><p>Fuentes publicadas por la sincronizacion NetSuite. Consulta de solo lectura.</p></div><button type="button" id="almload-refresh">Actualizar</button></section>'+
      (message?'<section class="almload-card" role="alert">'+esc(message)+'</section>':'')+
      '<section class="almload-card"><h2>Fuente activa</h2><p>'+(source?esc(source.archivoOrigen||'Inventario NetSuite')+' | Corte: '+esc(dateText(source.fechaCorte))+' | Lote: '+esc(source.loteImportacion):'No hay un lote de inventario publicado y activo para tu alcance.')+'</p></section>'+
      '<section class="almload-card"><h2>Lotes publicados</h2><div class="almload-table-wrap"><table><thead><tr><th>Lote</th><th>Fuente</th><th>Corte</th><th>Estado</th><th>Seleccion</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5">Sin lotes disponibles.</td></tr>')+'</tbody></table></div></section></div>';
    const refresh=view.querySelector('#almload-refresh');if(refresh)refresh.onclick=()=>load(view);
  }
  async function load(view){
    if(state.busy)return;state.busy=true;const request=++state.requestId;
    const old=view.querySelector('#almload-refresh');if(old)old.disabled=true;
    try{
      const result=await Promise.all([read('/api/almacen/carga/capabilities'),read('/api/almacen/fuentes')]);
      if(request!==state.requestId)return;
      render(view,result[0].source||null,Array.isArray(result[1].sources)?result[1].sources:[],'');
    }catch(error){
      if(request===state.requestId)render(view,null,[],Number(error.status)===403?'No tienes permiso o alcance para consultar las fuentes de Almacen.':error.message);
    }finally{state.busy=false;const button=view.querySelector('#almload-refresh');if(button)button.disabled=false;}
  }
  function init(route){
    if(route!=='almacen-carga')return false;
    const view=document.getElementById('view-almacen-carga');if(!view)return false;
    view.dataset.almacenCargaReady='netsuite-lectura-v002';void load(view);return true;
  }
  window.ManttoAlmacenCarga=Object.freeze({init});
})();
