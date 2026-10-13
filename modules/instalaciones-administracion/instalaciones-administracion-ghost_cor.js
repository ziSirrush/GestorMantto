/* [Aster | 2026-10-13 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001]
 * Editor fantasma local: la Fase 3 agrega boton de guardado EXPLICITO.
 * Este helper nunca invoca la API: delega el guardado al modulo, que valida
 * contexto, autorizacion y relectura desde el backend.
 * No usa fetch, PATCH, POST, localStorage, sessionStorage ni IndexedDB.
 * Los permisos y el alcance pertenecen al backend; esta capa solo habilita UI
 * para campos autorizados por el contrato entregado en el contexto actual.
 */
(function (root, factory) {
  'use strict';
  const exported = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (root) root.ManttoInstalacionesGhost_cor = exported;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const SYSTEM_FIELDS = new Set(['id_ins_fl','created_at','updated_at']);
  const GHOST_PAGE_SIZE = 30;

  function create(opts) {
    if (!opts || typeof opts !== 'object') throw new Error('Falta contrato del editor fantasma.');
    const { st, $, view, groups, canEdit, esc, label, meta, display,
      isoDate, previewNumber, canonicalCompare, userOptions, loadUsers,
      pager, isViewingAs, currentContext, announce, onSave } = opts;
    for (const key of ['st','$','view','groups','canEdit','esc','label','meta','display',
      'isoDate','previewNumber','canonicalCompare','userOptions','loadUsers','pager','isViewingAs',
      'currentContext','announce']) {
      if (key !== 'st' && typeof opts[key] !== 'function') throw new Error('Adaptador fantasma incompleto: '+key);
    }
    if(typeof onSave!=='function') throw new Error('Fase 3 requiere callback de guardado manual.');
    const drafts = new Map();
    let active = null;
    let bound = false;
    let saving = false;
    let saveMessage = '';

    const owned = (o,k) => Object.prototype.hasOwnProperty.call(o||{}, k);
    const str = value => value == null ? '' : String(value).trim();
    const keyOf = (id,field) => `${id}:${field}`;
    const validId = id => Number.isSafeInteger(Number(id)) && Number(id)>0;
    const records = () => Array.isArray(st.records) ? st.records : [];
    const columns = () => Array.isArray(st.tableColumns) ? st.tableColumns : [];
    const findRecord = id => records().find(row=>Number(row.id_ins_fl)===Number(id));
    const draftOf = (id,field) => drafts.get(keyOf(id,field));
    const visible = field => columns().includes(field) && (SYSTEM_FIELDS.has(field)||groups().some(g=>g.fields?.includes(field)));

    function editable(field, record) {
      if (!record || !validId(record.id_ins_fl) || st.page!=='equipos' || isViewingAs() || !visible(field) || SYSTEM_FIELDS.has(field)) return false;
      if (!owned(record,field)) return false;
      return groups().some(group=>canEdit(group) && group.fields?.includes(field) && group.editable_fields?.includes(field));
    }
    function differs(field,a,b) { return canonicalCompare(field,a)!==canonicalCompare(field,b); }
    function pendingCount() { return drafts.size; }
    function staleDraftsCount() {
      return records().reduce((n,row)=>n+columns().reduce((k,f)=>{
        const d=draftOf(row.id_ins_fl,f);
        return k+(d&&differs(f,d.original,row[f])?1:0);
      },0),0);
    }

    function entryControl(field, value) {
      const m=meta(field)||{};
      const kind=m.kind||'text';
      const attr=' data-iadm-ghost-input="1" data-iadm-ghost-kind="'+esc(kind)+'"'+
        ' aria-label="Nuevo valor para '+esc(label(field))+'"';
      const text=str(value);
      if (kind==='boolean') return '<select'+attr+'><option value="1"'+(Number(value)!==0?' selected':'')+'>Activo</option>'+ 
        '<option value="0"'+(Number(value)===0?' selected':'')+'>Inactivo</option></select>';
      if (kind==='user') return '<select'+attr+'>'+userOptions(value)+'</select>';
      if (kind==='date') return '<input type="date"'+attr+' min="1900-01-01" max="2100-12-31" value="'+esc(isoDate(value)||'')+'">';
      if (kind==='percent'||kind==='money') return '<input type="number"'+attr+' min="0" max="'+
        (kind==='percent'?'100':'9999999999.99')+'" step="0.01" inputmode="decimal" value="'+
        esc(previewNumber(value,kind))+'">';
      if (kind==='textarea') return '<textarea'+attr+' maxlength="'+Number(m.max_length||20000)+'" rows="3">'+esc(value??'')+'</textarea>';
      return '<input type="text"'+attr+' maxlength="'+Number(m.max_length||20000)+'" value="'+esc(value??'')+'">';
    }

    function renderedCell(record,field) {
      const id=Number(record.id_ins_fl),current=record[field],draft=draftOf(id,field);
      const conflict=Boolean(draft && differs(field,draft.original,current));
      const editing=Boolean(active && active.id===id && active.field===field);
      let inner='';
      if(editing && editable(field,record)) {
        const from=draft?draft.value:current;
        const m=meta(field)||{};
        const rawLegacy=str(from);
        const legacyDate=m.kind==='date' && rawLegacy && !isoDate(from);
        const legacyNumber=(m.kind==='money'||m.kind==='percent') && rawLegacy && previewNumber(from,m.kind)==='';
        inner='<div class="iadm-cor-ghost-editor">'+
          '<small class="iadm-cor-ghost-label">Borrador local · '+esc(label(field))+'</small>'+entryControl(field,from)+
          ((legacyDate||legacyNumber)?'<small class="iadm-cor-ghost-warning">Valor actual incompatible con el editor: '+esc(rawLegacy)+'. Selecciona un valor nuevo o cancela.</small>':'')+
          '<div class="iadm-cor-ghost-actions">'+
          '<button type="button" class="iadm-cor-ghost-action iadm-cor-ghost-apply" data-iadm-ghost-action="apply">Aplicar borrador</button>'+ 
          '<button type="button" class="iadm-cor-ghost-action" data-iadm-ghost-action="cancel">Cancelar</button></div>'+ 
          '<small data-iadm-ghost-error="1" class="iadm-cor-ghost-error" role="alert" hidden></small></div>';
      } else if(editable(field,record)) {
        const showing=draft?draft.value:current;
        inner='<button type="button" class="iadm-cor-ghost-trigger" data-iadm-ghost-action="edit"'+
          ' data-iadm-ghost-id="'+esc(id)+'" data-iadm-ghost-field="'+esc(field)+'"'+
          ' aria-label="Editar borrador de '+esc(label(field))+', equipo '+esc(id)+'"'+
          (saving?' disabled':'')+'>'+
          '<span class="iadm-cor-matrix-value">'+esc(display(field,showing))+'</span>'+ 
          '<small class="iadm-cor-ghost-affordance">Editar borrador</small></button>';
        if (draft) inner+='<div class="iadm-cor-ghost-change">'+
          '<span class="iadm-cor-ghost-original">Original: '+esc(display(field,draft.original))+'</span>'+ 
          (conflict?'<span class="iadm-cor-ghost-warning">El servidor cambio este valor. Descarta el borrador y revisa los valores antes de guardar.</span>':'')+
          '<button type="button" class="iadm-cor-ghost-revert" data-iadm-ghost-action="revert"'+
          ' data-iadm-ghost-id="'+esc(id)+'" data-iadm-ghost-field="'+esc(field)+'">Revertir borrador</button></div>';
      } else {
        inner='<span class="iadm-cor-matrix-value">'+esc(display(field,current))+'</span>';
        if (draft) inner+='<small class="iadm-cor-ghost-warning">Edicion revocada: borrador no utilizable.</small>';
      }
      return '<td data-iadm-ghost-cell="1" data-iadm-ghost-id="'+esc(id)+'" data-iadm-ghost-field="'+esc(field)+'"'+
        (draft?' data-ghost-draft="true"':'')+(conflict?' data-ghost-conflict="true"':'')+'>'+inner+'</td>';
    }

    function toolbarHtml() {
      return '<div class="iadm-cor-ghost-toolbar" role="status" aria-live="polite">'+
        '<div><strong>Edicion de equipos · Guardado manual</strong>'+
        '<span>Aplica tus borradores y confirma Guardar cambios para almacenarlos en el sistema. Cada equipo se guarda y audita de forma atomica.</span>'+
        '<span class="iadm-cor-ghost-save-message" data-iadm-ghost-save-message="1"'+
        (saveMessage?'':' hidden')+'>'+esc(saveMessage)+'</span></div>'+
        '<div class="iadm-cor-ghost-toolbar-actions"><strong data-iadm-ghost-count="1">'+pendingCount()+' borrador(es) pendiente(s)</strong>'+
        '<button type="button" class="iadm-cor-btn iadm-cor-btn-primary" data-iadm-ghost-action="save-all"'+
        (pendingCount()&&!saving?'':' disabled')+'>Guardar cambios</button>'+
        '<button type="button" class="iadm-cor-btn" data-iadm-ghost-action="discard-all"'+
        (pendingCount()&&!saving?'':' disabled')+'>Descartar borradores</button></div></div>';
    }
    function updateToolbar() {
      const counter=view()?.querySelector('[data-iadm-ghost-count]');
      if(counter)counter.textContent=pendingCount()+' borrador(es) pendiente(s)';
      const button=view()?.querySelector('[data-iadm-ghost-action="discard-all"]');
      if(button)button.disabled=!pendingCount()||saving;
      const saveButton=view()?.querySelector('[data-iadm-ghost-action="save-all"]');
      if(saveButton)saveButton.disabled=!pendingCount()||saving;
      const pageMeta=$('iadm-cor-project-meta');
      if(pageMeta&&st.selectedProject)pageMeta.textContent=
        (st.selectedProject.id_proyecto?'PP NS '+st.selectedProject.id_proyecto+' · ':'')+
        st.projectRecordsTotal+' equipo(s) autorizados · '+pendingCount()+' borrador(es) sin confirmar.';
    }
    function render() {
      const host=$('iadm-cor-equipment-list');if(!host)return;
      const title=$('iadm-cor-project-title');if(title)title.textContent=st.selectedProject?.proyecto||'Proyecto sin nombre';
      const cols=columns();
      if(!cols.length)host.innerHTML=toolbarHtml()+'<div class="iadm-cor-matrix-empty">No hay columnas autorizadas para mostrar.</div>';
      else if(!records().length)host.innerHTML=toolbarHtml()+'<div class="iadm-cor-matrix-empty">Este proyecto no contiene equipos dentro de tu alcance.</div>';
      else {
        const heads=cols.map(f=>'<th scope="col" title="'+esc(f)+'">'+esc(label(f))+'</th>').join('');
        const rows=records().map(record=>'<tr data-equipment-id="'+esc(record.id_ins_fl)+'">'+
          cols.map(field=>renderedCell(record,field)).join('')+'</tr>').join('');
        host.innerHTML=toolbarHtml()+
          '<div class="iadm-cor-matrix-scroll" role="region" tabindex="0"'+
            ' aria-label="Tabla de equipos, edicion fantasma sin guardar en base de datos">'+
          '<table class="iadm-cor-matrix"><thead><tr>'+heads+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+ 
          '<p class="iadm-cor-matrix-caption">'+cols.length+' columnas autorizadas · '+records().length+
          ' equipos en esta pagina · '+st.projectRecordsTotal+' equipos autorizados en total.'+
          (staleDraftsCount()?' Hay borradores con datos originales modificados por el servidor.':'')+'</p>';
      }
      updateToolbar();
      pager('iadm-cor-equipment-pagination',st.equipmentOffset,GHOST_PAGE_SIZE,st.projectRecordsTotal,'equipos');
      const bulk=$('iadm-cor-bulk-bar');if(bulk)bulk.hidden=true;
    }

    function redrawCell(id,field) {
      const record=findRecord(id);
      const cell=view()?.querySelector(`[data-iadm-ghost-cell="1"][data-iadm-ghost-id="${Number(id)}"][data-iadm-ghost-field="${field}"]`);
      if(!cell||!record)return;
      const fresh=document.createElement('tbody');
      fresh.innerHTML='<tr>'+renderedCell(record,field)+'</tr>';
      const replacement=fresh.querySelector('td');
      if(replacement)cell.replaceWith(replacement);
      updateToolbar();
    }

    function discardEditing() {
      if(!active)return true;
      if(active.touched && !window.confirm('La celda tiene cambios sin aplicar como borrador. Deseas descartarlos?'))return false;
      const {id,field}=active;
      active=null;
      redrawCell(id,field);
      return true;
    }
    function hasPending() {return Boolean(drafts.size || (active&&active.touched));}
    function readyToSave() {
      if(saving)return false;
      if(active&&active.touched){
        announce('Primero aplica el borrador de la celda abierta antes de guardar.','error');
        return false;
      }
      if(active){const {id,field}=active;active=null;redrawCell(id,field);}
      return drafts.size>0;
    }
    function setSaving(value){
      saving=Boolean(value);
      render();
    }
    function setSaveMessage(message){
      saveMessage=String(message||'');
      const node=view()?.querySelector('[data-iadm-ghost-save-message]');
      if(node){node.textContent=saveMessage;node.hidden=!saveMessage;}
      updateToolbar();
    }
    function ackSaved(savedDrafts){
      for(const sent of savedDrafts||[]){
        const key=keyOf(Number(sent.id_ins_fl),sent.field),existing=drafts.get(key);
        if(existing&&existing.project_key===sent.project_key &&
           !differs(sent.field,existing.original,sent.original) &&
           !differs(sent.field,existing.value,sent.value))drafts.delete(key);
      }
      updateToolbar();
    }
    function changeEquipmentPage() {
      if(!discardEditing())return false;
      return true; // Los borradores de otras paginas se conservan mientras no se salga del proyecto.
    }
    function clear() {drafts.clear();active=null;saving=false;saveMessage='';}
    function listDrafts() {
      // Solo copia defensiva del borrador en memoria para la Fase 3.
      return [...drafts.values()].map(d=>({...d}));
    }

    async function beginEdit(id,field) {
      if(saving)return;
      const record=findRecord(id);
      if(!record||!editable(field,record))return;
      if(active && active.id===Number(id) && active.field===field)return;
      if(!discardEditing())return;
      const context=currentContext(),projectKey=st.selectedProject?.project_key;
      if(meta(field)?.kind==='user' && !Array.isArray(st.users)) {
        announce('Cargando responsables autorizados...', 'loading');
        try { await loadUsers(); }
        catch(error) {if(currentContext()===context)announce(error?.message||'No se pudo consultar usuarios.', 'error');return;}
        if(currentContext()!==context || st.page!=='equipos' || st.selectedProject?.project_key!==projectKey)return;
      }
      if(!editable(field,findRecord(id)))return;
      active={id:Number(id),field,touched:false};
      redrawCell(id,field);
      const input=view()?.querySelector('[data-iadm-ghost-input]');if(input&&typeof input.focus==='function')input.focus();
    }

    function readEdited(field) {
      const input=view()?.querySelector('[data-iadm-ghost-input]');
      if(!input)return {ok:false,error:'No se encontro el editor activo.'};
      const kind=(meta(field)||{}).kind||'text',v=str(input.value);
      if(kind==='boolean')return ['0','1'].includes(v)?{ok:true,value:Number(v)}:{ok:false,error:'Selecciona Activo o Inactivo.'};
      if(kind==='user'){
        if(!v)return {ok:true,value:null};
        return /^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)>0
          ?{ok:true,value:Number(v)}:{ok:false,error:'Selecciona un usuario valido.'};
      }
      if(!v)return {ok:true,value:null};
      if(kind==='date')return isoDate(v)===v?{ok:true,value:v}:{ok:false,error:'Fecha invalida (1900-2100).'};
      if(kind==='percent'||kind==='money'){
        const max=kind==='percent'?100:9999999999.99;
        if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(v)||Number(v)>max)
          return {ok:false,error:'Numero fuera de rango o con mas de dos decimales.'};
        return {ok:true,value:kind==='percent'?v+'%':v};
      }
      if(v.length>Number(meta(field)?.max_length||20000))return {ok:false,error:'Texto demasiado largo.'};
      return {ok:true,value:v};
    }

    function applyDraft() {
      if(saving||!active||!validId(active.id))return;
      const {id,field,touched}=active;
      const record=findRecord(id);
      if(!editable(field,record)){announce('El campo ya no tiene edicion autorizada.','error');active=null;return;}
      const previous=draftOf(id,field);
      if(previous && differs(field,previous.original,record[field])){
        const error=view()?.querySelector('[data-iadm-ghost-error]');
        if(error){error.textContent='El valor original cambio en el servidor. Descarta y consulta de nuevo.';error.hidden=false;}
        return;
      }
      // Nunca crear un cambio cuando el editor contiene un valor legado que no
      // puede representarse y el usuario no toco el control.
      if(!touched){active=null;redrawCell(id,field);return;}
      const edited=readEdited(field);
      if(!edited.ok){
        const error=view()?.querySelector('[data-iadm-ghost-error]');
        if(error){error.textContent=edited.error;error.hidden=false;}
        return;
      }
      const original=previous?previous.original:record[field];
      if(differs(field,original,edited.value))drafts.set(keyOf(id,field),{
        id_ins_fl:id,field,original,value:edited.value,project_key:st.selectedProject?.project_key||null
      });
      else drafts.delete(keyOf(id,field));
      active=null;
      redrawCell(id,field);
      announce('Borrador actualizado localmente. Aun no se ha guardado.','ready');
    }
    function revertDraft(id,field) {
      if(saving)return;
      drafts.delete(keyOf(id,field));
      if(active?.id===Number(id)&&active.field===field)active=null;
      redrawCell(id,field);
    }

    function bind(rootElement) {
      if(bound)return;
      if(!rootElement)throw new Error('No existe la vista para edicion fantasma.');
      bound=true;
      rootElement.addEventListener('click', e=>{
        const button=e.target?.closest?.('[data-iadm-ghost-action]');
        if(!button||!rootElement.contains(button)||st.page!=='equipos')return;
        e.preventDefault();e.stopImmediatePropagation();
        const action=button.dataset.iadmGhostAction;
        if(action==='save-all') {
          if(readyToSave())void Promise.resolve().then(onSave).catch(err=>
            announce(err?.message||'No fue posible guardar los borradores.','error'));
          return;
        }
        if(saving)return;
        if(action==='edit') {void beginEdit(button.dataset.iadmGhostId,button.dataset.iadmGhostField);return;}
        if(action==='apply') {applyDraft();return;}
        if(action==='cancel') {if(active){const {id,field}=active;active=null;redrawCell(id,field);}return;}
        if(action==='revert') {revertDraft(button.dataset.iadmGhostId,button.dataset.iadmGhostField);return;}
        if(action==='discard-all'&&drafts.size&&window.confirm('Descartar TODOS los borradores de este proyecto? No se ha guardado nada en Aiven.')){
          clear();render();announce('Todos los borradores locales fueron descartados.','ready');
        }
      },true);
      for(const type of ['input','change'])rootElement.addEventListener(type,e=>{
        if(st.page==='equipos'&&active&&e.target?.matches?.('[data-iadm-ghost-input]'))active.touched=true;
      },true);
      rootElement.addEventListener('keydown',e=>{
        if(st.page!=='equipos'||!active||!e.target?.matches?.('[data-iadm-ghost-input]'))return;
        if(e.key==='Escape'){
          e.preventDefault();const {id,field}=active;active=null;redrawCell(id,field);
        }else if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
          e.preventDefault();applyDraft();
        }
      },true);
    }
    return Object.freeze({bind,render,clear,hasPending,changeEquipmentPage,listDrafts,pendingCount,
      readyToSave,setSaving,setSaveMessage,ackSaved});
  }
  return {create};
});
