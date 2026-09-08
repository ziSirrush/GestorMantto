(function(){
  'use strict';

  if(window.ManttoPortafolioInteres) return;

  const API=(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');
  const CONTROL_ID='mg-portafolio-interest-control';

  function authHeaders(){
    return Object.assign(
      {'Accept':'application/json'},
      window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{}
    );
  }

  function isViewingAs(){
    return Boolean(
      window.ManttoAuth&&
      typeof window.ManttoAuth.isViewingAs==='function'&&
      window.ManttoAuth.isViewingAs()
    );
  }

  async function request(path,options={}){
    const headers=Object.assign({},authHeaders(),options.headers||{});
    const response=await fetch(API+path,Object.assign({cache:'no-store'},options,{headers}));
    const raw=await response.text();
    let json={};
    try{json=raw?JSON.parse(raw):{};}catch(_error){throw new Error('El backend respondió contenido no JSON.');}
    if(!response.ok||json.ok===false){
      const error=new Error(json.message||json.error||('Error HTTP '+response.status));
      error.status=response.status;
      error.code=json.code||null;
      throw error;
    }
    return json;
  }

  function getJson(path){return request(path);}
  function putJson(path,body){
    return request(path,{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body||{})
    });
  }

  function ensureStyles(){
    if(document.getElementById('mg-portafolio-interest-styles'))return;
    const style=document.createElement('style');
    style.id='mg-portafolio-interest-styles';
    style.textContent=`
      .mg-interest-card{display:flex;align-items:center;justify-content:space-between;gap:14px;background:#fff;border:1px solid rgba(13,46,110,.18);border-radius:12px;padding:11px 14px;margin-bottom:14px;box-shadow:0 4px 14px rgba(15,23,42,.04)}
      .mg-interest-copy{min-width:0}.mg-interest-copy strong{display:block;color:#0D2E6E;font-size:13px}.mg-interest-copy span{display:block;margin-top:3px;color:#64748B;font-size:11px;line-height:1.35}
      .mg-interest-toggle{display:inline-flex;align-items:center;gap:8px;color:#0D2E6E;font-size:12px;font-weight:800;white-space:nowrap;cursor:pointer}.mg-interest-toggle input{width:18px;height:18px;accent-color:#1455d9;cursor:pointer}.mg-interest-toggle input:disabled{cursor:wait;opacity:.65}
      .mg-interest-status{font-size:10px;color:#64748B;margin-left:5px}.mg-interest-card.error{border-color:#fecaca}.mg-interest-card.error .mg-interest-copy span{color:#991b1b}
      @media(max-width:680px){.mg-interest-card{align-items:flex-start;flex-direction:column}.mg-interest-toggle{width:100%;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function clearControl(){
    const current=document.getElementById(CONTROL_ID);
    if(current)current.remove();
  }

  function normalizedPayload(payload){
    const source=payload&&typeof payload==='object'?payload:{};
    const type=String(source.type||'').trim().toLowerCase();
    const id=String(source.id||'').trim();
    return {source,type,id};
  }

  function isManttoTarget(payload){
    const {source,type,id}=normalizedPayload(payload);
    if(!['proyecto','equipo'].includes(type)||!id)return false;
    if(id.includes('|||'))return false;
    const marker=[source.source,source.template,source.origen].filter(Boolean).join(' ').toLowerCase();
    if(marker.includes('instalacion')||marker.includes('corellian')||marker.includes('cliente-unificado'))return false;
    return true;
  }

  function endpointFor(payload){
    const {type,id}=normalizedPayload(payload);
    if(type==='proyecto')return '/api/proyectos/'+encodeURIComponent(id)+'/interes';
    if(type==='equipo')return '/api/equipos/'+encodeURIComponent(id)+'/interes';
    return null;
  }

  function copyFor(payload,data){
    const {type}=normalizedPayload(payload);
    if(type==='proyecto'){
      const total=Number(data?.total_equipos||0);
      const activos=Number(data?.equipos_activos||0);
      const detail=data?.parcial
        ? `${activos} de ${total} equipos tienen seguimiento activo para ti.`
        : data?.activo
          ? `Los ${total} equipos visibles del proyecto generan seguimiento para ti.`
          : `Actívalo para seguir los ${total} equipos visibles del proyecto.`;
      return {title:'Proyecto de interés',detail};
    }
    return {
      title:'Equipo de interés',
      detail:data?.activo
        ? 'Las interacciones relacionadas con este equipo generan seguimiento para ti.'
        : 'Actívalo para recibir seguimiento de las interacciones de este equipo.'
    };
  }

  function createControl(payload,data){
    const root=document.createElement('div');
    root.id=CONTROL_ID;
    root.className='mg-interest-card';

    const copy=document.createElement('div');
    copy.className='mg-interest-copy';
    const strong=document.createElement('strong');
    const span=document.createElement('span');
    const texts=copyFor(payload,data);
    strong.textContent=texts.title;
    span.textContent=texts.detail;
    copy.append(strong,span);

    const label=document.createElement('label');
    label.className='mg-interest-toggle';
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.checked=Boolean(data?.activo);
    checkbox.indeterminate=Boolean(data?.parcial);
    checkbox.setAttribute('aria-label',texts.title);
    const text=document.createElement('span');
    text.textContent=data?.parcial?'Activo · con excepciones':(data?.activo?'Activo':'Inactivo');
    label.append(checkbox,text);

    root.append(copy,label);

    checkbox.addEventListener('change',async()=>{
      const requested=checkbox.checked;
      const previous={checked:!requested,indeterminate:Boolean(data?.parcial)};
      checkbox.indeterminate=false;
      checkbox.disabled=true;
      text.textContent='Guardando...';
      try{
        const endpoint=endpointFor(payload);
        const json=await putJson(endpoint,{activo:requested});
        const next=json.data||{};
        checkbox.checked=Boolean(next.activo);
        checkbox.indeterminate=Boolean(next.parcial);
        const nextCopy=copyFor(payload,next);
        strong.textContent=nextCopy.title;
        span.textContent=nextCopy.detail;
        text.textContent=next.parcial?'Activo · con excepciones':(next.activo?'Activo':'Inactivo');
        data=next;
        document.dispatchEvent(new CustomEvent('mantto:portafolio-interes-actualizado',{
          detail:{payload:Object.assign({},payload),data:next}
        }));
      }catch(error){
        checkbox.checked=previous.checked;
        checkbox.indeterminate=previous.indeterminate;
        text.textContent=previous.indeterminate?'Activo · con excepciones':(previous.checked?'Activo':'Inactivo');
        root.classList.add('error');
        span.textContent=error.message||'No fue posible actualizar el seguimiento.';
      }finally{
        checkbox.disabled=false;
      }
    });

    return root;
  }

  async function mount(payload){
    clearControl();
    if(isViewingAs()||!isManttoTarget(payload))return;

    const endpoint=endpointFor(payload);
    if(!endpoint)return;

    try{
      const json=await getJson(endpoint);
      const body=document.querySelector('#view-detalle .mg-detail-body')||document.querySelector('.mg-detail-body');
      if(!body)return;
      ensureStyles();
      body.insertBefore(createControl(payload,json.data||{}),body.firstChild||null);
    }catch(error){
      // 403: el usuario no tiene la nueva facultad; no se muestra el control.
      // 404: el registro ya no está dentro de su alcance actual.
      if(error.status===403||error.status===404)return;
      console.error('[PORTAFOLIO_INTERES_UI]',error);
    }
  }

  function installRenderHook(){
    const details=window.ManttoDetails;
    if(!details||typeof details.render!=='function')return false;
    if(details.render.__manttoPortafolioInterestHook===true)return true;
    const original=details.render;
    function wrappedRender(payload){
      const result=original.apply(this,arguments);
      if(result&&typeof result.then==='function'){
        return result.then(value=>{
          mount(payload);
          return value;
        });
      }
      setTimeout(()=>mount(payload),0);
      return result;
    }
    wrappedRender.__manttoPortafolioInterestHook=true;
    wrappedRender.__manttoOriginalRender=original;
    details.render=wrappedRender;
    return true;
  }

  ensureStyles();
  installRenderHook();

  window.ManttoPortafolioInteres=Object.freeze({
    mount,
    refresh(){
      const current=window.ManttoRouter&&window.ManttoRouter.getCurrent?window.ManttoRouter.getCurrent():null;
      if(current?.route==='detalle')return mount(current.payload||{});
      clearControl();
      return Promise.resolve();
    }
  });
})();
