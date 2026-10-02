(function(){
  'use strict';

  // [Aster | 2026-10-02 | ASTER-MG | COBRANZA COR FASE 6 ACCIONES INLINE V001]
  if(window.ManttoCobranzaCorEstadoCuentaAcciones) return;

  const ROUTE='cobranza-estados-cuenta';
  const LIST_PATH='/api/cobranza-cor/estados-cuenta';
  const state={
    detail:null,
    ppns:'',
    loading:false,
    requestSeq:0,
    editing:null,
    deletePending:null,
    editSnapshot:null,
    observer:null,
    scheduled:false
  };

  function navigation_cor(){
    if(!window.ManttoRouter||typeof window.ManttoRouter.getCurrent!=='function') return {route:'',payload:null};
    const current=window.ManttoRouter.getCurrent()||{};
    return {route:String(current.route||''),payload:current.payload||null};
  }

  function activePpns_cor(){
    const current=navigation_cor();
    if(current.route!==ROUTE) return '';
    const payload=current.payload||{};
    const mode=String(payload.mode||'').trim().toLowerCase();
    if(mode==='create'||mode==='edit') return '';
    return String(payload.ppns||'').trim();
  }

  function escapeHtml_cor(value){
    return String(value===null||value===undefined?'':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function text_cor(value,fallback='—'){
    if(value===null||value===undefined) return fallback;
    const text=String(value).trim();
    return text||fallback;
  }

  function raw_cor(value){
    return value===null||value===undefined?'':String(value);
  }

  function number_cor(value){
    if(value===null||value===undefined||value==='') return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function formatAmount_cor(value){
    const number=number_cor(value);
    return number===null?'—':new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(number);
  }

  function isViewerReadonly_cor(){
    const auth=window.ManttoAuth;
    if(auth&&typeof auth.getViewUser==='function'){
      try{return Boolean(auth.getViewUser());}catch(_error){}
    }
    const banner=document.getElementById('user-viewer-banner');
    return Boolean(banner&&!banner.hidden);
  }

  function apiGet_cor(path,options){
    if(!window.ManttoHttp||typeof window.ManttoHttp.get!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.get(path,options||{});
  }

  function apiRequest_cor(path,options){
    if(!window.ManttoHttp||typeof window.ManttoHttp.request!=='function') return Promise.reject(new Error('Cliente HTTP central no disponible.'));
    return window.ManttoHttp.request(path,options||{});
  }

  function statusNode_cor(kind){
    return document.getElementById(kind==='factura'?'ccor-ec-factura-status':'ccor-ec-pago-status');
  }

  function setStatus_cor(kind,message,status){
    const node=statusNode_cor(kind);
    if(!node) return;
    node.className='ccor-ec-inline-status'+(status?' is-'+status:'');
    node.textContent=message||'';
  }

  function errorText_cor(error,fallback){
    return text_cor(error&&error.message,fallback||'No fue posible completar la operación.');
  }

  function clearActionState_cor(){
    state.editing=null;
    state.deletePending=null;
    state.editSnapshot=null;
  }

  function actionCellHtml_cor(kind,id){
    return `<div class="ccor-f6-actions" data-f6-actions="${escapeHtml_cor(kind)}:${escapeHtml_cor(id)}">
      <button class="ccor-f6-btn" type="button" data-f6-edit data-kind="${escapeHtml_cor(kind)}" data-id="${escapeHtml_cor(id)}">Editar</button>
      <button class="ccor-f6-btn ccor-f6-btn-danger" type="button" data-f6-delete data-kind="${escapeHtml_cor(kind)}" data-id="${escapeHtml_cor(id)}">Eliminar</button>
    </div>`;
  }

  function confirmDeleteHtml_cor(kind,id){
    const label=kind==='factura'?'Factura':'Pago';
    return `<div class="ccor-f6-confirm" data-f6-confirm="${escapeHtml_cor(kind)}:${escapeHtml_cor(id)}">
      <span>¿Eliminar ${label}?</span>
      <button class="ccor-f6-btn ccor-f6-btn-danger" type="button" data-f6-delete-confirm data-kind="${escapeHtml_cor(kind)}" data-id="${escapeHtml_cor(id)}">Confirmar eliminación</button>
      <button class="ccor-f6-btn" type="button" data-f6-delete-cancel data-kind="${escapeHtml_cor(kind)}" data-id="${escapeHtml_cor(id)}">Cancelar</button>
    </div>`;
  }


  function renderActionCell_cor(cell,kind,id){
    if(!cell) return;
    const confirm=state.deletePending===`${kind}:${Number(id)}`;
    const desired=(confirm?'confirm:':'actions:')+kind+':'+Number(id);
    if(cell.dataset.f6State===desired) return;
    cell.dataset.f6State=desired;
    cell.innerHTML=confirm?confirmDeleteHtml_cor(kind,id):actionCellHtml_cor(kind,id);
  }

  function removeActions_cor(table){
    if(!table) return;
    table.querySelectorAll('[data-f6-action-th],[data-f6-action-cell]').forEach(node=>node.remove());
    table.querySelectorAll('[data-factura-id]').forEach(row=>row.removeAttribute('data-factura-id'));
  }

  function decorateFacturas_cor(){
    const table=document.querySelector('.ccor-ec-facturas-table');
    if(!table||!state.detail) return false;
    if(isViewerReadonly_cor()){
      removeActions_cor(table);
      return true;
    }
    const header=table.querySelector('thead tr');
    if(header&&!header.querySelector('[data-f6-action-th]')){
      const th=document.createElement('th');
      th.setAttribute('data-f6-action-th','factura');
      th.textContent='Acciones';
      header.appendChild(th);
    }
    const facturas=Array.isArray(state.detail.facturas)?state.detail.facturas:[];
    const rows=Array.from(table.querySelectorAll('tbody tr')).filter(row=>!row.querySelector('.ccor-ec-table-empty'));
    rows.forEach((row,index)=>{
      const factura=facturas[index];
      const id=Number(factura&&factura.id_factura_cor);
      if(!Number.isInteger(id)||id<=0) return;
      row.dataset.facturaId=String(id);
      let cell=row.querySelector('[data-f6-action-cell="factura"]');
      if(!cell){
        cell=document.createElement('td');
        cell.setAttribute('data-f6-action-cell','factura');
        row.appendChild(cell);
      }
      if(state.editing===`factura:${id}`) return;
      renderActionCell_cor(cell,'factura',id);
    });
    return true;
  }

  function decoratePagos_cor(){
    const table=document.querySelector('.ccor-ec-pagos-table');
    if(!table||!state.detail) return false;
    if(isViewerReadonly_cor()){
      removeActions_cor(table);
      return true;
    }
    const header=table.querySelector('thead tr');
    if(header&&!header.querySelector('[data-f6-action-th]')){
      const th=document.createElement('th');
      th.setAttribute('data-f6-action-th','pago');
      th.textContent='Acciones';
      header.appendChild(th);
    }
    table.querySelectorAll('tbody tr[data-pago-id]').forEach(row=>{
      const id=Number(row.dataset.pagoId);
      if(!Number.isInteger(id)||id<=0) return;
      let cell=row.querySelector('[data-f6-action-cell="pago"]');
      if(!cell){
        cell=document.createElement('td');
        cell.setAttribute('data-f6-action-cell','pago');
        row.appendChild(cell);
      }
      if(state.editing===`pago:${id}`) return;
      renderActionCell_cor(cell,'pago',id);
    });
    return true;
  }

  function decorate_cor(){
    if(!activePpns_cor()||!state.detail) return false;
    const a=decorateFacturas_cor();
    const b=decoratePagos_cor();
    return a||b;
  }

  function scheduleDecorate_cor(){
    if(state.scheduled) return;
    state.scheduled=true;
    Promise.resolve().then(()=>{
      state.scheduled=false;
      decorate_cor();
    });
  }

  async function loadDetailData_cor(force){
    const ppns=activePpns_cor();
    if(!ppns) return false;
    if(!force&&state.detail&&state.ppns.toUpperCase()===ppns.toUpperCase()){
      scheduleDecorate_cor();
      return true;
    }
    const seq=++state.requestSeq;
    state.loading=true;
    try{
      const detail=await apiGet_cor(LIST_PATH+'/'+encodeURIComponent(ppns),{force:Boolean(force),cacheTtlMs:0});
      if(seq!==state.requestSeq||activePpns_cor().toUpperCase()!==ppns.toUpperCase()) return false;
      state.ppns=String(detail&&detail.proyecto&&detail.proyecto.ppns||ppns).trim();
      state.detail=detail||null;
      clearActionState_cor();
      scheduleDecorate_cor();
      return true;
    }catch(error){
      if(seq===state.requestSeq){
        state.detail=null;
        setStatus_cor('factura',errorText_cor(error,'No fue posible preparar las acciones de Facturas.'),'error');
      }
      return false;
    }finally{
      if(seq===state.requestSeq) state.loading=false;
    }
  }

  function facturaById_cor(id){
    return (Array.isArray(state.detail&&state.detail.facturas)?state.detail.facturas:[])
      .find(row=>Number(row&&row.id_factura_cor)===Number(id))||null;
  }

  function pagoById_cor(id){
    return (Array.isArray(state.detail&&state.detail.pagos)?state.detail.pagos:[])
      .find(row=>Number(row&&row.id_pago_cor)===Number(id))||null;
  }

  function catalogForType_cor(type){
    const catalog=state.detail&&state.detail.facturacion_catalogo?state.detail.facturacion_catalogo:{};
    return String(type||'').toUpperCase()==='ADITIVA'
      ? (Array.isArray(catalog.aditivas)?catalog.aditivas:[])
      : (Array.isArray(catalog.hitos)?catalog.hitos:[]);
  }

  function conceptOptions_cor(type,selectedId){
    return catalogForType_cor(type).map(item=>{
      const id=Number(item&&item.id_concepto);
      if(!Number.isInteger(id)||id<=0) return '';
      return `<option value="${id}"${id===Number(selectedId)?' selected':''}>${escapeHtml_cor(text_cor(item.label))}</option>`;
    }).join('');
  }

  function facturaConceptId_cor(factura){
    return String(factura&&factura.tipo_concepto||'').toUpperCase()==='ADITIVA'
      ? Number(factura&&factura.id_aditiva_cor)
      : Number(factura&&factura.id_fuente_cor);
  }

  function input_cor(value,attrs){
    return `<input class="ccor-f6-input" ${attrs||''} value="${escapeHtml_cor(raw_cor(value))}">`;
  }

  function beginFacturaEdit_cor(id){
    if(isViewerReadonly_cor()) return;
    const factura=facturaById_cor(id);
    const row=document.querySelector(`.ccor-ec-facturas-table tbody tr[data-factura-id="${Number(id)}"]`);
    if(!factura||!row) return;
    cancelCurrentEdit_cor();
    state.deletePending=null;
    state.editing=`factura:${Number(id)}`;
    state.editSnapshot={key:state.editing,row,html:row.innerHTML};
    const cells=row.children;
    if(cells.length<12){state.editing=null;return;}
    const type=String(factura.tipo_concepto||'HITO').toUpperCase()==='ADITIVA'?'ADITIVA':'HITO';
    const conceptId=facturaConceptId_cor(factura);
    cells[0].innerHTML=input_cor(factura.factura,'data-f6-factura-folio maxlength="150" aria-label="Factura"');
    cells[1].innerHTML=`<select class="ccor-f6-input" data-f6-factura-tipo aria-label="Tipo"><option value="HITO"${type==='HITO'?' selected':''}>Hito</option><option value="ADITIVA"${type==='ADITIVA'?' selected':''}>Aditiva</option></select>`;
    cells[2].innerHTML=`<select class="ccor-f6-input" data-f6-factura-concepto aria-label="Concepto">${conceptOptions_cor(type,conceptId)}</select>`;
    cells[3].innerHTML=input_cor(factura.fecha_factura,'type="date" data-f6-factura-fecha aria-label="Fecha factura"');
    cells[4].innerHTML=`<input class="ccor-f6-input" data-f6-factura-moneda value="${escapeHtml_cor(raw_cor(factura.moneda))}" readonly aria-label="Moneda">`;
    cells[5].innerHTML=input_cor(factura.subtotal,'type="number" min="0" step="0.01" data-f6-factura-subtotal aria-label="Subtotal"');
    cells[6].innerHTML=input_cor(factura.iva,'type="number" min="0" step="0.01" data-f6-factura-iva aria-label="IVA"');
    cells[7].innerHTML=`<input class="ccor-f6-input" data-f6-factura-total value="${escapeHtml_cor(raw_cor(factura.total))}" readonly aria-label="Total">`;
    cells[8].innerHTML=`<span class="ccor-f6-readonly">${escapeHtml_cor(text_cor(factura.estatus_factura))}</span>`;
    cells[9].innerHTML=input_cor(factura.fecha_vencimiento,'type="date" data-f6-factura-vencimiento aria-label="Fecha vencimiento"');
    cells[10].innerHTML=`<span class="ccor-f6-readonly">${escapeHtml_cor(text_cor(factura.estatus_cobranza))}</span>`;
    cells[11].innerHTML=`<div class="ccor-f6-actions"><button class="ccor-f6-btn ccor-f6-btn-primary" type="button" data-f6-save data-kind="factura" data-id="${Number(id)}">Guardar</button><button class="ccor-f6-btn" type="button" data-f6-cancel-edit>Cancelar</button></div>`;
    updateFacturaComputed_cor(row);
  }

  function updateFacturaComputed_cor(row){
    if(!row) return;
    const subtotal=number_cor(row.querySelector('[data-f6-factura-subtotal]')?.value)||0;
    const iva=number_cor(row.querySelector('[data-f6-factura-iva]')?.value)||0;
    const total=row.querySelector('[data-f6-factura-total]');
    if(total) total.value=(Math.round((subtotal+iva)*100)/100).toFixed(2);
    const type=String(row.querySelector('[data-f6-factura-tipo]')?.value||'HITO').toUpperCase();
    const conceptId=Number(row.querySelector('[data-f6-factura-concepto]')?.value);
    const concept=catalogForType_cor(type).find(item=>Number(item&&item.id_concepto)===conceptId);
    const moneda=row.querySelector('[data-f6-factura-moneda]');
    if(moneda) moneda.value=raw_cor(concept&&concept.moneda);
  }

  function beginPagoEdit_cor(id){
    if(isViewerReadonly_cor()) return;
    const pago=pagoById_cor(id);
    const row=document.querySelector(`.ccor-ec-pagos-table tbody tr[data-pago-id="${Number(id)}"]`);
    if(!pago||!row) return;
    cancelCurrentEdit_cor();
    state.deletePending=null;
    state.editing=`pago:${Number(id)}`;
    state.editSnapshot={key:state.editing,row,html:row.innerHTML};
    const cells=row.children;
    if(cells.length<7){state.editing=null;return;}
    cells[0].innerHTML=`<b>${escapeHtml_cor(id)}</b>`;
    cells[1].innerHTML=input_cor(pago.complemento_pago,'data-f6-pago-complemento maxlength="255" aria-label="Complemento Pago"');
    cells[2].innerHTML=input_cor(pago.fecha_pago,'type="date" data-f6-pago-fecha aria-label="Fecha Pago"');
    cells[3].innerHTML=input_cor(pago.importe_complemento_pago,'type="number" step="0.01" data-f6-pago-importe aria-label="Importe"');
    cells[5].innerHTML=`<span class="ccor-f6-readonly">${escapeHtml_cor(text_cor(pago.estado))}</span>`;
    cells[6].innerHTML=`<div class="ccor-f6-actions"><button class="ccor-f6-btn ccor-f6-btn-primary" type="button" data-f6-save data-kind="pago" data-id="${Number(id)}">Guardar</button><button class="ccor-f6-btn" type="button" data-f6-cancel-edit>Cancelar</button></div>`;
  }

  function cancelCurrentEdit_cor(){
    if(!state.editing) return;
    const snapshot=state.editSnapshot;
    state.editing=null;
    state.editSnapshot=null;
    if(snapshot&&snapshot.row&&snapshot.row.isConnected){
      snapshot.row.innerHTML=snapshot.html;
      scheduleDecorate_cor();
      return;
    }
    scheduleDecorate_cor();
  }

  async function saveFactura_cor(id){
    const row=document.querySelector(`.ccor-ec-facturas-table tbody tr[data-factura-id="${Number(id)}"]`);
    if(!row||isViewerReadonly_cor()) return false;
    const type=String(row.querySelector('[data-f6-factura-tipo]')?.value||'').toUpperCase();
    const conceptId=Number(row.querySelector('[data-f6-factura-concepto]')?.value);
    const payload={
      tipo_concepto:type,
      id_concepto:conceptId,
      factura:String(row.querySelector('[data-f6-factura-folio]')?.value||'').trim(),
      fecha_factura:String(row.querySelector('[data-f6-factura-fecha]')?.value||'').trim()||null,
      subtotal:String(row.querySelector('[data-f6-factura-subtotal]')?.value||'').trim()||null,
      iva:String(row.querySelector('[data-f6-factura-iva]')?.value||'').trim()||null,
      fecha_vencimiento:String(row.querySelector('[data-f6-factura-vencimiento]')?.value||'').trim()||null
    };
    if(!payload.factura||!Number.isInteger(conceptId)||conceptId<=0){
      setStatus_cor('factura','Captura Factura y selecciona un concepto válido.','error');
      return false;
    }
    return mutate_cor('factura',`${LIST_PATH}/${encodeURIComponent(state.ppns)}/facturas/${Number(id)}`,{method:'PUT',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),dedupe:false});
  }

  async function savePago_cor(id){
    const row=document.querySelector(`.ccor-ec-pagos-table tbody tr[data-pago-id="${Number(id)}"]`);
    if(!row||isViewerReadonly_cor()) return false;
    const payload={
      complemento_pago:String(row.querySelector('[data-f6-pago-complemento]')?.value||'').trim()||null,
      fecha_complemento_pago:String(row.querySelector('[data-f6-pago-fecha]')?.value||'').trim()||null,
      importe_complemento_pago:String(row.querySelector('[data-f6-pago-importe]')?.value||'').trim()||null
    };
    return mutate_cor('pago',`${LIST_PATH}/${encodeURIComponent(state.ppns)}/pagos/${Number(id)}`,{method:'PUT',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),dedupe:false});
  }

  async function deleteRecord_cor(kind,id){
    if(isViewerReadonly_cor()) return false;
    const path=kind==='factura'
      ? `${LIST_PATH}/${encodeURIComponent(state.ppns)}/facturas/${Number(id)}`
      : `${LIST_PATH}/${encodeURIComponent(state.ppns)}/pagos/${Number(id)}`;
    return mutate_cor(kind,path,{method:'DELETE',headers:{'Accept':'application/json'},dedupe:false});
  }

  async function mutate_cor(kind,path,options){
    setStatus_cor(kind,'Guardando cambios...','loading');
    document.querySelectorAll('.ccor-f6-btn').forEach(button=>{button.disabled=true;});
    try{
      await apiRequest_cor(path,options);
      clearActionState_cor();
      if(window.ManttoHttp&&typeof window.ManttoHttp.invalidate==='function'){
        window.ManttoHttp.invalidate(LIST_PATH+'/'+encodeURIComponent(state.ppns));
      }
      setStatus_cor(kind,'Cambios guardados.','success');
      await refreshMain_cor();
      return true;
    }catch(error){
      setStatus_cor(kind,errorText_cor(error),'error');
      return false;
    }finally{
      document.querySelectorAll('.ccor-f6-btn').forEach(button=>{button.disabled=false;});
    }
  }

  async function refreshMain_cor(){
    state.detail=null;
    state.requestSeq+=1;
    if(window.ManttoCobranzaCorEstadosCuenta&&typeof window.ManttoCobranzaCorEstadosCuenta.refresh==='function'){
      await Promise.resolve(window.ManttoCobranzaCorEstadosCuenta.refresh());
    }
    await loadDetailData_cor(true);
  }

  function scheduleRefreshAfterRender_cor(force){
    const ppns=activePpns_cor();
    if(!ppns) return;
    if(force||!state.detail||state.ppns.toUpperCase()!==ppns.toUpperCase()) loadDetailData_cor(Boolean(force));
    else scheduleDecorate_cor();
  }

  function setDeletePending_cor(kind,id){
    cancelCurrentEdit_cor();
    state.deletePending=`${kind}:${Number(id)}`;
    scheduleDecorate_cor();
  }

  function clearDeletePending_cor(){
    state.deletePending=null;
    scheduleDecorate_cor();
  }

  function handleClick_cor(event){
    if(navigation_cor().route!==ROUTE) return;
    const edit=event.target.closest('[data-f6-edit]');
    if(edit){
      const kind=edit.dataset.kind;
      const id=Number(edit.dataset.id);
      if(kind==='factura') beginFacturaEdit_cor(id); else if(kind==='pago') beginPagoEdit_cor(id);
      return;
    }
    const remove=event.target.closest('[data-f6-delete]');
    if(remove){setDeletePending_cor(remove.dataset.kind,Number(remove.dataset.id));return;}
    const confirm=event.target.closest('[data-f6-delete-confirm]');
    if(confirm){deleteRecord_cor(confirm.dataset.kind,Number(confirm.dataset.id));return;}
    if(event.target.closest('[data-f6-delete-cancel]')){clearDeletePending_cor();return;}
    const save=event.target.closest('[data-f6-save]');
    if(save){
      if(save.dataset.kind==='factura') saveFactura_cor(Number(save.dataset.id));
      else if(save.dataset.kind==='pago') savePago_cor(Number(save.dataset.id));
      return;
    }
    if(event.target.closest('[data-f6-cancel-edit]')){cancelCurrentEdit_cor();}
  }

  function handleChange_cor(event){
    if(!state.editing||!String(state.editing).startsWith('factura:')) return;
    const row=event.target.closest('.ccor-ec-facturas-table tbody tr[data-factura-id]');
    if(!row) return;
    if(event.target.matches('[data-f6-factura-tipo]')){
      const type=String(event.target.value||'HITO').toUpperCase();
      const select=row.querySelector('[data-f6-factura-concepto]');
      if(select) select.innerHTML=conceptOptions_cor(type,null);
      updateFacturaComputed_cor(row);
      return;
    }
    if(event.target.matches('[data-f6-factura-concepto]')) updateFacturaComputed_cor(row);
  }

  function handleInput_cor(event){
    if(!event.target.matches('[data-f6-factura-subtotal],[data-f6-factura-iva]')) return;
    updateFacturaComputed_cor(event.target.closest('.ccor-ec-facturas-table tbody tr[data-factura-id]'));
  }

  function installObserver_cor(){
    const root=document.getElementById('view-placeholder');
    if(!root||state.observer) return;
    state.observer=new MutationObserver(()=>{
      if(activePpns_cor()) scheduleDecorate_cor();
    });
    state.observer.observe(root,{childList:true,subtree:true});
  }

  function onNavigation_cor(){
    const ppns=activePpns_cor();
    if(!ppns){
      state.detail=null;
      state.ppns='';
      clearActionState_cor();
      return;
    }
    scheduleRefreshAfterRender_cor(false);
  }

  document.addEventListener('click',handleClick_cor);
  document.addEventListener('change',handleChange_cor);
  document.addEventListener('input',handleInput_cor);
  document.addEventListener('mantto:navigation',onNavigation_cor);
  document.addEventListener('mantto:module-loaded',onNavigation_cor);
  document.addEventListener('mantto:view-user-changed',()=>{
    state.detail=null;
    state.ppns='';
    clearActionState_cor();
    onNavigation_cor();
  });

  installObserver_cor();
  onNavigation_cor();

  window.ManttoCobranzaCorEstadoCuentaAcciones=Object.freeze({
    refresh:()=>loadDetailData_cor(true),
    decorate:decorate_cor
  });
})();
