(function(){
  const API = () => window.ManttoAuth;
  const state = { ready:false, me:null, usuarios:[], selected:null, tab:'perfil', questions:[] };
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function initials(user){ return (user && user.iniciales) || String((user && user.nombre) || '--').split(/\s+/).map(p=>p[0]).join('').slice(0,2).toUpperCase(); }
  function parseJsonArray(value){ if(Array.isArray(value)) return value.filter(Boolean); if(!value) return []; try{ const v=JSON.parse(value); return Array.isArray(v)?v.filter(Boolean):[]; }catch(e){ return []; } }
  function rolesText(user){ const roles=parseJsonArray(user && user.roles_detalle).map(r=>r.rol).filter(Boolean); const base=(user && user.rol) ? [user.rol] : []; return Array.from(new Set(base.concat(roles))); }
  function zonesText(user){ const zs=parseJsonArray(user && user.zonas_detalle).map(z=>z.zona || z.nombre).filter(Boolean); return zs.length ? zs.join(', ') : 'Sin zonas asociadas'; }
  function message(id,text,type){ const el=$(id); if(!el) return; el.textContent=text||''; el.className='usr-msg '+(type||''); }
  function avatarHtml(user, cls){ return `<span class="usr-avatar ${cls||''}">${esc(initials(user))}</span>`; }
  function renderProfile(){
    const box=$('usr-profile-body'); if(!box) return; const me=state.me || {};
    const roles=rolesText(me); const chips=roles.length ? roles.map(r=>`<span class="usr-chip">${esc(r)}</span>`).join('') : '<span class="usr-chip">Sin roles asociados</span>';
    box.innerHTML=`
      <div class="usr-profile-top">${avatarHtml(me)}<div><h3 class="usr-name">${esc(me.nombre || 'Usuario')}</h3><p class="usr-role">${esc(me.rol || 'Sin rol principal')}</p><div class="usr-chip-row">${chips}</div></div></div>
      <div class="usr-info-grid">
        <div class="usr-info"><small>Correo</small><b>${esc(me.correo || '—')}</b></div>
        <div class="usr-info"><small>Área</small><b>${esc(me.area || '—')}</b></div>
        <div class="usr-info"><small>Puesto</small><b>${esc(me.puesto || '—')}</b></div>
        <div class="usr-info"><small>Empresa</small><b>${esc(me.empresa || '—')}</b></div>
        <div class="usr-info"><small>Reporta a</small><b>${esc(me.reporta_a_nombre || '—')}</b></div>
        <div class="usr-info"><small>Zonas</small><b>${esc(zonesText(me))}</b></div>
        <div class="usr-info"><small>Último acceso</small><b>${esc(me.ultimo_acceso || '—')}</b></div>
        <div class="usr-info"><small>Pregunta de seguridad</small><b>${esc(me.pregunta_seguridad || 'No configurada')}</b></div>
      </div>
      <div class="usr-actions"><button class="usr-btn" id="usr-open-pass" type="button">Cambiar contraseña</button><button class="usr-btn secondary" id="usr-open-secret" type="button">Cambiar pregunta/respuesta secreta</button></div>
      <form class="usr-form" id="usr-pass-form"><label>Contraseña actual<input id="usr-current-pass" type="password" autocomplete="current-password" required></label><label>Contraseña nueva<input id="usr-new-pass" type="password" autocomplete="new-password" required placeholder="Mínimo 10 caracteres"></label><label>Confirmar contraseña nueva<input id="usr-new-pass-confirm" type="password" autocomplete="new-password" required></label><button class="usr-btn" type="submit">Guardar contraseña</button><div id="usr-pass-msg" class="usr-msg"></div></form>
      <form class="usr-form" id="usr-secret-form"><label>Contraseña actual<input id="usr-secret-current-pass" type="password" autocomplete="current-password" required></label><label>Respuesta actual<input id="usr-current-answer" type="text" required></label><label>Nueva pregunta<select id="usr-new-question" required></select></label><label>Nueva respuesta<input id="usr-new-answer" type="text" required></label><button class="usr-btn" type="submit">Guardar pregunta</button><div id="usr-secret-msg" class="usr-msg"></div></form>`;
    bindProfileForms();
  }
  function bindProfileForms(){
    $('usr-open-pass')?.addEventListener('click',()=>{$('usr-pass-form')?.classList.toggle('open'); $('usr-secret-form')?.classList.remove('open');});
    $('usr-open-secret')?.addEventListener('click',async()=>{ $('usr-secret-form')?.classList.toggle('open'); $('usr-pass-form')?.classList.remove('open'); await loadQuestions(); });
    $('usr-pass-form')?.addEventListener('submit',async ev=>{ ev.preventDefault(); message('usr-pass-msg','Validando datos actuales...','info'); const np=$('usr-new-pass').value, cp=$('usr-new-pass-confirm').value; if(np!==cp){ message('usr-pass-msg','La contraseña nueva y su confirmación no coinciden.','error'); return; } try{ await API().apiPost('/api/auth/me/password',{ current_password:$('usr-current-pass').value, new_password:np, confirm_password:cp }); message('usr-pass-msg','Contraseña actualizada correctamente.','ok'); ev.target.reset(); }catch(err){ message('usr-pass-msg',(err.message || 'No fue posible actualizar.') + ' Contacta a soporte si tus datos actuales no coinciden.','error'); }});
    $('usr-secret-form')?.addEventListener('submit',async ev=>{ ev.preventDefault(); message('usr-secret-msg','Validando datos actuales...','info'); try{ await API().apiPost('/api/auth/me/security-question',{ current_password:$('usr-secret-current-pass').value, current_answer:$('usr-current-answer').value, id_pregunta:$('usr-new-question').value, new_answer:$('usr-new-answer').value }); message('usr-secret-msg','Pregunta de seguridad actualizada correctamente.','ok'); ev.target.reset(); await loadMe(); renderProfile(); }catch(err){ message('usr-secret-msg',(err.message || 'No fue posible actualizar.') + ' Contacta a soporte si tus datos actuales no coinciden.','error'); }});
  }
  async function loadQuestions(){ const sel=$('usr-new-question'); if(!sel) return; if(state.questions.length){ renderQuestions(); return; } sel.innerHTML='<option>Cargando...</option>'; const json=await API().apiGet('/api/auth/security-questions'); state.questions=json.data||[]; renderQuestions(); }
  function renderQuestions(){ const sel=$('usr-new-question'); if(sel) sel.innerHTML='<option value="">Selecciona una pregunta</option>'+state.questions.map(q=>`<option value="${esc(q.id_pregunta)}">${esc(q.pregunta)}</option>`).join(''); }
  function directoryDetailHtml(u){
    const roles=rolesText(u);
    return `
      <div class="usr-contact-detail" data-detail-id="${esc(u.id_SB)}">
        <div class="usr-detail-head">
          <div class="usr-profile-top usr-directory-profile">
            ${avatarHtml(u)}
            <div>
              <h3 class="usr-name">${esc(u.nombre)}</h3>
              <p class="usr-role">${esc(u.puesto || 'Sin puesto')}</p>
              <div class="usr-chip-row">${roles.length ? roles.map(r=>`<span class="usr-chip">${esc(r)}</span>`).join('') : '<span class="usr-chip">Sin roles asociados</span>'}</div>
            </div>
          </div>
          <button class="usr-close-detail" data-close-user="${esc(u.id_SB)}" type="button">Cerrar</button>
        </div>
        <div class="usr-info-grid">
          <div class="usr-info"><small>Correo</small><b>${esc(u.correo || '—')}</b></div>
          <div class="usr-info"><small>Área</small><b>${esc(u.area || '—')}</b></div>
          <div class="usr-info"><small>Puesto</small><b>${esc(u.puesto || '—')}</b></div>
          <div class="usr-info"><small>Empresa</small><b>${esc(u.empresa || '—')}</b></div>
          <div class="usr-info"><small>Reporta a</small><b>${esc(u.reporta_a_nombre || '—')}</b></div>
          <div class="usr-info"><small>Zonas operativas</small><b>${esc(zonesText(u))}</b></div>
        </div>
        <div class="usr-task-actions">
          <button class="usr-btn" data-user-task="ASSIGNED_BY" data-user-id="${esc(u.id_SB)}" type="button">Tareas que me asignó</button>
          <button class="usr-btn secondary" data-user-task="SHARED_RESPONSIBILITY" data-user-id="${esc(u.id_SB)}" type="button">Tareas en las que compartimos responsabilidad</button>
        </div>
      </div>`;
  }
  function renderDirectory(){
    const list=$('usr-list');
    if(!list) return;
    const q=String($('usr-search')?.value||'').toLowerCase().trim();
    const rows=state.usuarios.filter(u=>!q || [u.nombre,u.correo,u.area,u.puesto,u.empresa,u.rol].some(v=>String(v||'').toLowerCase().includes(q)));
    if(!rows.length){ list.innerHTML='<div class="usr-empty">No se encontraron usuarios.</div>'; return; }
    list.innerHTML=rows.map(u=>{
      const selected=state.selected && String(state.selected.id_SB)===String(u.id_SB);
      return `<article class="usr-contact-card ${selected?'active':''}">
        <button class="usr-contact" type="button" data-id="${esc(u.id_SB)}" aria-expanded="${selected?'true':'false'}">
          ${avatarHtml(u)}
          <span class="usr-contact-main"><span class="usr-contact-name">${esc(u.nombre)}</span><span class="usr-contact-meta">${esc(u.area || 'Sin área')} · ${esc(u.correo || 'Sin correo')}</span></span>
          <span class="usr-contact-chevron" aria-hidden="true">⌄</span>
        </button>
        ${selected ? directoryDetailHtml(u) : ''}
      </article>`;
    }).join('');
    list.querySelectorAll('.usr-contact[data-id]').forEach(btn=>btn.addEventListener('click',()=>selectUser(btn.dataset.id)));
    list.querySelectorAll('[data-close-user]').forEach(btn=>btn.addEventListener('click',ev=>{ ev.stopPropagation(); state.selected=null; renderDirectory(); }));
    list.querySelectorAll('[data-user-task]').forEach(btn=>btn.addEventListener('click',ev=>{
      ev.stopPropagation();
      const user=state.usuarios.find(u=>String(u.id_SB)===String(btn.dataset.userId));
      openUserTasks(btn.dataset.userTask,user);
    }));
  }
  function selectUser(id){
    const next=state.usuarios.find(u=>String(u.id_SB)===String(id)) || null;
    state.selected=state.selected && next && String(state.selected.id_SB)===String(next.id_SB) ? null : next;
    renderDirectory();
    if(state.selected){
      requestAnimationFrame(()=>document.querySelector(`[data-detail-id="${CSS.escape(String(state.selected.id_SB))}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'}));
    }
  }
  function openUserTasks(mode, user){
    if(!user || !window.ManttoRouter) return;
    window.ManttoRouter.openTarget({
      module:'tareas',
      taskContext:{
        mode,
        userId:user.id_SB,
        name:user.nombre || 'Usuario',
        initials:user.iniciales || '',
        email:user.correo || ''
      },
      source:'directorio-usuarios'
    });
  }
  function renderDetail(){
    const box=$('usr-detail');
    if(box){ box.hidden=true; box.innerHTML=''; }
  }
  async function loadMe(){ const json=await API().apiGet('/api/auth/me'); state.me=json.data||json.user||{}; }
  async function loadUsers(){ const json=await API().apiGet('/api/usuarios'); state.usuarios=json.data||[]; }
  function setTab(tab){ state.tab=tab; document.querySelectorAll('.usr-tab').forEach(b=>b.classList.toggle('active', b.dataset.usrTab===tab)); document.querySelectorAll('.usr-panel').forEach(p=>p.classList.toggle('active', p.dataset.usrPanel===tab)); }
  function renderShell(){ const view=$('view-usuarios'); if(!view) return; view.innerHTML=`<div class="usr-page"><div class="usr-tabs"><button class="usr-tab active" data-usr-tab="perfil" type="button">MI PERFIL</button><button class="usr-tab" data-usr-tab="directorio" type="button">DIRECTORIO</button></div><div class="usr-shell"><section class="usr-card usr-panel active" data-usr-panel="perfil"><div class="usr-card-head"><div><h2>Mi perfil</h2><p>Información de tu cuenta y seguridad.</p></div></div><div class="usr-body" id="usr-profile-body"><div class="usr-loading">Cargando perfil...</div></div></section><section class="usr-card usr-panel" data-usr-panel="directorio"><div class="usr-card-head"><div><h2>Directorio de usuarios</h2><p>Consulta interna tipo contactos.</p></div></div><div class="usr-body"><input class="usr-search" id="usr-search" type="search" placeholder="Buscar por nombre, área, correo o rol"></div><div class="usr-list" id="usr-list"><div class="usr-loading">Cargando usuarios...</div></div><div class="usr-detail" id="usr-detail" hidden></div></section></div></div>`; document.querySelectorAll('.usr-tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.usrTab))); $('usr-search')?.addEventListener('input', renderDirectory); }
  async function init(){ const view=$('view-usuarios'); if(!view) return; renderShell(); setTab(state.tab); try{ await Promise.all([loadMe(), loadUsers()]); renderProfile(); renderDirectory(); }catch(err){ view.innerHTML=`<div class="usr-page"><div class="usr-card"><div class="usr-empty">No se pudo cargar Usuarios. ${esc(err.message||'')}</div></div></div>`; } }
  window.ManttoUsuarios={ init };
})();
