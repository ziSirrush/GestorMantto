(function(){
  'use strict';

  if(window.ManttoCobranzaCorEstadoCuentaPdf) return;

  const ROUTE='cobranza-estados-cuenta';
  // [BLT NOW | 2026-11-18 | PDF COR PAUSADO] Reactivar solo tras aprobar el formato.
  const PDF_EXPORT_ENABLED_COR=false;
  const BUTTON_ID='ccor-ec-pdf-export';
  const PRINT_ROOT_ID='ccor-ec-pdf-print-root';
  const PRINT_STYLE_ID='ccor-ec-pdf-print-style';
  const DETAIL_SELECTOR='#view-placeholder .ccor-ec-detail-page';

  const PRINT_CSS=`
    #${PRINT_ROOT_ID}{display:none!important}
    @page{size:A3 landscape;margin:10mm}
    @media print{
      html,body{width:auto!important;height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important}
      body>*:not(#${PRINT_ROOT_ID}){display:none!important}
      #${PRINT_ROOT_ID}{display:block!important;position:static!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;visibility:visible!important;background:#fff!important}
      #${PRINT_ROOT_ID},#${PRINT_ROOT_ID} *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      #${PRINT_ROOT_ID} .ccor-ec-page{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;overflow:visible!important;margin:0!important;padding:0!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-page>*{display:block;max-width:none!important;min-width:0!important;margin-bottom:12px!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-toolbar,
      #${PRINT_ROOT_ID} .ccor-ec-detail-title{display:flex!important;align-items:center!important;justify-content:space-between!important}
      #${PRINT_ROOT_ID} .ccor-ec-project-header{display:grid!important;grid-template-columns:2fr 1.25fr .7fr .7fr .7fr!important;break-inside:avoid-page!important}
      #${PRINT_ROOT_ID} .ccor-ec-project-header>div{border-top:0!important;grid-column:auto!important;margin-top:0!important}
      #${PRINT_ROOT_ID} .ccor-ec-project-header b{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere!important}
      #${PRINT_ROOT_ID} .ccor-ec-summary-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:14px!important;break-inside:avoid-page!important}
      #${PRINT_ROOT_ID} .ccor-ec-summary-card{display:block!important;break-inside:avoid-page!important}
      #${PRINT_ROOT_ID} .ccor-ec-summary-line{display:grid!important;grid-template-columns:72px repeat(4,minmax(0,1fr))!important}
      #${PRINT_ROOT_ID} .ccor-ec-summary-line>div{grid-column:auto!important;min-width:0!important;border-bottom:0!important}
      #${PRINT_ROOT_ID} .ccor-ec-summary-line b{font-size:10px!important;white-space:normal!important;overflow-wrap:anywhere!important}
      #${PRINT_ROOT_ID} .ccor-ec-summary-currency{grid-column:auto!important}
      #${PRINT_ROOT_ID} .ccor-ec-account-section{display:block!important;overflow:visible!important;break-inside:auto!important;box-shadow:none!important}
      #${PRINT_ROOT_ID} .ccor-ec-account-title{break-after:avoid-page!important;page-break-after:avoid!important}
      #${PRINT_ROOT_ID} .ccor-ec-table-wrap,
      #${PRINT_ROOT_ID} .ccor-ec-detail-table-wrap{display:block!important;width:100%!important;max-width:none!important;height:auto!important;max-height:none!important;min-width:0!important;overflow:visible!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-table{display:table!important;table-layout:auto!important;width:100%!important;max-width:100%!important;min-width:0!important;border-collapse:collapse!important;font-size:9px!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-table thead{display:table-header-group!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-table tbody{display:table-row-group!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-table tr{display:table-row!important;break-inside:avoid-page!important;page-break-inside:avoid!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-table th,
      #${PRINT_ROOT_ID} .ccor-ec-detail-table td{display:table-cell!important;padding:5px 4px!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;font-size:9px!important;line-height:1.2!important;min-width:0!important}
      #${PRINT_ROOT_ID} .ccor-ec-detail-table .ccor-ec-condition{min-width:110px!important;text-align:left!important}
      #${PRINT_ROOT_ID} .ccor-ec-aditivas-table .ccor-ec-aditivas-description{min-width:150px!important;text-align:left!important}
      #${PRINT_ROOT_ID} .ccor-ec-num{white-space:normal!important}
      #${PRINT_ROOT_ID} .ccor-ec-info-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important}
      #${PRINT_ROOT_ID} .ccor-ec-info-grid .ccor-ec-info-card{grid-column:auto!important;break-inside:avoid-page!important}
      #${PRINT_ROOT_ID} .ccor-ec-info-card dl{grid-template-columns:1fr 1fr!important}
      #${PRINT_ROOT_ID} .ccor-ec-facturas-section,
      #${PRINT_ROOT_ID} .ccor-ec-pagos-section,
      #${PRINT_ROOT_ID} .ccor-ec-total-popover,
      #${PRINT_ROOT_ID} .ccor-ec-payment-popover,
      #${PRINT_ROOT_ID} button{display:none!important}
      #${PRINT_ROOT_ID} .ccor-ec-pdf-static-value{display:inline!important;border:0!important;background:none!important;color:inherit!important;font:inherit!important}
    }`;

  function currentRoute_cor(){
    const router=window.ManttoRouter;
    if(!router||typeof router.getCurrent!=='function') return '';
    return String((router.getCurrent()||{}).route||'');
  }

  function detailView_cor(){
    if(currentRoute_cor()!==ROUTE) return null;
    return document.querySelector(DETAIL_SELECTOR);
  }

  function ensureExportButton_cor(){
    const view=detailView_cor();
    const host=view&&view.querySelector('.ccor-ec-hero-actions');
    if(!host||host.querySelector('#'+BUTTON_ID)) return false;
    const btn=document.createElement('button');
    btn.type='button';
    btn.id=BUTTON_ID;
    btn.className='ccor-ec-btn ccor-ec-btn-primary';
    btn.disabled=!PDF_EXPORT_ENABLED_COR;
    btn.textContent=PDF_EXPORT_ENABLED_COR?'Exportar PDF':'PDF en revisión';
    btn.title=PDF_EXPORT_ENABLED_COR
      ? 'Abrir impresion y elegir Guardar como PDF'
      : 'Formato PDF pendiente de aprobación';
    btn.setAttribute('aria-label',PDF_EXPORT_ENABLED_COR
      ? 'Exportar Estado de Cuenta a PDF'
      : 'Exportación PDF deshabilitada: formato en revisión');
    if(!PDF_EXPORT_ENABLED_COR){
      btn.style.opacity='0.55';
      btn.style.cursor='not-allowed';
    }
    host.insertBefore(btn,host.firstChild);
    return true;
  }

  function safeFilename_cor(text){
    return String(text||'proyecto').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'_')
      .replace(/^_+|_+$/g,'').slice(0,80)||'proyecto';
  }

  function createSnapshot_cor(view){
    const snapshot=view.cloneNode(true);
    const ignore=[
      '.ccor-ec-facturas-section',
      '.ccor-ec-pagos-section',
      '.ccor-ec-total-popover',
      '.ccor-ec-payment-popover',
      '[role="dialog"]',
      '[hidden]'
    ];
    snapshot.querySelectorAll(ignore.join(',')).forEach(el=>el.remove());
    snapshot.querySelectorAll('button').forEach(el=>{
      if(el.matches('[data-payment-breakdown-toggle]')){
        const value=document.createElement('span');
        value.className='ccor-ec-pdf-static-value';
        value.textContent=el.textContent||'';
        el.replaceWith(value);
      }else{
        el.remove();
      }
    });
    return snapshot;
  }

  function printEstadoCuenta_cor(){
    if(!PDF_EXPORT_ENABLED_COR) return false;
    const view=detailView_cor();
    if(!view) return false;
    const existing=document.getElementById(PRINT_ROOT_ID);
    if(existing) existing.remove();
    const oldStyle=document.getElementById(PRINT_STYLE_ID);
    if(oldStyle) oldStyle.remove();

    const snapshot=createSnapshot_cor(view);
    const ppns=String(snapshot.querySelector('.ccor-ec-project-header > div:nth-child(2) b')?.textContent||'').trim();
    const root=document.createElement('section');
    root.id=PRINT_ROOT_ID;
    root.appendChild(snapshot);
    const css=document.createElement('style');
    css.id=PRINT_STYLE_ID;
    css.textContent=PRINT_CSS;

    const oldTitle=document.title;
    let cleaned=false;
    const cleanup=()=>{
      if(cleaned) return;
      cleaned=true;
      root.remove();
      css.remove();
      document.title=oldTitle;
      window.removeEventListener('afterprint',cleanup);
    };
    document.head.appendChild(css);
    document.body.appendChild(root);
    document.title='BLT_NOW_Estado_de_Cuenta_'+safeFilename_cor(ppns);
    window.addEventListener('afterprint',cleanup,{once:true});
    try{
      window.print();
      return true;
    }catch(error){
      cleanup();
      throw error;
    }
  }

  function initialize_cor(){
    const container=document.getElementById('view-placeholder');
    if(!container) return;
    if(typeof MutationObserver==='function'){
      const observer=new MutationObserver(ensureExportButton_cor);
      observer.observe(container,{childList:true,subtree:true});
    }
    document.addEventListener('mantto:navigation',ensureExportButton_cor);
    document.addEventListener('click',event=>{
      const btn=event.target.closest('#'+BUTTON_ID);
      if(!btn||!detailView_cor()) return;
      event.preventDefault();
      if(!PDF_EXPORT_ENABLED_COR) return;
      try{printEstadoCuenta_cor();}
      catch(error){window.alert('No fue posible preparar el PDF: '+String(error&&error.message||error));}
    },true);
    ensureExportButton_cor();
  }

  window.ManttoCobranzaCorEstadoCuentaPdf=Object.freeze({
    print:printEstadoCuenta_cor
  });
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initialize_cor,{once:true});
  }else{
    initialize_cor();
  }
})();
