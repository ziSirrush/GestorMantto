(function(){
  'use strict';
  // [Aster | 2026-10-08 | ASTER-MG | FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001]
  // [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
  // [Aster | 2026-10-08 | ASTER-MG | FASE_6_INSTALACIONES_ADMINISTRACION_AISLAMIENTO_SESION_V001]
  const VERSION_COR='20261008-fase5-v001';
  const ROOT='/api/instalaciones/administracion';
  const USER_IDS=new Set(['id_sup','id_asesor','id_admin']);
  const LABELS={
    proyecto:'Proyecto',id_proyecto:'PP NS',referencia_sitio:'Referencia en sitio',
    fecha_visita:'Ultima visita',comentarios_fl:'Comentarios FL',avance_oc:'Avance OC',avance_mo:'Avance MO',avance_aj:'Avance AJ',
    id_sup:'Supervisor (usuario)',id_asesor:'Asesor (usuario)',id_admin:'Administrativo (usuario)',
    numero_equipo_fabrica:'No. equipo fabrica',numero_contrato:'No. contrato',ov_ns:'OV NS',ph_ns:'PH NS',
    velocidad_ms:'Velocidad [m/s]',capacidad_kg:'Capacidad [kg]',entrepiso_mm:'Entrepiso [mm]',longitud_mm:'Longitud [mm]',
    ancho_peldano_mm:'Ancho de peldano [mm]',numero_pisos:'No. pisos',numero_desembarques:'No. desembarques',numero_puertas:'No. puertas',
    fecha_cpvp:'Carta de primera visita (CPVP)',fecha_ccnr:'Carta cubo no recibido (CCNR)',fecha_ccr:'Carta cubo recibido (CCR)',
    fecha_cti:'Carta termino instalacion (CTI)',formato_caf_pg:'Formato CAF-PG',
    presupuesto_mantenimiento_cem:'Presupuesto mantenimiento CEM',costo_mensual_mantenimiento_cem:'Costo mensual mantenimiento CEM',
    created_at:'Creado',updated_at:'Ultima actualizacion',id_ins_fl:'ID ins_fl'
  };
  const st={ready:false,bound:false,loading:false,saving:false,contract:null,records:[],selectedRecord:null,
    selectedSummary:null,activeGroup:null,editingGroup:null,touched:new Set(),users:null,seq:0,detailSeq:0,conflict:false,
    contextEpoch:0,contextKey:null};
  const $=id=>document.getElementById(id);
  const raw=value=>value==null?'':String(value).trim();
  const esc=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const has=(x,k)=>Object.prototype.hasOwnProperty.call(x||{},k);
  const view=()=>$('view-instalaciones-administracion');
  const label=f=>LABELS[f]||f.replace(/_/g,' ').replace(/^./,s=>s.toUpperCase());
  const meta=f=>st.contract?.field_meta?.[f]||{kind:'text',max_length:20000};
  const groups=()=>Array.isArray(st.contract?.groups)?st.contract.groups.filter(g=>g?.permissions?.can_view===true):[];
  const canEdit=g=>Boolean(g?.permissions?.can_edit)&&!Boolean(window.ManttoAuth?.isViewingAs?.());
  const pending=()=>new Set([...(st.contract?.pending_policy_fields||[]),...(st.contract?.derived_pending_policy_fields||[])]);
  // No es un motor de permisos: solo invalida datos ya renderizados cuando
  // cambia la identidad. El backend sigue siendo autoridad de acceso.
  function identity_cor(user){return String(user&&(user.id_SB||user.id||user.correo||user.email)||'anon');}
  function currentContext_cor(){
    const auth=window.ManttoAuth;
    if(!auth?.getToken?.())return 'NO_SESSION';
    return [identity_cor(auth.getActorUser?.()),identity_cor(auth.getUser?.()),
      identity_cor(auth.getViewUser?.())].join(':');
  }
  function isCurrentContext_cor(epoch){
    return epoch===st.contextEpoch&&currentContext_cor()===st.contextKey;
  }
  function resetSensitiveState_cor(){
    st.contextEpoch++;
    st.seq++;
    st.detailSeq++;
    st.contextKey=currentContext_cor();
    st.contract=null;st.records=[];st.selectedRecord=null;st.selectedSummary=null;
    st.activeGroup=null;st.editingGroup=null;st.users=null;st.touched.clear();st.conflict=false;
    st.loading=false;st.saving=false;
    // Mantener el esqueleto HTML y los listeners delegados ya registrados.
    // Vaciar solo nodos que pudieron contener informacion de otro contexto.
    if(view()?.dataset?.iadmCorReady==='1'){
      for(const id of ['iadm-cor-results','iadm-cor-group-picker','iadm-cor-groups',
        'iadm-cor-record-title','iadm-cor-record-tags','iadm-cor-system-grid','iadm-cor-search-meta']){
        const el=$(id);if(el){el.textContent='';el.innerHTML='';}
      }
      const input=$('iadm-cor-search-input');if(input)input.value='';
      const selected=$('iadm-cor-selected');if(selected)selected.hidden=true;
      const empty=$('iadm-cor-empty');if(empty)empty.hidden=false;
    }
    alertMessage('');status('','ready');busy(false);
  }
  function ensureContext_cor(){
    if(st.contextKey!==currentContext_cor())resetSensitiveState_cor();
    return st.contextEpoch;
  }
  function contextChangedError_cor(){
    const error=new Error('El contexto de sesion cambio; vuelve a consultar.');
    error.code='INSTALACIONES_ADMINISTRACION_CONTEXTO_CAMBIADO';
    return error;
  }
  function status(message,type){const n=$('iadm-cor-status');if(n){n.textContent=message||'';n.dataset.type=type||'ready';}}
  function alertMessage(message){const n=$('iadm-cor-alert');if(n){n.textContent=message||'';n.hidden=!message;}}
  function busy(flag){st.loading=Boolean(flag);for(const id of ['iadm-cor-refresh','iadm-cor-search-btn','iadm-cor-clear','iadm-cor-change-record']){const n=$(id);if(n)n.disabled=st.loading||st.saving;}}
  async function api(path,opt={}){
    if(!window.ManttoAuth?.api)throw new Error('La sesion autenticada no esta disponible.');
    const epoch=ensureContext_cor();
    const data=await window.ManttoAuth.api(path,Object.assign({method:'GET',cache:'no-store'},opt));
    if(!isCurrentContext_cor(epoch))throw contextChangedError_cor();
    return data;
  }
  async function loadHtml(){
    const el=view();if(!el)throw new Error('Falta la vista Instalaciones - Administracion.');
    if(el.dataset.iadmCorReady==='1')return;
    const res=await fetch('./modules/instalaciones-administracion/instalaciones-administracion_cor.html?v='+VERSION_COR,{cache:'no-store'});
    if(!res.ok)throw new Error('No fue posible abrir Administracion de Instalaciones.');
    el.innerHTML=await res.text();el.dataset.iadmCorReady='1';
  }
  function isoDate(value){
    const v=raw(value);let y,m,d,r;
    if((r=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(v))){y=+r[1];m=+r[2];d=+r[3];}
    else if((r=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v))){d=+r[1];m=+r[2];y=+r[3];}
    else return '';
    if(y<1900||y>2100||m<1||m>12||d<1||d>31)return '';
    const chk=new Date(Date.UTC(y,m-1,d));
    if(chk.getUTCFullYear()!==y||chk.getUTCMonth()!==m-1||chk.getUTCDate()!==d)return '';
    return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  function display(f,v){
    if(v==null||raw(v)==='')return '--';
    if(f==='activo')return Number(v)===1?'Activo':'Inactivo';
    if(meta(f).kind==='date'){
      const iso=isoDate(v);if(iso)return iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
    }
    return String(v);
  }
  function resultRows(){
    const host=$('iadm-cor-results'),info=$('iadm-cor-search-meta');if(!host)return;
    if(info)info.textContent=st.records.length?st.records.length+' registros encontrados.':'Sin resultados.';
    if(!st.records.length){host.innerHTML='<div class="iadm-cor-empty-state">Sin registros visibles dentro de tu alcance.</div>';return;}
    host.innerHTML=st.records.map(r=>'<button class="iadm-cor-result" type="button" data-record-id="'+esc(r.id_ins_fl)+'">'+
      '<span class="iadm-cor-result-main"><small>Proyecto / registro</small><strong>'+esc(r.proyecto||'Registro #'+r.id_ins_fl)+'</strong><small>'+esc(r.id_proyecto||'')+(r.referencia_sitio?' - '+esc(r.referencia_sitio):'')+'</small></span>'+
      '<span class="iadm-cor-result-cell"><small>Equipo</small>'+esc(r.numero_equipo_fabrica||r.tipo_equipo||'--')+'</span>'+
      '<span class="iadm-cor-result-cell"><small>Cliente</small>'+esc(r.cliente||'--')+'</span>'+
      '<span class="iadm-cor-result-cell"><small>Estatus</small>'+esc(r.estatus||'--')+'</span>'+
      '<span class="iadm-cor-result-open">Abrir</span></button>').join('');
  }
  async function search(q){
    const epoch=ensureContext_cor(),seq=++st.seq;busy(true);status('Buscando...','loading');
    try{
      const p=new URLSearchParams();if(raw(q))p.set('q',raw(q));p.set('limit','25');
      const data=await api(ROOT+'/registros?'+p.toString());if(!isCurrentContext_cor(epoch)||seq!==st.seq)return false;
      st.records=Array.isArray(data.data)?data.data:[];resultRows();status('Actualizado','ready');
      return true;
    }catch(e){
      if(!isCurrentContext_cor(epoch)||seq!==st.seq)return false;
      st.records=[];resultRows();status(e.message,'error');alertMessage(e.message);
      return false;
    }
    finally{if(isCurrentContext_cor(epoch)&&seq===st.seq)busy(false);}
  }
  function header(){
    const r=Object.assign({},st.selectedSummary||{},st.selectedRecord||{});
    if($('iadm-cor-record-title'))$('iadm-cor-record-title').textContent=r.proyecto||'Registro #'+r.id_ins_fl;
    const tags=$('iadm-cor-record-tags');if(!tags)return;
    const values=[r.id_proyecto?'PP NS '+r.id_proyecto:null,r.referencia_sitio?'Referencia '+r.referencia_sitio:null,
      r.numero_equipo_fabrica?'Fabrica '+r.numero_equipo_fabrica:null,r.estatus||null,
      has(r,'activo')&&Number(r.activo)===0?'Inactivo':null].filter(Boolean);
    tags.innerHTML=values.map(v=>'<span class="iadm-cor-chip">'+esc(v)+'</span>').join('');
  }
  function systemFields(){
    const host=$('iadm-cor-system-grid');if(!host)return;
    host.innerHTML=(st.contract?.system_readonly_fields||['id_ins_fl','created_at','updated_at']).map(f=>{
      let val=display(f,st.selectedRecord?.[f]);
      if((f==='created_at'||f==='updated_at')&&raw(st.selectedRecord?.[f])&&window.ManttoHumanTime?.formatMexicoCityDateTime){
        try{val=window.ManttoHumanTime.formatMexicoCityDateTime(st.selectedRecord[f]);}catch(_e){}
      }
      return '<div class="iadm-cor-system-item"><small>'+esc(label(f))+'</small><strong>'+esc(val)+'</strong></div>';
    }).join('');
  }
  function staticFields(g){
    const blocked=pending();
    return '<dl class="iadm-cor-field-grid">'+(g.fields||[]).map(f=>'<div class="iadm-cor-field"'+(blocked.has(f)?' data-policy="pending"':'')+'><dt>'+esc(label(f))+'</dt><dd>'+esc(display(f,st.selectedRecord?.[f]))+'</dd>'+
      (blocked.has(f)?'<span class="iadm-cor-field-note">Politica de edicion pendiente</span>':'')+'</div>').join('')+'</dl>';
  }
  function previewNumber(v,kind){
    const value=raw(v),text=kind==='percent'?value.replace(/%$/,'').trim():value;
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))return '';
    const n=Number(text),max=kind==='percent'?100:9999999999.99;
    return Number.isFinite(n)&&n>=0&&n<=max?text:'';
  }
  function userOptions(current){
    const id=raw(current),list=Array.isArray(st.users)?st.users:[];
    const exists=list.some(u=>String(u.id_SB)===id);
    return '<option value="">Sin asignar</option>'+
      (id&&!exists?'<option value="'+esc(id)+'" selected>Usuario actual ID '+esc(id)+' (no disponible)</option>':'')+
      list.map(u=>'<option value="'+esc(u.id_SB)+'"'+(String(u.id_SB)===id?' selected':'')+'>'+esc([u.nombre,u.iniciales?'('+u.iniciales+')':'',u.puesto].filter(Boolean).join(' '))+'</option>').join('');
  }
  function formField(f,editable){
    const m=meta(f),kind=m.kind||'text',original=st.selectedRecord?.[f],val=raw(original);
    if(!editable)return '<div class="iadm-cor-form-field" data-locked="true"><label>'+esc(label(f))+'</label><span class="iadm-cor-static">'+esc(display(f,original))+'</span><small class="iadm-cor-help">Campo bloqueado por politica.</small></div>';
    const id='iadm-cor-input-'+f,attr=' id="'+id+'" name="'+esc(f)+'" data-field-control="'+esc(f)+'"';
    let control='',help='',legacy='';
    if(kind==='user')control='<select'+attr+'>'+userOptions(original)+'</select>';
    else if(kind==='boolean')control='<select'+attr+'><option value="1"'+(Number(original)!==0?' selected':'')+'>Activo</option><option value="0"'+(Number(original)===0?' selected':'')+'>Inactivo</option></select>';
    else if(kind==='date'){
      const iso=isoDate(original);
      control='<input type="date"'+attr+' value="'+esc(iso)+'" min="1900-01-01" max="2100-12-31">';
      help='Fecha visible DD/MM/AAAA; almacenamiento AAAA-MM-DD.';
      if(val&&!iso)legacy=val;
    }else if(kind==='percent'||kind==='money'){
      const n=previewNumber(original,kind);
      control='<input type="number"'+attr+' min="0" max="'+(kind==='percent'?'100':'9999999999.99')+'" step="0.01" inputmode="decimal" value="'+esc(n)+'">';
      help=kind==='percent'?'Porcentaje 0-100 (2 decimales).':'Monto sin simbolo de moneda (2 decimales).';
      if(val&&!n)legacy=val;
    }else if(kind==='textarea'){
      control='<textarea'+attr+' rows="3" maxlength="'+Number(m.max_length||20000)+'">'+esc(original??'')+'</textarea>';
    }else{
      control='<input type="text"'+attr+' maxlength="'+Number(m.max_length||20000)+'" value="'+esc(original??'')+'">';
    }
    return '<div class="iadm-cor-form-field" data-field-wrap="'+esc(f)+'" data-changed="false">'+
      '<label for="'+id+'">'+esc(label(f))+'</label>'+control+
      (help?'<small class="iadm-cor-help">'+esc(help)+'</small>':'')+
      (legacy?'<small class="iadm-cor-help iadm-cor-legacy">Valor legado: '+esc(legacy)+'</small>':'')+
      (kind!=='boolean'?'<span class="iadm-cor-inline-actions"><button type="button" class="iadm-cor-btn iadm-cor-btn-compact" data-clear-field="'+esc(f)+'">Vaciar campo</button></span>':'')+
      '<small class="iadm-cor-help" data-field-error="'+esc(f)+'" data-error="true" hidden></small></div>';
  }
  function editForm(g){
    const allowed=new Set(g.editable_fields||[]);
    return '<form id="iadm-cor-edit-form" class="iadm-cor-form" novalidate>'+
      '<div id="iadm-cor-conflict" class="iadm-cor-form-hint"'+(st.conflict?'':' hidden')+'>'+
      (st.conflict?'Otro proceso modifico el registro. Recarga antes de volver a guardar.':'')+'</div>'+
      '<div class="iadm-cor-form-fields">'+(g.fields||[]).map(f=>formField(f,allowed.has(f))).join('')+'</div>'+
      '<div class="iadm-cor-form-footer"><span class="iadm-cor-form-count" id="iadm-cor-form-count">Sin cambios pendientes</span>'+
      '<div class="iadm-cor-form-actions"><button class="iadm-cor-btn" type="button" data-action="cancel-edit">Cancelar</button>'+
      '<button class="iadm-cor-btn iadm-cor-btn-primary" id="iadm-cor-save-btn" type="submit" disabled>Guardar cambios</button></div></div></form>';
  }
  function activeGroup(){
    const host=$('iadm-cor-groups');if(!host)return;
    const g=groups().find(x=>x.key===st.activeGroup)||groups()[0];
    if(!g){host.innerHTML='<div class="iadm-cor-empty-state">Tu usuario no tiene grupos visibles.</div>';return;}
    st.activeGroup=g.key;
    const editing=st.editingGroup===g.key&&canEdit(g);
    const button=canEdit(g)&&!editing?'<button type="button" class="iadm-cor-btn iadm-cor-btn-primary" data-action="start-edit">Editar grupo</button>':'';
    const badge=canEdit(g)?(editing?'Editando':'Edicion autorizada'):'Solo consulta';
    host.innerHTML='<details class="iadm-cor-group" open><summary><span>'+esc(g.label||g.key)+'</span>'+
      '<small class="iadm-cor-group-badge" data-edit="'+(canEdit(g)?'1':'0')+'">'+badge+'</small></summary>'+
      '<div class="iadm-cor-form-head"><p>'+esc(editing?'Modifica solo los campos necesarios.':'Informacion vigente del registro.')+'</p>'+
      '<div class="iadm-cor-form-commands">'+button+'</div></div>'+
      (editing?editForm(g):staticFields(g))+'</details>';
    $('iadm-cor-group-picker')?.querySelectorAll('[data-group-key]').forEach(b=>{
      b.classList.toggle('active',b.dataset.groupKey===g.key);b.setAttribute('aria-pressed',b.dataset.groupKey===g.key?'true':'false');
    });
    if(editing)updateDirtyUi();
  }
  function groupPicker(){
    const host=$('iadm-cor-group-picker');if(!host)return;
    const visible=groups();
    if(!visible.length){host.innerHTML='<div class="iadm-cor-empty-state">No hay grupos autorizados.</div>';return;}
    if(!visible.some(g=>g.key===st.activeGroup))st.activeGroup=visible[0].key;
    host.innerHTML=visible.map(g=>'<button type="button" class="iadm-cor-group-button'+(g.key===st.activeGroup?' active':'')+'" data-group-key="'+esc(g.key)+'" aria-pressed="'+(g.key===st.activeGroup?'true':'false')+'"><span>'+esc(g.label||g.key)+'</span><small data-edit="'+(canEdit(g)?'1':'0')+'">'+(canEdit(g)?'EDITAR':'VER')+'</small></button>').join('');
  }
  function renderRecord(){
    if($('iadm-cor-selected'))$('iadm-cor-selected').hidden=false;
    if($('iadm-cor-empty'))$('iadm-cor-empty').hidden=true;
    header();groupPicker();activeGroup();systemFields();
    if(window.ManttoPermissions?.apply)window.ManttoPermissions.apply(view()||document);
  }
  function readControl(f){
    const input=$('iadm-cor-input-'+f);if(!input)return {ok:false,error:'Falta el campo.'};
    const kind=meta(f).kind||'text',v=raw(input.value);
    if(kind==='boolean')return {ok:true,value:Number(v)};
    if(kind==='user'){
      if(!v)return {ok:true,value:null};
      return /^\d+$/.test(v)&&Number.isSafeInteger(+v)&&+v>0?{ok:true,value:+v}:{ok:false,error:'Selecciona un usuario valido.'};
    }
    if(!v)return {ok:true,value:null};
    if(kind==='date')return isoDate(v)===v?{ok:true,value:v}:{ok:false,error:'Fecha invalida (1900-2100).'};
    if(kind==='percent'||kind==='money'){
      const max=kind==='percent'?100:9999999999.99;
      if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(v)||+v>max)return {ok:false,error:'Numero no valido o fuera de rango (2 decimales).'};
      return {ok:true,value:kind==='percent'?v+'%':v};
    }
    if(v.length>Number(meta(f).max_length||20000))return {ok:false,error:'Texto demasiado largo.'};
    return {ok:true,value:v};
  }
  function comparable(v){return v===null||v===undefined||v===''?null:String(v).trim();}
  function canonicalCompare(f,value){
    const kind=meta(f).kind;
    if(kind==='date')return isoDate(value)||comparable(value);
    if(kind==='percent'){
      const v=previewNumber(value,kind);return v!==''?String(Number(v))+'%':comparable(value);
    }
    if(kind==='money'){
      const v=previewNumber(value,kind);return v!==''?String(Number(v)):comparable(value);
    }
    return comparable(value);
  }
  function changedPayload(){
    const changes={},expected={},errors={};
    if(!st.editingGroup||!st.selectedRecord)return {changes,expected,errors};
    const g=groups().find(x=>x.key===st.editingGroup);if(!g||!canEdit(g))return {changes,expected,errors};
    const allowed=new Set(g.editable_fields||[]);
    for(const f of st.touched){
      if(!allowed.has(f))continue;
      const result=readControl(f);
      if(!result.ok){errors[f]=result.error;continue;}
      const before=has(st.selectedRecord,f)?st.selectedRecord[f]:null;
      if(canonicalCompare(f,before)===canonicalCompare(f,result.value))continue;
      changes[f]=result.value;expected[f]=before;
    }
    return {changes,expected,errors};
  }
  function updateDirtyUi(){
    if(!st.editingGroup)return;
    const payload=changedPayload(),modified=Object.keys(payload.changes),invalid=Object.keys(payload.errors);
    const count=$('iadm-cor-form-count');
    if(count)count.textContent=invalid.length?invalid.length+' campo(s) con error':modified.length?modified.length+' campo(s) modificado(s)':'Sin cambios pendientes';
    const save=$('iadm-cor-save-btn');if(save)save.disabled=Boolean(!modified.length||invalid.length||st.loading||st.saving||st.conflict);
    for(const f of groups().find(g=>g.key===st.editingGroup)?.fields||[]){
      const wrap=view()?.querySelector('[data-field-wrap="'+f+'"]');
      if(wrap){wrap.dataset.changed=has(payload.changes,f)?'true':'false';wrap.dataset.invalid=has(payload.errors,f)?'true':'false';}
      const err=view()?.querySelector('[data-field-error="'+f+'"]');
      if(err){err.textContent=payload.errors[f]||'';err.hidden=!has(payload.errors,f);}
    }
  }
  function hasUnsaved(){
    const p=changedPayload();return Boolean(Object.keys(p.changes).length||Object.keys(p.errors).length);
  }
  function confirmLeave(){return !st.saving&&(!hasUnsaved()||window.confirm('Hay cambios sin guardar. Deseas descartarlos?'));}
  function clearSelection(){
    // Descarta respuestas GET de detalles previos que lleguen fuera de orden.
    st.detailSeq++;
    st.editingGroup=null;st.touched.clear();st.conflict=false;st.selectedRecord=null;st.selectedSummary=null;st.activeGroup=null;
    if($('iadm-cor-selected'))$('iadm-cor-selected').hidden=true;
    if($('iadm-cor-empty'))$('iadm-cor-empty').hidden=false;
    $('iadm-cor-search-input')?.focus();
  }
  async function openRecord(id){
    const numeric=Number(id);if(!Number.isSafeInteger(numeric)||numeric<=0)return;
    const epoch=ensureContext_cor(),seq=++st.detailSeq;
    st.selectedSummary=st.records.find(r=>Number(r.id_ins_fl)===numeric)||{};
    busy(true);status('Cargando registro...','loading');alertMessage('');
    try{
      const response=await api(ROOT+'/registros/'+encodeURIComponent(numeric));
      if(!isCurrentContext_cor(epoch)||seq!==st.detailSeq)return false;
      st.selectedRecord=response.data||{};
      st.selectedSummary=Object.assign({},st.selectedSummary,st.selectedRecord);
      st.editingGroup=null;st.touched.clear();st.conflict=false;
      if(!groups().some(g=>g.key===st.activeGroup))st.activeGroup=groups()[0]?.key||null;
      renderRecord();status('Registro cargado','ready');
      return true;
    }catch(e){if(isCurrentContext_cor(epoch)&&seq===st.detailSeq){status(e.message,'error');alertMessage(e.message);}return false;}
    finally{if(isCurrentContext_cor(epoch)&&seq===st.detailSeq)busy(false);}
  }
  async function loadContract(){const epoch=ensureContext_cor();const contract=await api(ROOT+'/contrato');if(!isCurrentContext_cor(epoch))return false;st.contract=contract;return true;}
  async function loadUsers(){
    if(Array.isArray(st.users))return st.users;
    const epoch=ensureContext_cor(),response=await api(ROOT+'/usuarios');
    if(!isCurrentContext_cor(epoch))throw contextChangedError_cor();
    st.users=Array.isArray(response.data)?response.data:[];
    return st.users;
  }
  async function startEdit(){
    const epoch=ensureContext_cor();
    if(st.saving||st.loading||!st.selectedRecord)return;
    const recordId=Number(st.selectedRecord.id_ins_fl);
    const g=groups().find(x=>x.key===st.activeGroup);if(!g||!canEdit(g))return;
    status('Preparando formulario...','loading');
    try{
      if((g.editable_fields||[]).some(f=>USER_IDS.has(f)))await loadUsers();
      if(!isCurrentContext_cor(epoch)||Number(st.selectedRecord?.id_ins_fl)!==recordId)return;
      st.editingGroup=g.key;st.touched.clear();st.conflict=false;
      alertMessage('');activeGroup();status('Editando '+g.label,'ready');
    }catch(e){if(isCurrentContext_cor(epoch)){status(e.message,'error');alertMessage(e.message);}}
  }
  async function save(){
    const epoch=ensureContext_cor();
    if(!st.editingGroup||!st.selectedRecord||st.saving)return;
    const group=st.editingGroup,id=Number(st.selectedRecord.id_ins_fl),p=changedPayload();
    if(!Object.keys(p.changes).length||Object.keys(p.errors).length||st.conflict){updateDirtyUi();return;}
    st.saving=true;busy(true);status('Guardando...','loading');alertMessage('');updateDirtyUi();
    let committed=false;
    try{
      const response=await api(ROOT+'/registros/'+encodeURIComponent(id)+'/grupos/'+encodeURIComponent(group),{
        method:'PATCH',body:JSON.stringify({changes:p.changes,expected:p.expected})
      });
      if(!isCurrentContext_cor(epoch))return;
      committed=true;
      st.editingGroup=null;st.touched.clear();st.conflict=false;
      // Recarga inmediata y selectiva. No presentar exito completo si
      // cualquiera de las verificaciones posteriores falla.
      let detailReloaded=true;
      try{
        const fresh=await api(ROOT+'/registros/'+encodeURIComponent(id));
        if(!isCurrentContext_cor(epoch))return;
        st.selectedRecord=fresh.data||{};
        // La fuente del encabezado es exclusivamente el detalle autorizado.
        st.selectedSummary={...st.selectedRecord};
        renderRecord();
      }catch(e){
        if(!isCurrentContext_cor(epoch))return;
        detailReloaded=false;
        clearSelection();
        alertMessage('Guardado confirmado, pero no fue posible recargar el registro. Vuelve a buscarlo. '+e.message);
      }
      const listReloaded=await search(raw($('iadm-cor-search-input')?.value));
      if(!isCurrentContext_cor(epoch))return;
      if(!detailReloaded||!listReloaded){
        status('Guardado confirmado; recarga pendiente','error');
        if(detailReloaded)alertMessage('Los datos se guardaron, pero la lista no se pudo actualizar. Intenta Actualizar.');
        return;
      }
      status(response.changed?'Guardado y auditado':'Sin diferencias nuevas','ready');
    }catch(e){
      if(!isCurrentContext_cor(epoch))return;
      if(committed){status('Guardado; consulta pendiente','ready');return;}
      if(e.status===409&&e.code==='INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA'){
        st.conflict=true;
        const msg=$('iadm-cor-conflict');if(msg){msg.hidden=false;msg.textContent=e.message+' Usa Actualizar para recuperar el registro.';}
      }
      if(e.status===404)clearSelection();
      status(e.message,'error');alertMessage(e.message);
    }finally{if(isCurrentContext_cor(epoch)){st.saving=false;busy(false);updateDirtyUi();}}
  }
  async function refresh(options={}){
    const epoch=ensureContext_cor();
    if(st.saving||st.loading)return;
    if(!options.force&&!confirmLeave())return;
    const recordId=st.selectedRecord?.id_ins_fl||options.recordId;
    st.editingGroup=null;st.touched.clear();st.conflict=false;
    busy(true);status('Actualizando...','loading');alertMessage('');
    try{
      await loadContract();
      if(!isCurrentContext_cor(epoch))return;
      const listReloaded=await search(raw($('iadm-cor-search-input')?.value));
      if(!isCurrentContext_cor(epoch))return;
      if(!listReloaded)return;
      if(recordId){
        const detailReloaded=await openRecord(recordId);
        if(!isCurrentContext_cor(epoch)||!detailReloaded)return;
      }
      status('Actualizado','ready');
    }catch(e){if(isCurrentContext_cor(epoch)){status(e.message,'error');alertMessage(e.message);}}
    finally{if(isCurrentContext_cor(epoch))busy(false);}
  }
  function bind(){
    if(st.bound)return;st.bound=true;
    $('iadm-cor-search-form')?.addEventListener('submit',e=>{
      e.preventDefault();if(!confirmLeave())return;
      clearSelection();search($('iadm-cor-search-input')?.value||'');
    });
    $('iadm-cor-clear')?.addEventListener('click',()=>{
      if(!confirmLeave())return;
      const input=$('iadm-cor-search-input');if(input)input.value='';
      clearSelection();search('');
    });
    $('iadm-cor-refresh')?.addEventListener('click',()=>refresh());
    $('iadm-cor-change-record')?.addEventListener('click',()=>{if(confirmLeave())clearSelection();});
    view()?.addEventListener('click',e=>{
      const record=e.target.closest('[data-record-id]');
      if(record){if(confirmLeave())openRecord(record.dataset.recordId);return;}
      const grp=e.target.closest('[data-group-key]');
      if(grp){
        if(grp.dataset.groupKey===st.activeGroup||!confirmLeave())return;
        st.editingGroup=null;st.touched.clear();st.conflict=false;
        st.activeGroup=grp.dataset.groupKey;activeGroup();return;
      }
      const clear=e.target.closest('[data-clear-field]');
      if(clear){
        const field=clear.dataset.clearField,input=$('iadm-cor-input-'+field);
        if(input){input.value='';st.touched.add(field);updateDirtyUi();}return;
      }
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action==='start-edit')startEdit();
      if(action==='cancel-edit'&&confirmLeave()){
        st.editingGroup=null;st.touched.clear();st.conflict=false;
        activeGroup();status('Edicion cancelada','ready');
      }
    });
    for(const type of ['input','change'])view()?.addEventListener(type,e=>{
      const field=e.target?.dataset?.fieldControl;
      if(field&&st.editingGroup){st.touched.add(field);updateDirtyUi();}
    });
    view()?.addEventListener('submit',e=>{
      if(e.target?.id==='iadm-cor-edit-form'){e.preventDefault();save();}
    });
  }
  async function init(payload){
    const epoch=ensureContext_cor();
    try{
      await loadHtml();if(!isCurrentContext_cor(epoch))return;
      bind();st.ready=true;
      if(window.ManttoPermissions?.apply)window.ManttoPermissions.apply(view());
      if(!st.contract)await loadContract();
      if(!isCurrentContext_cor(epoch))return;
      const id=Number(payload?.id);
      if(Number.isSafeInteger(id)&&id>0){if(confirmLeave())await openRecord(id);}
      else if(!st.records.length)await search('');
    }catch(e){if(isCurrentContext_cor(epoch)){status(e.message,'error');alertMessage(e.message);}}
  }
  function refreshAfterContextSwitch_cor(options={}){
    const active=window.ManttoRouter?.getCurrent?.()?.route==='instalaciones-administracion';
    resetSensitiveState_cor();
    if(active&&st.ready&&currentContext_cor()!=='NO_SESSION')
      Promise.resolve().then(()=>refresh({...options,force:true})).catch(()=>{});
  }
  document.addEventListener('mantto:navigation',e=>{
    const d=e?.detail||{};
    if(d.route!=='instalaciones-administracion')return;
    ensureContext_cor();
    if(!st.ready)return;
    const id=Number(d.payload?.id);
    if(!st.contract){
      refresh({force:true,recordId:Number.isSafeInteger(id)&&id>0?id:null}).catch(()=>{});
      return;
    }
    if(d.type==='open'&&Number.isSafeInteger(id)&&id>0&&confirmLeave())openRecord(id).catch(()=>{});
  });
  document.addEventListener('mantto:auth-ready',()=>refreshAfterContextSwitch_cor());
  document.addEventListener('mantto:view-user-changed',()=>refreshAfterContextSwitch_cor());
  document.addEventListener('mantto:session-expired',()=>resetSensitiveState_cor());
  document.addEventListener('mantto:permissions-updated',()=>{
    const id=st.selectedRecord?.id_ins_fl;
    refreshAfterContextSwitch_cor({recordId:id});
  });
  window.ManttoInstalacionesAdministracion_cor=Object.freeze({init,refresh});
})();
