/* BLT NOW | 2026-10-20 | Instalaciones Administracion: Altas Fase 4 V001
 * Conserva F2/F3: tabla con edicion fantasma + formulas Excel en vivo.
 * F4: POST transaccional confirmado manualmente, GET posterior y refresco.
 * 2026-10-29: duplicacion de borradores sin PH NS ni Referencia en sitio.
 * No hay auto-POST ni reintento despues de resultado incierto.
 * AR/BB son PREVISIONES y nunca se guardan como fin real.
 */
(function (root, factory) {
  'use strict';
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) {
    root.ManttoInstalacionesAltasCaptura_cor = api;
    api.install(root);
  }
})(typeof window === 'object' ? window : null, function () {
  'use strict';

  const ROOT = '/api/instalaciones/administracion';
  const MAX = 20;
  const REQUIRED = Object.freeze(['proyecto', 'id_proyecto', 'referencia_sitio']);
  const NO_INPUT = new Set([
    'id_ins_fl', 'activo', 'id_sup', 'id_asesor', 'id_admin',
    'created_at', 'updated_at', 'rel_admin',
    'estatus_completo', 'dias_sin_visita', 'dias_sin_ccnr', 'dias_restantes',
    // La Fase 3 calcula PREVISTAS en memoria; nunca escribe estos campos.
    'meses_garantia_restantes', 'fecha_fin_montaje_real',
    'fecha_fin_ajuste_real', 'anio_termino', 'costo_mensual_mantenimiento_cem'
  ]);
  const PHASE3 = new Set([
    'meses_garantia_restantes', 'fecha_fin_montaje_real',
    'fecha_fin_ajuste_real', 'anio_termino', 'costo_mensual_mantenimiento_cem'
  ]);
  const LIST_FIELDS = new Set(['estatus', 'vendedor', 'supervisor_fl']);
  const DUPLICATE_OMITTED = new Set(['ph_ns', 'referencia_sitio']);
  const LABELS = Object.freeze({
    proyecto:'Proyecto', id_proyecto:'PP NS', referencia_sitio:'Referencia en sitio',
    estatus:'Estatus', estatus_completo:'Estatus completo', fecha_visita:'Ultima visita',
    comentarios_fl:'Comentarios FL', avance_oc:'Avance OC', avance_mo:'Avance MO',
    avance_aj:'Avance AJ', dias_sin_visita:'Dias sin visita', dias_sin_ccnr:'Dias sin CCNR',
    numero_equipo_fabrica:'No. equipo fabrica', tipo_equipo:'Tipo de equipo',
    numero_pisos:'No. pisos', numero_desembarques:'No. desembarques',
    numero_puertas:'No. puertas', velocidad_ms:'Velocidad [m/s]',
    capacidad_kg:'Capacidad [kg]', entrepiso_mm:'Entrepiso [mm]',
    longitud_mm:'Longitud [mm]', ancho_peldano_mm:'Ancho peldano [mm]',
    vendedor:'Vendedor', supervisor_fl:'Supervisor', cliente_ns:'Cliente NS',
    ov_ns:'OV NS', ph_ns:'PH NS', rel_admin:'Administrativos relacionados',
    anio_termino:'Anio de termino', dias_restantes:'Dias restantes'
  });
  const own = (x,k) => Object.prototype.hasOwnProperty.call(x || {},k);
  const trimmed = x => String(x == null ? '' : x).trim();
  const escape = x => String(x == null ? '' : x).replace(/&/g,'&amp;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
  const label = field => LABELS[field] || String(field).replace(/_/g,' ')
    .replace(/^./, c => c.toUpperCase());
  const identityKey = value => trimmed(value).replace(/\s+/g,' ').toLocaleUpperCase('es-MX');

  function visibleFields(contract, ghostHelpers) {
    const groups = (Array.isArray(contract?.groups) ? contract.groups : [])
      .filter(g => g?.permissions?.can_view === true);
    const all = groups.flatMap(g => g.fields || []);
    const rel = groups.some(g=>g.key==='responsables') && groups.some(g=>g.key==='cliente_contrato');
    const provided = rel ? [...all,'rel_admin'] : all;
    if (typeof ghostHelpers?.visibleColumns_cor === 'function') {
      return ghostHelpers.visibleColumns_cor(provided, groups);
    }
    const canSee = new Set(all);
    return [...new Set(provided.filter(f => ![
      'id_ins_fl','id_proyecto','id_sup','id_asesor','id_admin',
      'activo','created_at','updated_at'
    ].includes(f) && (canSee.has(f) || (f==='rel_admin' && rel))))];
  }

  function canCapture(contract) {
    return Boolean(contract && Array.isArray(contract.groups) &&
      contract.groups.find(g => g.key==='proyecto' && g.permissions?.can_edit === true &&
        g.permissions?.can_view === true) &&
      contract.groups.every(g => !g.permissions?.can_edit || g.permissions?.can_view));
  }

  function editable(field) { return field==='id_proyecto' || !NO_INPUT.has(field); }
  function createRow(id, defaults=null) {
    const row={draft_id:id, values:Object.create(null)};
    for(const [field,value] of Object.entries(defaults || {})){
      if(!DUPLICATE_OMITTED.has(field))row.values[field]=value;
    }
    return row;
  }
  function duplicateRow(source, id) {
    return createRow(id,source?.values);
  }
  function projectPrefill(context, fields) {
    const values=Object.create(null), source=context?.template || {};
    const allowed=new Set(['id_proyecto',...(fields || []).filter(editable)]);
    for(const field of allowed){
      if(!DUPLICATE_OMITTED.has(field) && own(source,field))values[field]=source[field];
    }
    const project=context?.project || {};
    for(const field of ['id_proyecto','proyecto']){
      if(own(project,field) && trimmed(project[field]))values[field]=project[field];
    }
    return values;
  }
  function validateDraftCell(field, raw, meta={}, catalogs=null, helpers={}) {
    const value = trimmed(raw);
    if (!editable(field)) return {ok:false,error:'Campo calculado o de sistema.'};
    if (field==='id_proyecto') {
      if (value.length>100) return {ok:false,error:'PP NS excede 100 caracteres.'};
      return {ok:true,value:value||null};
    }
    if (!value) return {ok:true,value:null};
    if (typeof helpers.validValue_cor === 'function')
      return helpers.validValue_cor(field,value,meta,catalogs);
    const length=Number(meta.max_length || 20000);
    if (value.length>length) return {ok:false,error:'Texto demasiado largo.'};
    return {ok:true,value};
  }
  // Calculadora pura inyectada: compartimos el mismo contrato con backend,
  // pero no agregamos al borrador valores de campos derivados.
  function previewRowCor(values, calculator, today) {
    if(!calculator || typeof calculator.calculateCor!=='function')return null;
    return calculator.calculateCor(values, today ? {today} : {});
  }
  function assessRows(rows) {
    const identities = new Map(), names = new Map();
    const issues = [];
    if (!Array.isArray(rows) || rows.length<1 || rows.length>MAX)
      issues.push('El lote admite de 1 a 20 equipos.');
    for (let index=0;index<(rows||[]).length;index++) {
      const row=rows[index]?.values || {};
      const missing=REQUIRED.filter(f => !identityKey(row[f]) ||
        ['-','NULL','N/A','N/D','SIN PP NS'].includes(identityKey(row[f])));
      if (missing.length) issues.push(`Fila ${index+1}: falta ${missing.map(label).join(', ')}.`);
      if (missing.some(f=>f==='id_proyecto')) continue;
      const ppns=identityKey(row.id_proyecto), project=identityKey(row.proyecto);
      if (names.has(ppns) && project && names.get(ppns) && names.get(ppns)!==project)
        issues.push(`Fila ${index+1}: PP NS compartido por nombres distintos.`);
      else if (project) names.set(ppns,project);
      const ref=identityKey(row.referencia_sitio);
      if (ref) {
        const key=JSON.stringify([ppns,ref]);
        if (identities.has(key)) issues.push(`Fila ${index+1}: referencia duplicada en el lote (fila ${identities.get(key)}).`);
        else identities.set(key,index+1);
      }
    }
    return {ok:issues.length===0,issues,count:rows?.length||0};
  }

  function postRowsCor(rows) {
    const verdict=assessRows(rows);
    if(!verdict.ok)throw Error(verdict.issues.join(' '));
    return {rows:rows.map(item=>{
      const value=item.values||{};
      // El backend calcula todos los campos reservados, sin confiar en cliente.
      const output={};
      for(const [field,v] of Object.entries(value)) {
        if(!editable(field))throw Error('Campo no editable en el borrador: '+field);
        if(v!==null&&typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean')
          throw Error('Valor no escalar: '+field);
        output[field]=v;
      }
      return output;
    })};
  }
  function acceptedPostCor(response, expectedCount) {
    if(response?.ok!==true||Number(response.created)!==expectedCount||
       !Array.isArray(response.records)||response.records.length!==expectedCount)
      throw Error('La respuesta del servidor no confirma la totalidad de las altas.');
    const ids=response.records.map(item=>Number(item?.id_ins_fl));
    if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)
      throw Error('La respuesta no contiene identificadores unicos comprobables.');
    return ids;
  }

  function install(env) {
    const document=env.document;
    let host=null, observer=null, context=null, contract=null, catalogs=null, prefillValues=null;
    let rows=[], seq=0, current=null, visible=false, beforeVisibility=new Map(), error='';
    let saving=false, uncertain=false;
    let requestSerial=0, boundHost=null;
    const node=id=>host?.querySelector('#'+id)||null;
    const auth=()=>env.ManttoAuth;
    const authIdentity=()=>{
      const client=auth();
      if (!client?.getToken?.()) return 'NO_SESSION';
      const uid=u=>String(u?.id_SB||u?.id||u?.email||'anon');
      return [uid(client.getActorUser?.()),uid(client.getUser?.()),uid(client.getViewUser?.())].join(':');
    };
    const viewing=()=>Boolean(auth()?.isViewingAs?.());
    const helpers=()=>env.ManttoInstalacionesGhost_cor?.helpers||{};
    const formulaEngine=()=>env.ManttoInstalacionesAltasFormulas_cor||null;
    const meta=field=>contract?.field_meta?.[field]||{kind:'text',max_length:20000};
    const allFields=()=>visibleFields(contract,helpers());
    const canUse=()=>authIdentity()!=='NO_SESSION' && !viewing() && canCapture(contract);
    const rowById=id=>rows.find(row=>row.draft_id===Number(id));
    function clearSensitive() {
      ++requestSerial;
      context=null;contract=null;catalogs=null;prefillValues=null;rows=[];seq=0;current=null;error='';
      // No conservar payload ni datos personales tras cambio de sesion.
      uncertain=false;
      saving=false;
      if (visible) close(false);
      node('iadm-cor-altas-open')?.setAttribute('hidden','');
      if (node('iadm-cor-altas-panel')) {
        node('iadm-cor-altas-panel').hidden=true;
        const table=node('iadm-cor-altas-table');if(table)table.replaceChildren();
      }
    }
    function prepareNodes() {
      if(!host?.querySelector('.iadm-cor-head-actions') || !host.querySelector('#iadm-cor-projects'))return false;
      if(!node('iadm-cor-altas-open')) {
        const button=document.createElement('button');
        button.id='iadm-cor-altas-open';button.type='button';
        button.className='iadm-cor-btn iadm-cor-btn-primary';
        button.textContent='+ Agregar nuevo';button.hidden=true;
        host.querySelector('.iadm-cor-head-actions').prepend(button);
      }
      if (!node('iadm-cor-altas-panel')) {
        const panel=document.createElement('section');
        panel.className='iadm-cor-card iadm-cor-altas-panel';
        panel.id='iadm-cor-altas-panel';panel.hidden=true;
        panel.setAttribute('aria-label','Captura de equipos nuevos');
        panel.innerHTML='<div class="iadm-cor-altas-heading">'+
          '<div><p class="iadm-cor-eyebrow">Alta de equipos · Borrador local</p>'+
          '<h2>Agregar equipos nuevos</h2><p>Una fila = un equipo. Los campos opcionales pueden permanecer vacios (NULL).</p></div>'+
          '<button class="iadm-cor-btn" id="iadm-cor-altas-back" type="button">&larr; Cancelar</button></div>'+
          '<div class="iadm-cor-altas-notice">Misma tabla y edicion fantasma · Todas las columnas autorizadas · '+
          'El lote se envia solo al confirmar; formulas Excel calculadas por servidor. ' +
          'Las fechas AR/BB son PREVISTAS, nunca terminaciones reales.</div>'+
          '<div class="iadm-cor-altas-actions">'+
          '<span id="iadm-cor-altas-count" aria-live="polite">0 de 20 equipos</span>'+
          '<button class="iadm-cor-btn iadm-cor-btn-primary" id="iadm-cor-altas-add" type="button">+ Agregar fila</button>'+
          '<button class="iadm-cor-btn" id="iadm-cor-altas-clear" type="button">Eliminar borrador</button></div>'+
          '<div class="iadm-cor-altas-scroll iadm-cor-equipment-list" id="iadm-cor-altas-table" role="region" tabindex="0" '+
          'aria-label="Tabla de captura de equipos nuevos"></div>'+
          '<p class="iadm-cor-altas-feedback" id="iadm-cor-altas-feedback" role="status" aria-live="polite"></p>'+
          '<div class="iadm-cor-altas-footer"><button id="iadm-cor-altas-cancel" class="iadm-cor-btn" '+
          'type="button">Cancelar</button><button id="iadm-cor-altas-save" class="iadm-cor-btn iadm-cor-btn-primary" '+
          'type="button" disabled>Guardar lote</button></div>';
        const place=host.querySelector('#iadm-cor-projects');
        place.parentNode.insertBefore(panel,place);
      }
      if(boundHost!==host) {
        if(boundHost)boundHost.removeEventListener('click',onClick);
        if(boundHost)boundHost.removeEventListener('change',onChange);
        if(boundHost)boundHost.removeEventListener('keydown',onKeyDown);
        if(boundHost)boundHost.removeEventListener('focusout',onFocusOut,true);
        boundHost=host;
        host.addEventListener('click',onClick);
        host.addEventListener('change',onChange);
        host.addEventListener('keydown',onKeyDown);
        host.addEventListener('focusout',onFocusOut,true);
      }
      return true;
    }
    async function refreshAuthorization() {
      if (!prepareNodes())return;
      const identity=authIdentity(), serial=++requestSerial;
      if(identity==='NO_SESSION'||viewing()){clearSensitive();return;}
      if(context && context!==identity)clearSensitive();
      context=identity;
      try {
        const data=await auth().api(ROOT+'/contrato',{method:'GET',cache:'no-store'});
        if(serial!==requestSerial || authIdentity()!==identity||viewing())return;
        contract=data;
        const permitted=canUse();
        if(!permitted){node('iadm-cor-altas-open').hidden=true;if(visible)close(false);return;}
        const catalog=await auth().api(ROOT+'/catalogos-edicion',{method:'GET',cache:'no-store'});
        if(serial!==requestSerial || authIdentity()!==identity||viewing())return;
        if(!Array.isArray(catalog?.estatus) || !Array.isArray(catalog?.vendedores) ||
          !Array.isArray(catalog?.supervisores))throw Error('Catalogos incompletos.');
        catalogs=catalog;
        node('iadm-cor-altas-open').hidden=false;
      } catch(e) {
        if(serial===requestSerial){
          node('iadm-cor-altas-open')?.setAttribute('hidden','');
          if(visible)close(false);
        }
      }
    }
    function open() {
      if(saving)return false;
      if(!canUse()||!catalogs || !prepareNodes())return false;
      if(host.querySelector('[data-v2-editing="1"]')){
        error='Termina la edicion del equipo abierto antes de iniciar un alta.';
        return false;
      }
      const projectContext=env.ManttoInstalacionesAdministracion_cor?.getAltaContext?.() || null;
      prefillValues=projectPrefill(projectContext,allFields());
      if(!rows.length)rows=[createRow(++seq,prefillValues)];
      beforeVisibility=new Map();
      for(const id of ['iadm-cor-projects','iadm-cor-project','iadm-cor-bulk','iadm-cor-selected','iadm-cor-empty']){
        const n=node(id);if(n){beforeVisibility.set(id,n.hidden);n.hidden=true;}
      }
      visible=true;node('iadm-cor-altas-panel').hidden=false;
      current=null;error='';render();
      return true;
    }
    function close(confirmDiscard=true) {
      if(saving)return false;
      if(!visible)return true;
      if(confirmDiscard && (uncertain||rows.some(row=>Object.keys(row.values).length>0)) &&
          !env.confirm(uncertain ?
            'El envio anterior tiene resultado INCIERTO. Para evitar duplicados, primero comprueba los equipos en Aiven. ¿Salir SIN reintentar?' :
            'Se perderan los equipos nuevos sin guardar. ¿Cancelar y eliminar el borrador?'))return false;
      visible=false;current=null;
      const panel=node('iadm-cor-altas-panel');if(panel)panel.hidden=true;
      for(const [id,wasHidden] of beforeVisibility){const n=node(id);if(n)n.hidden=wasHidden;}
      beforeVisibility.clear();rows=[];seq=0;error='';uncertain=false;prefillValues=null;
      const table=node('iadm-cor-altas-table');if(table)table.replaceChildren();
      return true;
    }
    function optionsFor(field, selected) {
      let options=[];
      if(field==='estatus')options=(catalogs?.estatus||[]).map(x=>({value:x.codigo,label:x.codigo+' · '+(x.nombre||x.codigo)}));
      else {
        const source=field==='vendedor'?catalogs?.vendedores:catalogs?.supervisores;
        options=helpers().uniqueInitials_cor ? helpers().uniqueInitials_cor(source||[]).map(x=>({
          value:x.iniciales,label:x.iniciales
        })) : [];
      }
      return '<option value="">Sin asignar</option>'+options.map(x=>'<option value="'+escape(x.value)+'"'+
        (trimmed(selected)===String(x.value)?' selected':'')+'>'+escape(x.label)+'</option>').join('');
    }
    function editorHtml(field,value) {
      const config=meta(field),kind=config.kind||'text';
      const attrs=' data-iadm-altas-editor="1" data-iadm-altas-editor-field="'+escape(field)+'" aria-label="'+escape(label(field))+'"';
      let input;
      if(LIST_FIELDS.has(field))input='<select'+attrs+'>'+optionsFor(field,value)+'</select>';
      else if(kind==='date')input='<input'+attrs+' type="date" min="1900-01-01" max="2100-12-31" value="'+escape(value||'')+'">';
      else if(kind==='money'||kind==='percent')input='<input'+attrs+' type="number" min="0" max="'+
        (kind==='percent'?100:9999999999.99)+'" step="0.01" value="'+escape(trimmed(value).replace(/%$/,''))+'">';
      else if(kind==='textarea')input='<textarea'+attrs+' maxlength="'+Number(config.max_length||20000)+'" rows="2">'+escape(value||'')+'</textarea>';
      else input='<input'+attrs+' type="text" maxlength="'+Number(config.max_length||20000)+'" value="'+escape(value||'')+'">';
      return '<div class="iadm-cor-ghost-editor"><small class="iadm-cor-ghost-label">'+escape(label(field))+'</small>'+input+
        '<small class="iadm-cor-v2-help">Enter o salir para confirmar el borrador · Esc cancela.</small>'+
        '<small class="iadm-cor-ghost-error" data-iadm-altas-error="1" role="alert" hidden></small></div>';
    }
    function cell(row,field,preview) {
      const active=Boolean(current&&current.id===row.draft_id&&current.field===field);
      const required=REQUIRED.includes(field);
      const readonly=!editable(field);
      const engine=formulaEngine();
      const value=readonly&&preview&&Object.prototype.hasOwnProperty.call(preview,field)
        ?preview[field]:row.values[field];
      let content='';
      if(active)content=editorHtml(field,value);
      else if(readonly){
        const suggested=Boolean(engine?.isSuggestedDateCor?.(field));
        const present=engine?.formatCor?engine.formatCor(field,value):(value??'—');
        content='<span class="iadm-cor-matrix-value"'+(suggested?' title="Fecha prevista: NO es una fecha real confirmada"':'')+'>'+ 
          escape(present)+'</span><small class="iadm-cor-v2-readonly">'+
          (suggested?'Fecha PREVISTA · no REAL':PHASE3.has(field)?'Formula Excel · previo':
          'Automatico · previo')+'</small>';
      }
      else content='<button type="button" class="iadm-cor-ghost-trigger" data-iadm-altas-edit="1" '+
        'data-iadm-altas-id="'+row.draft_id+'" data-iadm-altas-field="'+escape(field)+'">'+
        '<span class="iadm-cor-matrix-value">'+escape(value??'—')+'</span><small class="iadm-cor-ghost-affordance">'+
        (required&&!trimmed(value)?'Requerido':'Editar')+'</small></button>';
      return '<td data-iadm-altas-cell="1"'+(active?' data-v2-editing="1"':'')+'>'+content+'</td>';
    }
    function render() {
      if(!visible || !host)return;
      const container=node('iadm-cor-altas-table');if(!container)return;
      const columns=allFields();
      // Una vista previa por fila y render; nada se agrega a row.values.
      const engine=formulaEngine();
      let calcError='';
      const previews=new Map();
      if(engine?.calculateCor){
        try{
          const today=engine.todayMexicoCor();
          for(const item of rows)previews.set(item.draft_id,previewRowCor(item.values,engine,today));
        }catch(e){calcError='No se pudieron actualizar las formulas: '+String(e.message||e);}
      }else calcError='El motor de formulas Fase 3 no esta cargado.';
      // Las 89 columnas historicas permanecen iguales; PP NS es una columna
      // de identidad adicional, porque el Ghost de edicion lo oculta.
      const header='<th scope="col" class="iadm-cor-altas-row-head">Fila</th><th scope="col">PP NS *</th>'+columns.map(x=>
        '<th scope="col">'+escape(label(x))+'</th>').join('');
      const body=rows.map((row,index)=>'<tr data-iadm-altas-row="'+row.draft_id+'">'+
        '<td class="iadm-cor-altas-row-head"><strong>'+String(index+1)+'</strong><div class="iadm-cor-altas-row-actions">'+
        '<button class="iadm-cor-btn iadm-cor-btn-compact" type="button" data-iadm-altas-duplicate="'+row.draft_id+'" '+
        'aria-label="Duplicar fila '+String(index+1)+' sin PH NS ni Referencia en sitio" '+
        (rows.length>=MAX?'disabled':'')+'>Duplicar</button>'+
        '<button class="iadm-cor-btn iadm-cor-btn-compact" type="button" data-iadm-altas-remove="'+row.draft_id+'" '+
        (rows.length===1?'disabled':'')+'>Quitar</button></div></td>'+cell(row,'id_proyecto',previews.get(row.draft_id))+
        columns.map(field=>cell(row,field,previews.get(row.draft_id))).join('')+'</tr>').join('');
      container.innerHTML='<table class="iadm-cor-matrix"><thead><tr>'+header+'</tr></thead><tbody>'+body+'</tbody></table>';
      const count=node('iadm-cor-altas-count');if(count)count.textContent=rows.length+' de '+MAX+
        ' equipos · '+columns.length+' columnas del modulo + PP NS';
      const add=node('iadm-cor-altas-add');if(add)add.disabled=rows.length>=MAX||saving;
      const clear=node('iadm-cor-altas-clear');if(clear)clear.disabled=saving;
      const back=node('iadm-cor-altas-back');if(back)back.disabled=saving;
      const cancel=node('iadm-cor-altas-cancel');if(cancel)cancel.disabled=saving;
      const save=node('iadm-cor-altas-save');
      if(save){save.disabled=saving||uncertain||!canUse()||!engine?.calculateCor||!assessRows(rows).ok;
        save.textContent=saving?'Guardando lote...':'Guardar '+rows.length+' equipo'+(rows.length===1?'':'s');}
      const result=assessRows(rows);
      const feedback=node('iadm-cor-altas-feedback');if(feedback) {
        feedback.textContent=error||calcError||(result.ok?'Vista previa calculada; confirma para guardar el lote.':
          result.issues.slice(0,4).join(' ')+(result.issues.length>4?' (+ mas pendientes)':''));
        feedback.dataset.state=(error||calcError)?'error':result.ok?'ready':'pending';
      }
      if(current){
        const control=container.querySelector('[data-iadm-altas-row="'+current.id+'"] [data-iadm-altas-editor-field="'+current.field+'"]');
        if(control){control.focus();if(typeof control.select==='function' && control.type==='text')control.select();}
      }
    }
    function beginEdit(id,field) {
      if(!visible||saving||uncertain||!canUse()||!catalogs||!editable(field))return;
      if(!rowById(id)|| (field!=='id_proyecto'&&!allFields().includes(field)))return;
      if(current && !commitCurrent())return;
      current={id:Number(id),field};error='';render();
    }
    function commitCurrent() {
      if(!current)return true;
      if(saving||uncertain)return false;
      const currentEdit=current, row=rowById(currentEdit.id);
      const field=currentEdit.field;
      if(!row){current=null;return false;}
      const input=host?.querySelector('[data-iadm-altas-row="'+currentEdit.id+'"] [data-iadm-altas-editor-field="'+field+'"]');
      if(!input)return false;
      const normalized=validateDraftCell(field,input.value,meta(field),catalogs,helpers());
      if(!normalized.ok){
        const msg=input.parentElement?.querySelector('[data-iadm-altas-error]');
        if(msg){msg.textContent=normalized.error;msg.hidden=false;}
        input.setAttribute('aria-invalid','true');error=normalized.error;return false;
      }
      if(normalized.value===null)delete row.values[field];else row.values[field]=normalized.value;
      current=null;error='';render();return true;
    }
    async function saveBatch() {
      if(!visible||saving||uncertain||!canUse())return false;
      if(current && !commitCurrent())return false;
      if(!formulaEngine()?.calculateCor){error='El calculador de formulas no esta disponible.';render();return false;}
      let payload;
      try {payload=postRowsCor(rows);}
      catch(e){error=e.message;render();return false;}
      const count=payload.rows.length;
      const projects=new Set(payload.rows.map(item=>item.id_proyecto));
      if(!env.confirm('Crear '+count+' equipo(s) en '+projects.size+' proyecto(s)?\n\n'+
        'El lote se guardara de forma atomica y quedara auditado.'))return false;
      const session=authIdentity();
      saving=true;error='Enviando '+count+' equipo(s) a Aiven. No cierres esta pantalla.';render();
      let confirmedIds=null;
      try {
        let response;
        try {response=await auth().api(ROOT+'/altas',{
          method:'POST',cache:'no-store',body:JSON.stringify(payload)
        });}
        catch(e) {
          const rejected=[400,401,403,404,409,413,422].includes(Number(e?.status));
          if(!rejected)uncertain=true; // Timeout/5xx puede haber hecho COMMIT.
          throw e;
        }
        try {confirmedIds=acceptedPostCor(response,count);}
        catch(e){uncertain=true;throw e;}
        if(session!==authIdentity()||viewing()){
          // POST puede haber sido aceptado, pero el contexto ya es diferente.
          // No se exponen IDs ni borradores a la nueva identidad.
          clearSensitive();return true;
        }
        // El POST confirmado NUNCA se reenvia, incluso si falla la lectura.
        // Consulta individual con Guard y scope para cada equipo creado.
        let verified=0;
        for(const id of confirmedIds) {
          try {
            const read=await auth().api(ROOT+'/registros/'+encodeURIComponent(id),{
              method:'GET',cache:'no-store'
            });
            if(read?.data&&Number(read.data.id_ins_fl)===id)verified++;
          }catch(_e){/* Puede perder alcance tras alta, NO reintentar POST. */}
        }
        saving=false;
        close(false);
        const main=env.ManttoInstalacionesAdministracion_cor;
        if(typeof main?.refresh==='function'){
          try {await main.refresh({force:true});}catch(_e){/* POST ya confirmado. */}
        }
        if(session===authIdentity()){
          const message='Alta confirmada: '+count+' equipo(s). GET verificados: '+verified+'/'+count+
            (verified===count?'.':'. Verifica permisos o refresca los proyectos; NO repitas el POST.');
          const statusNode=node('iadm-cor-status');if(statusNode){statusNode.textContent=message;
            statusNode.dataset.type=verified===count?'ready':'error';}
        }
        return true;
      }catch(e){
        if(session!==authIdentity()){clearSensitive();return false;}
        error=uncertain?'Resultado de guardado INCIERTO: pudo confirmarse en Aiven. NO reintentes. Actualiza y busca tus equipos antes de cualquier nueva captura.':
          'No se creo el lote: '+String(e?.message||'Error al guardar.');
        if(!confirmedIds&&e?.status===409)error+=' Revisa referencias repetidas, PPNS y sincronizacion.';
        return false;
      }finally{saving=false;if(visible&&session===authIdentity())render();}
    }
    function onClick(event) {
      const target=event.target;
      if(target.closest('#iadm-cor-altas-open')){event.preventDefault();open();return;}
      if(!visible)return;
      if(target.closest('#iadm-cor-altas-save')){event.preventDefault();void saveBatch();return;}
      if(saving){event.preventDefault();return;}
      if(target.closest('#iadm-cor-altas-back, #iadm-cor-altas-cancel')){
        event.preventDefault();current=null;close();return;}
      if(uncertain){event.preventDefault();return;}
      if(target.closest('#iadm-cor-altas-add')){event.preventDefault();if(current&&!commitCurrent())return;
        if(rows.length<MAX){rows.push(createRow(++seq,prefillValues));render();}return;}
      if(target.closest('#iadm-cor-altas-clear')){event.preventDefault();if(!env.confirm('¿Eliminar todos los borradores de equipos nuevos?'))return;
        rows=[createRow(++seq,prefillValues)];current=null;error='';render();return;}
      const duplicate=target.closest('[data-iadm-altas-duplicate]');
      if(duplicate){event.preventDefault();if(current&&!commitCurrent())return;if(rows.length>=MAX)return;
        const id=Number(duplicate.dataset.iadmAltasDuplicate),index=rows.findIndex(row=>row.draft_id===id);
        if(index<0)return;
        rows.splice(index+1,0,duplicateRow(rows[index],++seq));current=null;error='';render();return;}
      const removed=target.closest('[data-iadm-altas-remove]');
      if(removed){event.preventDefault();if(rows.length<=1)return;
        const id=Number(removed.dataset.iadmAltasRemove),row=rowById(id);
        if(row && Object.keys(row.values).length && !env.confirm('¿Quitar esta fila de captura?'))return;
        rows=rows.filter(x=>x.draft_id!==id);current=null;render();return;}
      const edit=target.closest('[data-iadm-altas-edit]');
      if(edit){event.preventDefault();beginEdit(edit.dataset.iadmAltasId,edit.dataset.iadmAltasField);}
    }
    function onChange(event) {
      if(visible && current && event.target?.matches?.('[data-iadm-altas-editor]') &&
          (LIST_FIELDS.has(current.field)||meta(current.field).kind==='date'))commitCurrent();
    }
    function onKeyDown(event) {
      if(!visible || !current || !event.target?.matches?.('[data-iadm-altas-editor]'))return;
      if(event.key==='Escape'){event.preventDefault();current=null;error='';render();return;}
      if(event.key==='Enter' && meta(current.field).kind!=='textarea'){
        event.preventDefault();commitCurrent();
      }
    }
    function onFocusOut(event) {
      if(!visible || !current || !event.target?.matches?.('[data-iadm-altas-editor]'))return;
      // El cambio de foco puede producirse al clicar sobre Agregar/Cancelar:
      // el editor confirma el borrador, pero NUNCA crea registros en MySQL.
      const {id, field}=current;
      env.setTimeout(()=>{
        if(visible && current?.id===id && current?.field===field)commitCurrent();
      },0);
    }
    function watch() {
      const element=document.getElementById('view-instalaciones-administracion');
      if (!element)return;
      if(host!==element) {
        observer?.disconnect();host=element;
        observer=new env.MutationObserver(()=>{
          if(prepareNodes() && !context && authIdentity()!=='NO_SESSION')void refreshAuthorization();
        });
        observer.observe(host,{childList:true});
      }
      if(prepareNodes() && !context && authIdentity()!=='NO_SESSION')void refreshAuthorization();
    }
    document.addEventListener('mantto:navigation',event=>{
      const route=event?.detail?.route;
      if(route==='instalaciones-administracion')env.setTimeout(watch,0);
      else clearSensitive();
    });
    document.addEventListener('mantto:view-initialized',event=>{
      if(event?.detail?.route==='instalaciones-administracion')watch();
    });
    for(const name of ['mantto:auth-ready','mantto:view-user-changed',
      'mantto:session-expired','mantto:logout','mantto:permissions-updated']) {
      document.addEventListener(name,()=>{
        clearSensitive();
        if(['mantto:auth-ready','mantto:permissions-updated','mantto:view-user-changed'].includes(name))
          env.setTimeout(watch,0);
      });
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});
    else env.setTimeout(watch,0);
  }
  return {install, helpers:Object.freeze({
    visibleFields,canCapture,editable,createRow,duplicateRow,projectPrefill,validateDraftCell,assessRows,previewRowCor,
    postRowsCor,acceptedPostCor,MAX,REQUIRED,NO_INPUT
  })};
});
