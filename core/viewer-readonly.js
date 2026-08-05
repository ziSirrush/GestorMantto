(function(){
  'use strict';

  const SAFE_METHODS=new Set(['GET','HEAD','OPTIONS']);
  const ALLOWED_MUTATION_PATHS=new Set(['/api/panel-control/viewer-close']);
  const BLOCKED_WORDS=[
    'guardar','save','eliminar','delete','borrar','remove','enviar comentario','send comment',
    'enviar','adjuntar','upload','subir archivo','restablecer','reset','desconectar','disconnect',
    'confirmar','confirmar cambios','guardar cambios','registrar comentario'
  ];
  const state={installed:false,observer:null};
  const nativeFetch=window.fetch.bind(window);

  function active(){
    return Boolean(window.ManttoAuth?.isViewingAs?.());
  }

  function methodOf(input,init){
    return String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  }

  function pathOf(input){
    try{
      const raw=input instanceof Request?input.url:String(input||'');
      return new URL(raw,window.location.origin).pathname;
    }catch(error){
      return String(input||'').split('?')[0];
    }
  }

  function allowedMutation(input){
    return ALLOWED_MUTATION_PATHS.has(pathOf(input));
  }

  function viewerResponse(){
    return new Response(JSON.stringify({
      ok:false,
      code:'VIEWER_READ_ONLY',
      message:'Acción no disponible en modo visor. La vista es únicamente de consulta.'
    }),{
      status:403,
      headers:{'Content-Type':'application/json'}
    });
  }

  function ensureToast(){
    let toast=document.getElementById('viewer-readonly-toast');
    if(toast)return toast;
    toast=document.createElement('div');
    toast.id='viewer-readonly-toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.textContent='Modo visor: esta acción es solo de consulta.';
    document.body.appendChild(toast);
    return toast;
  }

  function notice(){
    const toast=ensureToast();
    toast.classList.add('show');
    window.clearTimeout(notice.timer);
    notice.timer=window.setTimeout(()=>toast.classList.remove('show'),2600);
  }

  function metadata(element){
    if(!element)return '';
    const values=[
      element.textContent,
      element.id,
      element.className,
      element.getAttribute?.('title'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('name'),
      element.getAttribute?.('onclick'),
      element.dataset?.action,
      element.dataset?.mutation
    ];
    return values.filter(Boolean).join(' ').toLowerCase();
  }

  function isExplicitlyAllowed(element){
    return Boolean(element?.closest?.('[data-viewer-readonly-allow="true"]')) ||
      element?.dataset?.viewerReadonlyAllow==='true' ||
      element?.id==='user-viewer-exit';
  }

  function isMutationControl(element){
    if(!element || isExplicitlyAllowed(element))return false;
    if(element.matches?.('input[type="file"]'))return true;
    if(element.dataset?.viewerMutation==='true')return true;
    if(element.matches?.('button[type="submit"],input[type="submit"]'))return true;
    const text=metadata(element);
    return BLOCKED_WORDS.some(word=>text.includes(word));
  }

  function markControl(element){
    if(!element || element.dataset?.viewerReadonlyPrepared==='1')return;
    if(!isMutationControl(element))return;
    element.dataset.viewerReadonlyPrepared='1';
    element.dataset.viewerReadonlyBlocked='1';
    element.classList.add('viewer-readonly-control');
    element.setAttribute('aria-disabled','true');
    element.setAttribute('title','Acción no disponible en modo visor');
    if(element.matches?.('input[type="file"]'))element.disabled=true;
  }

  function unmarkControl(element){
    if(!element || element.dataset?.viewerReadonlyPrepared!=='1')return;
    delete element.dataset.viewerReadonlyPrepared;
    delete element.dataset.viewerReadonlyBlocked;
    element.classList.remove('viewer-readonly-control');
    element.removeAttribute('aria-disabled');
    if(element.matches?.('input[type="file"]'))element.disabled=false;
  }

  function apply(root=document){
    const enabled=active();
    document.body.classList.toggle('viewer-readonly',enabled);
    const nodes=[];
    if(root?.matches?.('button,input[type="submit"],input[type="file"],[data-viewer-mutation]'))nodes.push(root);
    root?.querySelectorAll?.('button,input[type="submit"],input[type="file"],[data-viewer-mutation]')?.forEach(node=>nodes.push(node));
    nodes.forEach(node=>enabled?markControl(node):unmarkControl(node));
  }

  function findBlockedControl(target){
    const control=target?.closest?.('button,input[type="submit"],input[type="file"],[data-viewer-mutation]');
    return control?.dataset?.viewerReadonlyBlocked==='1'?control:null;
  }

  function interceptClick(event){
    if(!active())return;
    const blocked=findBlockedControl(event.target);
    if(!blocked)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    notice();
  }

  function interceptSubmit(event){
    if(!active())return;
    const form=event.target;
    if(form?.dataset?.viewerReadonlyAllow==='true')return;
    if(!form?.closest?.('#app'))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    notice();
  }

  function installFetchGuard(){
    if(window.fetch.__manttoViewerReadOnly)return;
    const guardedFetch=function(input,init){
      const method=methodOf(input,init);
      if(active()&&!SAFE_METHODS.has(method)&&!allowedMutation(input)){
        notice();
        return Promise.resolve(viewerResponse());
      }
      return nativeFetch(input,init);
    };
    guardedFetch.__manttoViewerReadOnly=true;
    window.fetch=guardedFetch;
  }

  function installObserver(){
    if(state.observer)return;
    state.observer=new MutationObserver(records=>{
      if(!active())return;
      records.forEach(record=>record.addedNodes.forEach(node=>{
        if(node.nodeType===Node.ELEMENT_NODE)apply(node);
      }));
    });
    state.observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function refresh(){
    apply(document);
  }

  function init(){
    if(state.installed)return;
    state.installed=true;
    installFetchGuard();
    installObserver();
    document.addEventListener('click',interceptClick,true);
    document.addEventListener('submit',interceptSubmit,true);
    document.addEventListener('mantto:auth-ready',refresh);
    document.addEventListener('mantto:view-user-changed',refresh);
    refresh();
  }

  init();
  window.ManttoViewerReadOnly={active,refresh,notice};
})();
