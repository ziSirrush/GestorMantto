'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'modules', 'panel-control', 'panel-control.js');
const EXPECTED_BLOB = 'f729313c79c9e63afd8154f291df4b7e01c7f524';
const MARKER = 'FASE_6_ALCANCES_EMPRESA_V001';

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  return crypto.createHash('sha1')
    .update(Buffer.from(`blob ${body.length}\0`, 'utf8'))
    .update(body)
    .digest('hex');
}

function fail(message) {
  console.error(`[${MARKER}] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) fail(`No existe ${path.relative(ROOT, TARGET)}.`);
const original = fs.readFileSync(TARGET, 'utf8');
if (original.includes(MARKER)) {
  console.log(`[${MARKER}] Ya estaba aplicado. Sin cambios.`);
  process.exit(0);
}
const actualBlob = gitBlobSha(original);
if (actualBlob !== EXPECTED_BLOB) {
  fail(`panel-control.js no corresponde a la base validada. Esperado ${EXPECTED_BLOB}; actual ${actualBlob}.`);
}

const override = String.raw`

  /* ${MARKER}
     Alcance por empresa:
     GENERAL = relacion directa por defecto.
     CORELLIAN = puertas + personas.
     UNITED = puertas + Zonas Operativas.
  */

  function ensureInformationScopeDraftV6(value){
    const source=value||{};
    if(!(source.dominios_completos instanceof Set))source.dominios_completos=new Set(source.dominios_completos||[]);
    if(!(source.agrupaciones instanceof Set))source.agrupaciones=new Set(source.agrupaciones||[]);
    if(!(source.usuarios_adicionales instanceof Set))source.usuarios_adicionales=new Set(source.usuarios_adicionales||[]);
    if(!(source.zonas_operativas instanceof Set))source.zonas_operativas=new Set(source.zonas_operativas||[]);
    source.ver_propio=true;
    source.ver_reporta_a=Boolean(source.ver_reporta_a);
    source.ver_rel_admin=Boolean(source.ver_rel_admin);
    return source;
  }

  function emptyInformationScopeBulkDraft(){
    return ensureInformationScopeDraftV6({
      dominios_completos:new Set(),
      agrupaciones:new Set(),
      ver_propio:true,
      ver_reporta_a:false,
      ver_rel_admin:false,
      usuarios_adicionales:new Set(),
      zonas_operativas:new Set()
    });
  }

  function informationScopeBulkHasActivation(){
    const draft=ensureInformationScopeDraftV6(state.informationScopeBulkDraft||emptyInformationScopeBulkDraft());
    return draft.dominios_completos.size>0||draft.agrupaciones.size>0||draft.ver_reporta_a||draft.ver_rel_admin||draft.zonas_operativas.size>0;
  }

  function emptyInformationScopeDraft(){
    return ensureInformationScopeDraftV6({
      dominios_completos:new Set(),
      agrupaciones:new Set(),
      ver_propio:true,
      ver_reporta_a:false,
      ver_rel_admin:false,
      usuarios_adicionales:new Set(),
      zonas_operativas:new Set()
    });
  }

  function cloneInformationScopeDraft(value){
    const source=ensureInformationScopeDraftV6(value||emptyInformationScopeDraft());
    return ensureInformationScopeDraftV6({
      dominios_completos:new Set(source.dominios_completos),
      agrupaciones:new Set(source.agrupaciones),
      ver_propio:true,
      ver_reporta_a:Boolean(source.ver_reporta_a),
      ver_rel_admin:Boolean(source.ver_rel_admin),
      usuarios_adicionales:new Set(source.usuarios_adicionales),
      zonas_operativas:new Set(source.zonas_operativas)
    });
  }

  function normalizeInformationScopeData(data,userId){
    const source=data||{};
    const scopes=source.alcances||{};
    const core=scopes.corellian||{};
    const uni=scopes.united||{};
    const draft=emptyInformationScopeDraft();

    const legacyDomains=Array.isArray(source.dominios_completos)?source.dominios_completos:[];
    if(core.llave_maestra===true||legacyDomains.some(value=>String(value||'').toUpperCase()==='CORELLIAN'))draft.dominios_completos.add('CORELLIAN');
    if(uni.llave_maestra===true||legacyDomains.some(value=>String(value||'').toUpperCase()==='UNITED'))draft.dominios_completos.add('UNITED');

    const rawGroups=[
      ...(Array.isArray(core.agrupaciones)?core.agrupaciones:[]),
      ...(Array.isArray(uni.agrupaciones)?uni.agrupaciones:[])
    ];
    if(!rawGroups.length&&Array.isArray(source.agrupaciones))rawGroups.push(...source.agrupaciones);
    rawGroups.map(item=>Number(item&&typeof item==='object'?(item.id_agrupacion??item.id):item))
      .filter(id=>Number.isInteger(id)&&id>0)
      .forEach(id=>draft.agrupaciones.add(id));

    draft.ver_reporta_a=Boolean(core.ver_reporta_a??source.ver_reporta_a);
    draft.ver_rel_admin=Boolean(core.ver_rel_admin??source.ver_rel_admin);
    const additional=Array.isArray(core.usuarios_adicionales)?core.usuarios_adicionales:(Array.isArray(source.usuarios_adicionales)?source.usuarios_adicionales:[]);
    additional.map(item=>Number(item&&typeof item==='object'?(item.id_SB??item.id_usuario??item.id_usuario_visible):item))
      .filter(id=>Number.isInteger(id)&&id>0&&id!==Number(userId))
      .forEach(id=>draft.usuarios_adicionales.add(id));

    const zones=Array.isArray(uni.zonas)?uni.zonas:[];
    zones.map(item=>Number(item&&typeof item==='object'?(item.id_zona??item.zona_id??item.id):item))
      .filter(id=>Number.isInteger(id)&&id>0)
      .forEach(id=>draft.zonas_operativas.add(id));
    return draft;
  }

  function informationScopePayload(value){
    const source=ensureInformationScopeDraftV6(value||emptyInformationScopeDraft());
    const coreGroupIds=informationScopeGroupIdsForDomain('CORELLIAN');
    const unitedGroupIds=informationScopeGroupIdsForDomain('UNITED');
    const selectedGroups=[...source.agrupaciones].map(Number).filter(id=>Number.isInteger(id)&&id>0);
    return {
      alcances:{
        general:{default:true},
        corellian:{
          llave_maestra:source.dominios_completos.has('CORELLIAN'),
          agrupaciones:selectedGroups.filter(id=>coreGroupIds.has(id)).sort((a,b)=>a-b),
          ver_propio:true,
          ver_reporta_a:Boolean(source.ver_reporta_a),
          ver_rel_admin:Boolean(source.ver_rel_admin),
          usuarios_adicionales:[...source.usuarios_adicionales].map(Number).filter(id=>Number.isInteger(id)&&id>0).sort((a,b)=>a-b)
        },
        united:{
          llave_maestra:source.dominios_completos.has('UNITED'),
          agrupaciones:selectedGroups.filter(id=>unitedGroupIds.has(id)).sort((a,b)=>a-b),
          zonas:[...source.zonas_operativas].map(Number).filter(id=>Number.isInteger(id)&&id>0).sort((a,b)=>a-b)
        }
      }
    };
  }

  function sameInformationScope(left,right){
    return JSON.stringify(informationScopePayload(left))===JSON.stringify(informationScopePayload(right));
  }

  function informationScopeDirty(){
    return Boolean(state.informationScopeUserId&&state.informationScopeBase&&state.informationScopeDraft&&!sameInformationScope(state.informationScopeBase,state.informationScopeDraft));
  }

  function informationScopeZonesHtmlV6(draft,{bulk=false}={}){
    const source=ensureInformationScopeDraftV6(draft);
    const zones=Array.isArray(state.informationScopeZones)&&state.informationScopeZones.length?state.informationScopeZones:(Array.isArray(state.zones)?state.zones:[]);
    const attr=bulk?'data-information-scope-bulk-zone':'data-information-scope-zone';
    if(!zones.length)return '<div class="pc-information-scope-no-users">No hay Zonas Operativas activas en z_op.</div>';
    return '<div class="pc-scope-door-grid">'+zones.map(zone=>{
      const id=Number(zone.id_zona??zone.zona_id??zone.id);
      const selected=source.zonas_operativas.has(id);
      const label=zone.nombre||zone.zona||('Zona '+id);
      const code=zone.zona||('ZOP-'+id);
      return '<label class="pc-scope-door '+(selected?'open':'closed')+'"><input type="checkbox" '+attr+'="'+id+'" '+(selected?'checked':'')+'><span class="pc-scope-door-icon">'+(selected?'📍':'○')+'</span><span class="pc-scope-door-copy"><b>'+esc(label)+'</b><small>'+esc(code)+'</small></span><em>'+(selected?'ACTIVA':'FUERA')+'</em></label>';
    }).join('')+'</div>';
  }

  function informationScopeAdditionalEditorV6(user,draft){
    const selected=[...draft.usuarios_adicionales]
      .map(id=>state.users.find(item=>Number(item.id_SB)===Number(id)))
      .filter(Boolean)
      .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));
    const chips=selected.length?selected.map(item=>'<span class="pc-information-scope-chip"><b>'+esc(item.nombre)+'</b><small>'+esc(item.puesto||item.correo||'Usuario')+'</small>'+(state.informationScopeCanManageAdditional?'<button type="button" data-information-scope-remove="'+item.id_SB+'">×</button>':'')+'</span>').join(''):'<div class="pc-information-scope-no-users">Sin usuarios adicionales.</div>';
    if(!state.informationScopeCanManageAdditional){
      return '<div class="pc-information-scope-readonly">Solo Programador puede modificar Usuarios adicionales.</div><div class="pc-information-scope-chips">'+chips+'</div>';
    }
    const query=normalizeText(state.informationScopeAdditionalQuery);
    const candidates=(state.users||[]).filter(item=>{
      const id=Number(item.id_SB);
      if(!id||id===Number(user.id_SB)||draft.usuarios_adicionales.has(id)||Number(item.estado)===0)return false;
      if(!query)return false;
      return normalizeText([item.nombre,item.correo,item.puesto,item.area].join(' ')).includes(query);
    }).slice(0,8);
    const selectedCandidate=state.users.find(item=>Number(item.id_SB)===Number(state.informationScopeCandidateId));
    return '<div class="pc-information-scope-additional-editor"><div class="pc-information-scope-additional-search"><input id="pc-information-scope-additional-search" value="'+esc(state.informationScopeAdditionalQuery||'')+'" placeholder="Buscar usuario adicional..."><button type="button" class="pc-btn ghost" id="pc-information-scope-add" '+(!selectedCandidate?'disabled':'')+'>Agregar</button></div>'+(candidates.length?'<div class="pc-information-scope-candidates">'+candidates.map(item=>'<button type="button" data-information-scope-candidate="'+item.id_SB+'"><b>'+esc(item.nombre)+'</b><small>'+esc(item.puesto||item.correo||'')+'</small></button>').join('')+'</div>':'')+'</div><div class="pc-information-scope-chips">'+chips+'</div>';
  }

  async function ensureInformationScopeZonesV6(){
    const existing=Array.isArray(state.informationScopeZones)&&state.informationScopeZones.length?state.informationScopeZones:(Array.isArray(state.zones)?state.zones:[]);
    if(existing.length){state.informationScopeZones=existing;return existing;}
    try{
      const response=await request('/api/catalogos/zonas',{method:'GET',cache:'no-store'});
      state.informationScopeZones=Array.isArray(response.data)?response.data:[];
      return state.informationScopeZones;
    }catch(_error){return [];}
  }

  function informationScopeEditorHtml(user){
    if(!user)return '<div class="pc-admin-empty pc-information-scope-empty"><span class="pc-avatar big">A</span><h2>Selecciona un usuario</h2><p>GENERAL es automático; CORELLIAN se configura por personas y UNITED por Zonas Operativas.</p></div>';
    if(state.informationScopeLoading)return '<div class="pc-empty large"><span class="pc-spinner"></span>Cargando alcance de '+esc(user.nombre)+'...</div>';
    if(state.informationScopeError)return '<div class="pc-empty large"><b>No se pudo cargar el alcance.</b><br>'+esc(state.informationScopeError)+'<br><button type="button" class="pc-btn ghost" id="pc-information-scope-retry">Reintentar</button></div>';
    const draft=ensureInformationScopeDraftV6(state.informationScopeDraft||emptyInformationScopeDraft());
    const backendNote=state.informationScopeBackendPending?'<div class="pc-information-scope-warning">La lectura del backend no es válida. No se permite guardar hasta recargar.</div>':'';
    return '<div class="pc-information-scope-form">'+backendNote+
      '<div class="pc-scope-context-banner"><span>👤</span><div><b>Alcance de '+esc(user.nombre)+'</b><small>Permiso funcional y alcance son capas independientes.</small></div></div>'+
      '<section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>GENERAL — Alcance por defecto</h3><p>No requiere configuración manual.</p></div></div><div class="pc-information-scope-options"><label class="pc-information-scope-option selected locked"><input type="checkbox" checked disabled><span><b>Creado por mí / Asignado a mí / Relacionado conmigo</b><small>Aplica a Tareas, Soporte, Chats y demás información GENERAL según la relación real del registro.</small></span></label></div></section>'+
      '<section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>CORELLIAN — Puertas + personas</h3><p>La puerta habilita el dominio de información; después el alcance se resuelve por personas visibles.</p></div></div>'+informationScopeAccessDomainHtml(draft,'CORELLIAN')+'<div class="pc-information-scope-options"><label class="pc-information-scope-option selected locked"><input type="checkbox" checked disabled><span><b>Su propia información</b><small>Siempre incluida.</small></span></label><label class="pc-information-scope-option '+(draft.ver_reporta_a?'selected':'')+'"><input type="checkbox" id="pc-information-scope-reports" '+(draft.ver_reporta_a?'checked':'')+'><span><b>Personas que le reportan</b><small>usuarios.reporta_a</small></span></label><label class="pc-information-scope-option '+(draft.ver_rel_admin?'selected':'')+'"><input type="checkbox" id="pc-information-scope-rel-admin" '+(draft.ver_rel_admin?'checked':'')+'><span><b>Relaciones administrativas</b><small>usuarios_rel_admin</small></span></label></div><div class="pc-information-scope-section-title"><div><h4>Usuarios adicionales Corellian</h4><p>Excepción individual; no entrega permisos ni puertas.</p></div></div>'+informationScopeAdditionalEditorV6(user,draft)+'</section>'+
      '<section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>UNITED — Puertas + Zonas Operativas</h3><p>Los registros y notificaciones United se limitan a las Zonas Operativas activas del usuario. La llave maestra conserva las zonas configuradas, pero no las usa como filtro mientras esté activa.</p></div></div>'+informationScopeAccessDomainHtml(draft,'UNITED')+'<div class="pc-information-scope-section-title"><div><h4>Zonas Operativas</h4><p>Fuente: usuario_zop + z_op.</p></div></div>'+informationScopeZonesHtmlV6(draft)+'</section>'+
      '<div class="pc-scope-formula"><span>⚙ Permiso funcional</span><b>+</b><span>🚪 Puerta</span><b>+</b><span>👥/📍 Alcance del registro</span><b>=</b><span>🛡 Información visible</span></div>'+
      '<div class="pc-admin-actions pc-information-scope-actions"><span class="pc-information-scope-dirty '+(informationScopeDirty()?'on':'')+'">'+(informationScopeDirty()?'Cambios pendientes para este usuario':'Sin cambios pendientes')+'</span><button type="button" class="pc-btn primary" id="pc-information-scope-save" '+(state.savingInformationScope||state.informationScopeBackendPending||!informationScopeDirty()?'disabled':'')+'>'+(state.savingInformationScope?'Guardando...':'Guardar este usuario')+'</button></div></div>';
  }

  function informationScopeBulkEditorHtml(){
    state.informationScopeBulkDraft=ensureInformationScopeDraftV6(state.informationScopeBulkDraft||emptyInformationScopeBulkDraft());
    const draft=state.informationScopeBulkDraft;
    const selected=[...state.informationScopeBulkSelected];
    return '<div class="pc-information-scope-form"><div class="pc-scope-context-banner"><span>👥</span><div><b>Asignación masiva: '+selected.length+' usuario(s)</b><small>La operación es aditiva. No elimina configuraciones existentes ni usuarios adicionales Corellian.</small></div></div>'+
      '<section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>GENERAL</h3><p>Siempre aplica por relación directa; no requiere activación masiva.</p></div></div></section>'+
      '<section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>CORELLIAN</h3><p>Activa llaves/puertas y reglas automáticas de personas.</p></div></div>'+informationScopeAccessDomainHtml(draft,'CORELLIAN',{bulk:true})+'<div class="pc-information-scope-options"><label class="pc-information-scope-option '+(draft.ver_reporta_a?'selected':'')+'"><input type="checkbox" id="pc-information-scope-bulk-reports" '+(draft.ver_reporta_a?'checked':'')+'><span><b>Personas que le reportan</b><small>REPORTA_A</small></span></label><label class="pc-information-scope-option '+(draft.ver_rel_admin?'selected':'')+'"><input type="checkbox" id="pc-information-scope-bulk-rel-admin" '+(draft.ver_rel_admin?'checked':'')+'><span><b>Relaciones administrativas</b><small>REL_ADMIN</small></span></label></div></section>'+
      '<section class="pc-admin-section pc-information-scope-section"><div class="pc-information-scope-section-title"><div><h3>UNITED</h3><p>Activa llaves/puertas y agrega Zonas Operativas a cada usuario seleccionado.</p></div></div>'+informationScopeAccessDomainHtml(draft,'UNITED',{bulk:true})+informationScopeZonesHtmlV6(draft,{bulk:true})+'</section>'+
      '<div class="pc-admin-actions pc-information-scope-actions"><span class="pc-information-scope-dirty '+(informationScopeBulkHasActivation()?'on':'')+'">'+(informationScopeBulkHasActivation()?'Configuración lista para aplicar':'Selecciona al menos una opción')+'</span><button type="button" class="pc-btn primary" id="pc-information-scope-bulk-apply" '+(state.savingInformationScopeBulk||!selected.length||!informationScopeBulkHasActivation()?'disabled':'')+'>'+(state.savingInformationScopeBulk?'Aplicando...':'Aplicar a '+selected.length+' usuario(s)')+'</button></div></div>';
  }

  async function loadInformationScope(id){
    const userId=Number(id);
    if(!Number.isInteger(userId)||userId<=0)return;
    state.informationScopeLoading=true;
    state.informationScopeError='';
    state.informationScopeBackendPending=false;
    renderInformationScope();
    try{
      const response=await request(informationScopePath(userId)+'?_='+Date.now(),{method:'GET',cache:'no-store'});
      if(Number(state.informationScopeUserId)!==userId)return;
      const data=response.data||{};
      state.informationScopeCanManageAdditional=Boolean(data.capacidades?.puede_gestionar_usuarios_adicionales);
      state.informationScopeZones=Array.isArray(data.catalogos?.zonas_operativas)?data.catalogos.zonas_operativas:[];
      const normalized=normalizeInformationScopeData(data,userId);
      state.informationScopeBase=cloneInformationScopeDraft(normalized);
      state.informationScopeDraft=cloneInformationScopeDraft(normalized);
    }catch(error){
      if(Number(state.informationScopeUserId)!==userId)return;
      state.informationScopeError=error?.message||'No fue posible cargar el alcance.';
      state.informationScopeBackendPending=true;
      state.informationScopeBase=null;
      state.informationScopeDraft=null;
    }finally{
      if(Number(state.informationScopeUserId)===userId){state.informationScopeLoading=false;renderInformationScope();}
    }
  }

  function bindInformationScopeEvents(){
    document.getElementById('pc-information-scope-bulk-toggle')?.addEventListener('click',async()=>{
      if(state.savingInformationScope||state.savingInformationScopeBulk)return;
      state.informationScopeBulkOpen=!state.informationScopeBulkOpen;
      if(!state.informationScopeBulkOpen){state.informationScopeBulkSelected.clear();state.informationScopeBulkDraft=emptyInformationScopeBulkDraft();}
      else{state.informationScopeBulkDraft=ensureInformationScopeDraftV6(state.informationScopeBulkDraft||emptyInformationScopeBulkDraft());await ensureInformationScopeZonesV6();}
      renderInformationScope();
    });
    document.getElementById('pc-information-scope-bulk-select-visible')?.addEventListener('click',()=>{filteredInformationScopeUsers().forEach(user=>state.informationScopeBulkSelected.add(Number(user.id_SB)));renderInformationScope();});
    document.getElementById('pc-information-scope-bulk-clear')?.addEventListener('click',()=>{state.informationScopeBulkSelected.clear();renderInformationScope();});
    document.getElementById('pc-information-scope-user-search')?.addEventListener('input',event=>{state.informationScopeQuery=event.target.value;renderInformationScopeUserList();});
    document.getElementById('pc-information-scope-company')?.addEventListener('change',event=>{state.informationScopeCompany=event.target.value;renderInformationScopeUserList();});
    document.getElementById('pc-information-scope-role')?.addEventListener('change',event=>{state.informationScopeRole=event.target.value;renderInformationScopeUserList();});

    document.querySelectorAll('[data-information-scope-domain]').forEach(input=>input.addEventListener('change',()=>mutateInformationScope(draft=>{
      ensureInformationScopeDraftV6(draft);
      const domain=String(input.dataset.informationScopeDomain||'').toUpperCase();
      if(input.checked){draft.dominios_completos.add(domain);informationScopeGroupIdsForDomain(domain).forEach(id=>draft.agrupaciones.delete(id));}
      else draft.dominios_completos.delete(domain);
    })));
    document.querySelectorAll('[data-information-scope-group]').forEach(input=>input.addEventListener('change',()=>mutateInformationScope(draft=>{
      ensureInformationScopeDraftV6(draft);const id=Number(input.dataset.informationScopeGroup);if(!id)return;input.checked?draft.agrupaciones.add(id):draft.agrupaciones.delete(id);
    })));
    document.querySelectorAll('[data-information-scope-zone]').forEach(input=>input.addEventListener('change',()=>mutateInformationScope(draft=>{
      ensureInformationScopeDraftV6(draft);const id=Number(input.dataset.informationScopeZone);if(!id)return;input.checked?draft.zonas_operativas.add(id):draft.zonas_operativas.delete(id);
    })));
    document.getElementById('pc-information-scope-reports')?.addEventListener('change',event=>mutateInformationScope(draft=>{draft.ver_reporta_a=Boolean(event.target.checked);}));
    document.getElementById('pc-information-scope-rel-admin')?.addEventListener('change',event=>mutateInformationScope(draft=>{draft.ver_rel_admin=Boolean(event.target.checked);}));

    document.getElementById('pc-information-scope-additional-search')?.addEventListener('input',event=>{
      if(!state.informationScopeCanManageAdditional)return;state.informationScopeAdditionalQuery=event.target.value;state.informationScopeCandidateId=null;renderInformationScope();
      const input=document.getElementById('pc-information-scope-additional-search');input?.focus({preventScroll:true});if(input&&typeof input.setSelectionRange==='function')input.setSelectionRange(input.value.length,input.value.length);
    });
    document.querySelectorAll('[data-information-scope-candidate]').forEach(button=>button.addEventListener('click',()=>{if(!state.informationScopeCanManageAdditional)return;state.informationScopeCandidateId=Number(button.dataset.informationScopeCandidate);const candidate=state.users.find(user=>Number(user.id_SB)===Number(state.informationScopeCandidateId));state.informationScopeAdditionalQuery=candidate?.nombre||state.informationScopeAdditionalQuery;renderInformationScope();}));
    document.getElementById('pc-information-scope-add')?.addEventListener('click',()=>{if(!state.informationScopeCanManageAdditional||!state.informationScopeDraft)return;const id=Number(state.informationScopeCandidateId);if(!id)return;state.informationScopeDraft.usuarios_adicionales.add(id);state.informationScopeAdditionalQuery='';state.informationScopeCandidateId=null;renderInformationScope();});
    document.querySelectorAll('[data-information-scope-remove]').forEach(button=>button.addEventListener('click',()=>{if(!state.informationScopeCanManageAdditional||!state.informationScopeDraft)return;state.informationScopeDraft.usuarios_adicionales.delete(Number(button.dataset.informationScopeRemove));renderInformationScope();}));

    document.querySelectorAll('[data-information-scope-bulk-domain]').forEach(input=>input.addEventListener('change',()=>{
      const draft=ensureInformationScopeDraftV6(state.informationScopeBulkDraft);const domain=String(input.dataset.informationScopeBulkDomain||'').toUpperCase();if(input.checked){draft.dominios_completos.add(domain);informationScopeGroupIdsForDomain(domain).forEach(id=>draft.agrupaciones.delete(id));}else draft.dominios_completos.delete(domain);renderInformationScope();
    }));
    document.querySelectorAll('[data-information-scope-bulk-group]').forEach(input=>input.addEventListener('change',()=>{const draft=ensureInformationScopeDraftV6(state.informationScopeBulkDraft);const id=Number(input.dataset.informationScopeBulkGroup);if(!id)return;input.checked?draft.agrupaciones.add(id):draft.agrupaciones.delete(id);renderInformationScope();}));
    document.querySelectorAll('[data-information-scope-bulk-zone]').forEach(input=>input.addEventListener('change',()=>{const draft=ensureInformationScopeDraftV6(state.informationScopeBulkDraft);const id=Number(input.dataset.informationScopeBulkZone);if(!id)return;input.checked?draft.zonas_operativas.add(id):draft.zonas_operativas.delete(id);renderInformationScope();}));
    document.getElementById('pc-information-scope-bulk-reports')?.addEventListener('change',event=>{state.informationScopeBulkDraft.ver_reporta_a=Boolean(event.target.checked);renderInformationScope();});
    document.getElementById('pc-information-scope-bulk-rel-admin')?.addEventListener('change',event=>{state.informationScopeBulkDraft.ver_rel_admin=Boolean(event.target.checked);renderInformationScope();});

    document.getElementById('pc-information-scope-retry')?.addEventListener('click',()=>loadInformationScope(state.informationScopeUserId));
    document.getElementById('pc-information-scope-save')?.addEventListener('click',saveInformationScope);
    document.getElementById('pc-information-scope-bulk-apply')?.addEventListener('click',saveInformationScopeBulk);
  }

  function informationScopeReadbackMatches(expected,readback,userId){
    const normalized=normalizeInformationScopeData(readback?.data||{},userId);
    return JSON.stringify(informationScopePayload(expected))===JSON.stringify(informationScopePayload(normalized));
  }

  async function saveInformationScope(){
    const userId=Number(state.informationScopeUserId);
    if(!Number.isInteger(userId)||userId<=0||!state.informationScopeDraft||!informationScopeDirty()||state.savingInformationScope)return;
    if(state.informationScopeBackendPending){toast('Reintenta la lectura antes de guardar.');return;}
    state.savingInformationScope=true;renderInformationScope();
    try{
      const payload=informationScopePayload(state.informationScopeDraft);
      await request(informationScopePath(userId),{method:'PUT',body:JSON.stringify(payload)});
      const readback=await request(informationScopePath(userId)+'?_='+Date.now(),{method:'GET',cache:'no-store'});
      if(!informationScopeReadbackMatches(state.informationScopeDraft,readback,userId))throw new Error('La verificación posterior no coincide con el alcance guardado.');
      state.informationScopeZones=Array.isArray(readback.data?.catalogos?.zonas_operativas)?readback.data.catalogos.zonas_operativas:state.informationScopeZones;
      const normalized=normalizeInformationScopeData(readback.data||{},userId);
      state.informationScopeBase=cloneInformationScopeDraft(normalized);
      state.informationScopeDraft=cloneInformationScopeDraft(normalized);
      toast('Alcance de información guardado.');
    }catch(error){toast(error?.message||'No fue posible guardar el alcance.');}
    finally{state.savingInformationScope=false;renderInformationScope();}
  }

  async function saveInformationScopeBulk(){
    const ids=[...state.informationScopeBulkSelected].map(Number).filter(id=>Number.isInteger(id)&&id>0);
    if(!ids.length||!informationScopeBulkHasActivation()||state.savingInformationScopeBulk)return;
    const draft=ensureInformationScopeDraftV6(state.informationScopeBulkDraft||emptyInformationScopeBulkDraft());
    const payload={usuario_ids:ids,activar:informationScopePayload(draft)};
    state.savingInformationScopeBulk=true;renderInformationScope();
    try{
      await request(informationScopeBulkPath,{method:'PUT',body:JSON.stringify(payload)});
      toast('Alcance masivo aplicado a '+ids.length+' usuario(s).');
      state.informationScopeBulkSelected.clear();
      state.informationScopeBulkDraft=emptyInformationScopeBulkDraft();
      if(state.informationScopeUserId)await loadInformationScope(state.informationScopeUserId);
      else renderInformationScope();
    }catch(error){toast(error?.message||'No fue posible aplicar el alcance masivo.');}
    finally{state.savingInformationScopeBulk=false;renderInformationScope();}
  }
`;

const closeIndex = original.lastIndexOf('})();');
if (closeIndex < 0) fail('No se encontro el cierre del IIFE de panel-control.js.');
const updated = original.slice(0, closeIndex) + override + '\n' + original.slice(closeIndex);
const temp = TARGET + '.fase6.tmp.js';
fs.writeFileSync(temp, updated, 'utf8');
const check = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
if (check.status !== 0) {
  try { fs.unlinkSync(temp); } catch (_error) {}
  fail(`La sintaxis resultante no es valida: ${check.stderr || check.stdout || 'error desconocido'}`);
}
fs.renameSync(temp, TARGET);
console.log(`[${MARKER}] OK: ${path.relative(ROOT, TARGET)} actualizado y validado.`);
