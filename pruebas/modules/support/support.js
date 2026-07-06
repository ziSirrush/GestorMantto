(function(){
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const $ = id => document.getElementById(id);
  function apiGet(path){ return window.ManttoAuth ? window.ManttoAuth.apiGet(path) : fetch((window.MANTTO_API_BASE||'http://localhost:3001')+path).then(r=>r.json()); }
  function apiPost(path, body){ return window.ManttoAuth ? window.ManttoAuth.apiPost(path, body) : fetch((window.MANTTO_API_BASE||'http://localhost:3001')+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()); }
  function msg(id,text,type){ const el=$(id); if(!el) return; el.textContent=text||''; el.className='auth-msg '+(type||''); }
  async function loadHelp(){
    await Promise.allSettled([loadMenu(), loadFaq(), loadAvisos()]);
  }
  function optionButton(op){
    const action = op.accion_opcion || op.accion || '';
    const destino = op.id_destino || op.id_nodo_destino || '';
    return `<button class="help-item" data-action="${esc(action)}" data-destino="${esc(destino)}"><b>${esc(op.texto_opcion || op.nombre || 'Opción')}</b><span>${esc(action || 'Abrir')}</span></button>`;
  }
  async function loadMenu(idNodo){
    const box=$('help-menu'); if(box) box.innerHTML='<div class="empty-state">Cargando menú desde Aiven...</div>';
    try{
      const json = idNodo ? await apiGet('/api/support/node/'+encodeURIComponent(idNodo)) : await apiGet('/api/support/menu');
      const data = json.data || {}; const nodo=data.nodo||{}; const opciones=data.opciones||[];
      if(box){ box.innerHTML = `<div class="help-node"><h3>${esc(nodo.titulo_nodo || nodo.titulo || 'Centro de Ayuda')}</h3><p>${esc(nodo.descripcion_nodo || nodo.descripcion || '')}</p></div>` + (opciones.length ? opciones.map(optionButton).join('') : '<div class="empty-state">Sin opciones registradas.</div>'); }
      bindHelpOptions();
      return data;
    }catch(e){ if(box) box.innerHTML='<div class="empty-state">No se pudo cargar el menú de ayuda.</div>'; }
  }
  async function loadFaq(q){
    const box=$('help-faq'); if(box) box.innerHTML='<div class="empty-state">Cargando FAQ desde Aiven...</div>';
    try{
      const json = await apiGet('/api/support/faq' + (q ? ('?q='+encodeURIComponent(q)) : ''));
      const rows = json.data || [];
      if(box) box.innerHTML = rows.length ? rows.map(f=>`<article class="faq-item"><h3>${esc(f.pregunta_faq || f.pregunta)}</h3><p>${esc(f.respuesta_faq || f.respuesta)}</p></article>`).join('') : '<div class="empty-state">Sin preguntas frecuentes.</div>';
    }catch(e){ if(box) box.innerHTML='<div class="empty-state">No se pudo cargar FAQ.</div>'; }
  }
  async function loadAvisos(){
    const box=$('help-avisos'); if(box) box.innerHTML='<div class="empty-state">Cargando avisos desde Aiven...</div>';
    try{
      const json = await apiGet('/api/support/avisos'); const rows=json.data||[];
      if(box) box.innerHTML = rows.length ? rows.map(a=>`<article class="aviso-item"><h3>${esc(a.nombre_aviso || a.titulo || 'Aviso')}</h3><p>${esc(a.descripcion_aviso || a.descripcion || '')}</p></article>`).join('') : '<div class="empty-state">Sin avisos activos.</div>';
    }catch(e){ if(box) box.innerHTML='<div class="empty-state">No se pudo cargar avisos.</div>'; }
  }
  function bindHelpOptions(){
    document.querySelectorAll('.help-item').forEach(btn=>{
      if(btn.dataset.bound==='1') return; btn.dataset.bound='1';
      btn.addEventListener('click',()=>{
        const action=(btn.dataset.action||'').toLowerCase(); const dest=btn.dataset.destino;
        if(action.includes('destino') || action.includes('nodo') || dest) loadMenu(dest);
        else if(action.includes('solicitud') || action.includes('ticket')) window.ManttoRouter?.go('support-request');
      });
    });
  }
  async function loadNoriMenu(){
    const body=$('pandaMessages'); if(!body) return;
    try{
      const data = await loadNoriNode(); renderNoriNode(data);
    }catch(e){ body.innerHTML='<div class="nori-msg bot">No pude cargar mis flujos desde Aiven.</div>'; }
  }
  async function loadNoriNode(id){
    const json = id ? await apiGet('/api/support/node/'+encodeURIComponent(id)) : await apiGet('/api/support/menu');
    return json.data || {};
  }
  function renderNoriNode(data){
    const body=$('pandaMessages'); if(!body) return;
    const nodo=data.nodo||{}; const opciones=data.opciones||[];
    body.innerHTML=`<div class="nori-msg bot"><strong>${esc(nodo.titulo_nodo || 'Nori')}</strong><br>${esc(nodo.descripcion_nodo || 'Selecciona una opción.')}</div><div class="nori-options">${opciones.map(op=>`<button class="nori-option" data-destino="${esc(op.id_destino||'')}" data-action="${esc(op.accion_opcion||'')}">${esc(op.texto_opcion||'Opción')}</button>`).join('')}<button class="nori-option" data-route="help">Abrir Centro de Ayuda</button><button class="nori-option" data-route="support-request">Crear solicitud de soporte</button></div>`;
    body.querySelectorAll('.nori-option').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const route=btn.dataset.route; if(route){ window.ManttoRouter?.go(route); return; }
        const action=(btn.dataset.action||'').toLowerCase(); const dest=btn.dataset.destino;
        if(dest){ const next=await loadNoriNode(dest); renderNoriNode(next); return; }
        if(action.includes('solicitud') || action.includes('ticket')) window.ManttoRouter?.go('support-request');
      });
    });
  }
  function bind(){
    $('help-refresh')?.addEventListener('click', loadHelp);
    $('help-search')?.addEventListener('input', ev=>loadFaq(ev.target.value.trim()));
    $('support-form')?.addEventListener('submit', async ev=>{
      ev.preventDefault(); msg('support-msg','Creando solicitud en Aiven...','info');
      try{
        await apiPost('/api/support/tickets', { modulo:$('support-module').value, asunto:$('support-subject').value, descripcion:$('support-description').value, prioridad:$('support-priority').value });
        msg('support-msg','Solicitud creada correctamente.','ok'); ev.target.reset();
      }catch(e){ msg('support-msg',e.message||'No se pudo crear la solicitud.','error'); }
    });
  }
  window.ManttoSupport = { init(){ bind(); loadHelp(); loadNoriMenu(); }, loadHelp, loadNoriMenu };
})();
