/* [Mantto Gestor | 2026-10-13 | FASE_3_INSTALACIONES_ADMIN_V2_SELECCION_MULTIPLE_V001]
 * Vista secundaria de Instalaciones > Administracion: autoguardado individual
 * (Fase 2) y edicion multiple de una columna con confirmacion, 2-20 equipos.
 * La seleccion es local a este editor y no se persiste; no hay borradores.
 * Backend Fase 1 valida permiso, puerta CORELLIAN, scope, expected y auditoria.
 * La identidad de cada equipo se conserva internamente, nunca se presenta como columna.
 * No guarda nada en storage local ni modifica Main u otros modulos.
 */
(function (root, factory) {
  'use strict';
  const exported = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (root) root.ManttoInstalacionesGhost_cor = exported;
})(typeof window === 'object' ? window : null, function () {
  'use strict';

  const ROOT = '/api/instalaciones/administracion';
  const PAGE_SIZE = 30;
  const MAX_MULTI = 20;
  const HIDDEN_FIELDS = Object.freeze([
    'id_ins_fl', 'id_proyecto', 'id_sup', 'id_asesor', 'id_admin',
    'activo', 'created_at', 'updated_at'
  ]);
  const DERIVED_FIELDS = Object.freeze([
    'estatus_completo', 'dias_sin_visita', 'dias_sin_ccnr', 'dias_restantes'
  ]);
  const HIDDEN = new Set(HIDDEN_FIELDS);
  const READONLY = new Set([...HIDDEN_FIELDS, ...DERIVED_FIELDS, 'rel_admin']);
  const LIST_FIELDS = new Set(['estatus', 'vendedor', 'supervisor_fl']);
  const STATUS_CODES = Object.freeze([
    '01-SUS', '02-OC', '03-PM', '04-M', '05-PA', '06-A', '07-PE', '08-T'
  ]);
  const STATUS_SET = new Set(STATUS_CODES);
  const STANDARD_LABELS = Object.freeze({
    estatus_completo:'Estatus completo', dias_sin_visita:'Dias sin visita',
    dias_sin_ccnr:'Dias sin CCNR', dias_restantes:'Dias restantes',
    rel_admin:'Administrativos relacionados', vendedor:'Vendedor',
    supervisor_fl:'Supervisor'
  });

  const owned = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const stringValue = value => value == null ? '' : String(value).trim();
  const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0;
  function error_cor(message, code, meta = {}) {
    const error = new Error(message);
    error.code = code;
    return Object.assign(error, meta);
  }
  function visibleColumns_cor(columns, groups) {
    const permitted = new Set((groups || [])
      .filter(group => group?.permissions?.can_view === true)
      .flatMap(group => group.fields || []));
    const relAdmin = (groups || []).some(g => g.key === 'responsables' && g.permissions?.can_view === true) &&
      (groups || []).some(g => g.key === 'cliente_contrato' && g.permissions?.can_view === true);
    return [...new Set((columns || []).filter(field =>
      typeof field === 'string' && !HIDDEN.has(field) &&
      (permitted.has(field) || (field === 'rel_admin' && relAdmin))
    ))];
  }
  function editable_cor(field, record, groups, isViewer) {
    if (!record || !validId(record.id_ins_fl) || !owned(record, field) ||
        READONLY.has(field) || isViewer) return false;
    return (groups || []).some(group =>
      group?.permissions?.can_view === true && group.permissions?.can_edit === true &&
      group.fields?.includes(field) && group.editable_fields?.includes(field));
  }
  function validCivilDate_cor(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return false;
    const y = +m[1], month = +m[2], day = +m[3];
    if (y < 1900 || y > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const d = new Date(Date.UTC(y, month - 1, day));
    return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
  }
  function uniqueInitials_cor(users) {
    const counts = new Map();
    for (const row of users || []) {
      if (!validId(row?.id_SB) || !stringValue(row?.iniciales)) continue;
      const initials = stringValue(row.iniciales);
      counts.set(initials, (counts.get(initials) || 0) + 1);
    }
    return (users || []).filter(row => validId(row?.id_SB) &&
      stringValue(row?.iniciales) && counts.get(stringValue(row.iniciales)) === 1);
  }
  function validValue_cor(field, raw, fieldMeta = {}, catalog = null) {
    const v = String(raw == null ? '' : raw).trim();
    const kind = fieldMeta.kind || 'text';
    if (READONLY.has(field)) return {ok:false,error:'Este campo se actualiza automaticamente.'};
    if (LIST_FIELDS.has(field)) {
      if (field === 'estatus') {
        return STATUS_SET.has(v) && (catalog?.estatus || []).some(item => item.codigo === v)
          ? {ok:true,value:v} : {ok:false,error:'Selecciona un estatus valido.'};
      }
      if (!v) return {ok:true,value:null};
      const options = field === 'vendedor' ? catalog?.vendedores : catalog?.supervisores;
      return uniqueInitials_cor(options).some(item => item.iniciales === v)
        ? {ok:true,value:v} : {ok:false,error:'Selecciona iniciales unicas de un usuario activo.'};
    }
    if (!v) return {ok:true,value:null};
    if (kind === 'date') return validCivilDate_cor(v) ? {ok:true,value:v} :
      {ok:false,error:'Fecha invalida. Usa el calendario.'};
    if (kind === 'percent' || kind === 'money') {
      const max = kind === 'percent' ? 100 : 9999999999.99;
      if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(v) || Number(v) > max) {
        return {ok:false,error:'Valor numerico fuera de rango o con mas de dos decimales.'};
      }
      return {ok:true,value:kind === 'percent' ? `${v}%` : v};
    }
    const maxLength = Number(fieldMeta.max_length) || 20000;
    if (v.length > maxLength) return {ok:false,error:'Texto mayor que el maximo permitido.'};
    return {ok:true,value:v};
  }
  function payload_cor(field, original, value) {
    if (typeof field !== 'string' || READONLY.has(field)) throw error_cor(
      'El campo no es editable.','ADMIN_V2_READONLY_FIELD');
    if (value !== null && !['string','number','boolean'].includes(typeof value)) throw error_cor(
      'Valor de campo invalido.','ADMIN_V2_INVALID_VALUE');
    return {changes:{[field]:value},expected:{[field]:original}};
  }
  // No reintentar automaticamente un PATCH si falla la respuesta o la relectura:
  // pudo haberse confirmado en MySQL y generado auditoria.
  async function persistVerified_cor(api, {projectKey,id,field,original,value,canonicalCompare}) {
    if (typeof api !== 'function' || !validId(id) ||
        !/^P:.{1,100}$|^R:[1-9]\d{0,14}$/.test(String(projectKey || '')) ||
        typeof canonicalCompare !== 'function') throw error_cor(
      'No se puede verificar el contexto de edicion.','ADMIN_V2_INVALID_CONTEXT');
    const path = ROOT + '/proyectos/' + encodeURIComponent(projectKey) +
      '/equipos/' + encodeURIComponent(id) + '/edicion-directa';
    let response;
    try {
      response = await api(path, {
        method:'PATCH',body:JSON.stringify(payload_cor(field,original,value))
      });
    } catch (error) {
      // Un timeout/5xx no demuestra que MySQL haya revertido: no reintentar.
      const rejected = [400,401,403,404,409,422].includes(Number(error?.status));
      error.uncertain = !rejected;
      throw error;
    }
    if (response?.ok !== true) throw error_cor(
      'El servidor no confirmo la operacion.','ADMIN_V2_PATCH_NOT_CONFIRMED',{uncertain:true});
    let read;
    try {
      read = await api(ROOT + '/registros/' + encodeURIComponent(id));
    } catch (error) {
      error.committed = true;
      throw error;
    }
    if (!read?.data || Number(read.data.id_ins_fl) !== Number(id) ||
        !owned(read.data,field) ||
        canonicalCompare(field, read.data[field]) !== canonicalCompare(field,value)) {
      throw error_cor('El PATCH fue aceptado pero la relectura no coincide. Actualiza antes de editar.',
        'ADMIN_V2_RECHECK_MISMATCH',{committed:true});
    }
    return read.data;
  }

  // Fase 1 acepta EXACTAMENTE una columna, de 2 a 20 IDs, y un expected
  // original por ID. Nunca se intenta modificar IDs, calculados o FK manualmente.
  function buildMultiPayload_cor(projectKey,selectedRows,field,value) {
    if (!/^P:.{1,100}$/.test(String(projectKey || '')) ||
        !Array.isArray(selectedRows) || selectedRows.length < 2 ||
        selectedRows.length > MAX_MULTI || typeof field !== 'string' || READONLY.has(field) ||
        value !== null && !['string','number','boolean'].includes(typeof value)) {
      throw error_cor('Seleccion multiple o campo invalido.','ADMIN_V3_INVALID_BATCH');
    }
    const projectId = projectKey.slice(2);
    const ids = [], expected = {};
    for (const row of selectedRows) {
      const id = Number(row?.id_ins_fl);
      const before = row?.[field];
      if (!validId(id) || !owned(row,field) ||
          before !== null && !['string','number','boolean'].includes(typeof before) ||
          owned(row,'id_proyecto') && String(row.id_proyecto ?? '') !== projectId ||
          Object.prototype.hasOwnProperty.call(expected,String(id))) {
        throw error_cor('Un equipo no pertenece al proyecto o carece de valor original.',
          'ADMIN_V3_INVALID_BATCH_ROW');
      }
      ids.push(id);
      expected[String(id)] = {[field]:before};
    }
    ids.sort((a,b)=>a-b);
    return {ids,changes:{[field]:value},expected};
  }
  // Escribir UNA transaccion en backend y releer cada equipo por su GET con
  // Guard. Nunca reintentar automaticamente: un timeout puede haber confirmado
  // todos los cambios y las interacciones atomicas.
  async function persistVerifiedMulti_cor(api,{projectKey,selectedRows,field,value,canonicalCompare}) {
    if (typeof api !== 'function' || typeof canonicalCompare !== 'function') {
      throw error_cor('No es posible verificar la edicion multiple.','ADMIN_V3_INVALID_CONTEXT');
    }
    const payload = buildMultiPayload_cor(projectKey,selectedRows,field,value);
    let response;
    try {
      response = await api(ROOT + '/proyectos/' + encodeURIComponent(projectKey) +
        '/equipos/edicion-multiple-directa',{
          method:'PATCH',body:JSON.stringify(payload)
        });
    } catch(error) {
      // 400/403/404/409/422 indican rechazo. Red/5xx son inciertos.
      const rejected = [400,401,403,404,409,422].includes(Number(error?.status));
      if (error && typeof error === 'object') error.uncertain = !rejected;
      throw error;
    }
    const recordIds = Array.isArray(response?.records) ? response.records.map(row => Number(row?.id_ins_fl)) : [];
    if (response?.ok !== true || Number(response.selected) !== payload.ids.length ||
        recordIds.length !== payload.ids.length ||
        payload.ids.some(id => !recordIds.includes(id)) ||
        new Set(recordIds).size !== recordIds.length) {
      throw error_cor('Respuesta del lote sin confirmacion completa. No se reintentara.',
        'ADMIN_V3_PATCH_NOT_CONFIRMED',{uncertain:true});
    }
    const verified = new Map();
    for (let start = 0; start < payload.ids.length; start += 4) {
      const part = payload.ids.slice(start,start+4);
      let reads;
      try {
        reads = await Promise.all(part.map(id => api(ROOT+'/registros/'+encodeURIComponent(id))));
      } catch(error) {
        if (error && typeof error === 'object') error.committed = true;
        throw error;
      }
      for (let i=0;i<part.length;i++) {
        const id = part[i], row=reads[i]?.data;
        if (!row || Number(row.id_ins_fl)!==id || !owned(row,field) ||
            owned(row,'id_proyecto') && String(row.id_proyecto ?? '')!==projectKey.slice(2) ||
            canonicalCompare(field,row[field]) !== canonicalCompare(field,value)) {
          throw error_cor('El lote se acepto pero la relectura no coincide. Actualiza la tabla.',
            'ADMIN_V3_RECHECK_MISMATCH',{committed:true});
        }
        verified.set(id,row);
      }
    }
    return {verified,updated:Number(response.updated) || 0,selected:payload.ids.length};
  }

  function create(opts) {
    if (!opts || typeof opts !== 'object') throw new Error('Faltan adaptadores del editor.');
    const {st,$,view,groups,canEdit,esc,label,meta,display,isoDate,previewNumber,
      canonicalCompare,pager,isViewingAs,currentContext,announce} = opts;
    for (const key of ['$', 'view', 'groups', 'canEdit', 'esc', 'label', 'meta', 'display',
      'isoDate', 'previewNumber', 'canonicalCompare', 'pager', 'isViewingAs',
      'currentContext', 'announce']) {
      if (typeof opts[key] !== 'function') throw new Error('Adaptador de tabla incompleto: ' + key);
    }
    let bound = false;
    let active = null;
    let saving = false;
    let epoch = 0;
    let catalogs = null;
    let catalogPromise = null;
    let message = 'Edita una celda. Texto: Enter o salir. Listas y fechas: al seleccionar.';
    let messageKind = 'ready';
    let verificationRequired = false;
    const selected = new Map(); // ID -> snapshot original; puede abarcar varias paginas del MISMO proyecto.
    const bulkMode = () => selected.size >= 2;
    const selectedRows = () => [...selected.values()];
    const records = () => Array.isArray(st.records) ? st.records : [];
    const findRecord = id => records().find(row => Number(row.id_ins_fl) === Number(id));
    const columns = () => visibleColumns_cor(st.tableColumns, groups());
    const ctx = () => currentContext() + '|' + String(st.selectedProject?.project_key || '');
    const validCurrent = (reference,serial) =>
      epoch === serial && ctx() === reference && st.page === 'equipos' &&
      Boolean(window.ManttoAuth?.getToken?.()) &&
      (!window.ManttoRouter?.getCurrent ||
        window.ManttoRouter.getCurrent()?.route === 'instalaciones-administracion');
    const api = (path,options) => {
      if (!window.ManttoAuth?.api || !window.ManttoAuth?.getToken?.())
        throw error_cor('Sesion autenticada no disponible.','ADMIN_V2_NO_SESSION');
      return window.ManttoAuth.api(path, Object.assign({method:'GET',cache:'no-store'},options || {}));
    };
    const title = field => STANDARD_LABELS[field] || label(field);
    // loadTeams_cor() renderiza antes de quitar busy: no bloquear botones en el HTML.
    // beginEdit() y commitActive() validan busy nuevamente al actuar.
    const canEditCell = (field,row) =>
      st.page === 'equipos' &&
      editable_cor(field,row,groups(),isViewingAs()) && Boolean(groups().some(g => canEdit(g))) &&
      (!bulkMode() || selected.has(Number(row.id_ins_fl)));
    const canSelectRow = row => st.page === 'equipos' &&
      /^P:.{1,100}$/.test(String(st.selectedProject?.project_key || '')) &&
      validId(row?.id_ins_fl) && !isViewingAs() &&
      groups().some(group => canEdit(group) && group.permissions?.can_view &&
        (group.editable_fields || []).some(field => columns().includes(field) && owned(row,field))) &&
      (!owned(row,'id_proyecto') ||
        String(row.id_proyecto ?? '') === String(st.selectedProject.project_key).slice(2));

    function setMessage(text,kind='ready') {
      message = String(text || '');
      messageKind = kind;
      const info = view()?.querySelector('[data-iadm-v2-message]');
      if (info) {info.textContent = message;info.dataset.state = kind;}
      announce(message, kind);
    }
    async function loadCatalogs() {
      if (catalogs) return catalogs;
      if (catalogPromise) return catalogPromise;
      const current = ctx(), serial = epoch;
      const request = api(ROOT + '/catalogos-edicion');
      catalogPromise = Promise.resolve(request).then(data => {
        if (!validCurrent(current,serial)) throw error_cor(
          'Cambio de sesion o proyecto.','ADMIN_V2_CONTEXT_CHANGED');
        if (!Array.isArray(data?.estatus) || !Array.isArray(data?.vendedores) ||
            !Array.isArray(data?.supervisores)) throw error_cor(
          'Catalogo de edicion no disponible.','ADMIN_V2_CATALOG_INVALID');
        catalogs = data;
        return data;
      }).finally(() => {catalogPromise = null;});
      return catalogPromise;
    }
    function optionsFor(field,value) {
      if (!catalogs) return '';
      const chosen = stringValue(value);
      if (field === 'estatus') {
        const options = catalogs.estatus.filter(item => STATUS_SET.has(item?.codigo));
        return '<option value="">Selecciona estatus</option>' + options.map(item =>
          '<option value="'+esc(item.codigo)+'"'+(chosen===item.codigo?' selected':'')+'>'+ 
            esc(item.codigo)+' · '+esc(item.nombre || item.codigo)+'</option>').join('');
      }
      const options = uniqueInitials_cor(field === 'vendedor' ? catalogs.vendedores : catalogs.supervisores);
      return '<option value="">Sin asignar</option>' + options.map(item =>
        '<option value="'+esc(item.iniciales)+'"'+(chosen===item.iniciales?' selected':'')+'>'+ 
          esc(item.iniciales)+'</option>').join('');
    }
    function editorHtml(field,value,entry=null) {
      const m = meta(field) || {};
      const kind = m.kind || 'text';
      const attribute = ' data-iadm-v2-control="1" aria-label="Editar '+esc(title(field))+'"';
      let control;
      if (LIST_FIELDS.has(field)) control = '<select'+attribute+'>'+optionsFor(field,value)+'</select>';
      else if (kind === 'date') control = '<input'+attribute+' type="date" min="1900-01-01" max="2100-12-31" value="'+
        esc(isoDate(value) || '')+'">';
      else if (kind === 'percent' || kind === 'money') control = '<input'+attribute+' type="number" inputmode="decimal" min="0" max="'+
        (kind === 'percent' ? '100' : '9999999999.99')+'" step="0.01" value="'+
        esc(previewNumber(value,kind))+'">';
      else if (kind === 'textarea') control = '<textarea'+attribute+' maxlength="'+
        Number(m.max_length || 20000)+'" rows="3">'+esc(value ?? '')+'</textarea>';
      else control = '<input'+attribute+' type="text" maxlength="'+
        Number(m.max_length || 20000)+'" value="'+esc(value ?? '')+'">';
      const raw = stringValue(value);
      const invalidLegacy = raw && (kind==='date' && !isoDate(value) ||
        ['percent','money'].includes(kind) && previewNumber(value,kind)==='');
      return '<div class="iadm-cor-ghost-editor iadm-cor-v2-editor">'+
        (entry?.batchSize>=2?'<strong class="iadm-cor-v3-bulk-edit-title">Editar '+entry.batchSize+' equipos</strong>':'')+
        '<small class="iadm-cor-ghost-label">'+esc(title(field))+'</small>'+control+
        (entry?.mixed?'<small class="iadm-cor-v3-mixed">Los equipos tienen valores distintos. Escribe el nuevo valor comun.</small>':'')+
        (invalidLegacy?'<small class="iadm-cor-ghost-warning">Dato historico: '+esc(raw)+
          '. Selecciona un valor nuevo o presiona Escape para cancelar.</small>':'')+
        '<small class="iadm-cor-v2-help">'+(entry?.batchSize>=2?
          'Al terminar se pedira confirmacion antes de guardar el lote.':
          kind==='textarea'?'Salir del campo para guardar.':'Enter o salir para guardar · Escape cancela.')+'</small>'+
        '<small class="iadm-cor-ghost-error" data-iadm-v2-error="1" role="alert" hidden></small>'+ 
        '</div>';
    }
    function cellHtml(row,field) {
      const id = Number(row.id_ins_fl);
      const editing = Boolean(active && active.id === id && active.field === field);
      const writable = canEditCell(field,row) || (editing && !isViewingAs());
      const readOnly = READONLY.has(field);
      let content;
      if (editing) content = editorHtml(field,active.editValue,active);
      else if (writable) content = '<button type="button" class="iadm-cor-ghost-trigger" '+
          'data-iadm-ghost-action="edit" data-iadm-ghost-id="'+esc(id)+'" '+
          'data-iadm-ghost-field="'+esc(field)+'" aria-label="Editar '+esc(title(field))+'">'+
          '<span class="iadm-cor-matrix-value">'+esc(display(field,row[field]))+'</span>'+ 
          '<small class="iadm-cor-ghost-affordance">Editar</small></button>';
      else content = '<span class="iadm-cor-matrix-value">'+esc(display(field,row[field]))+'</span>'+
          (readOnly?'<small class="iadm-cor-v2-readonly">Automatico · solo lectura</small>':'');
      return '<td data-iadm-ghost-cell="1" data-iadm-ghost-id="'+esc(id)+'" '+
        'data-iadm-ghost-field="'+esc(field)+'"'+(editing?' data-v2-editing="1"':'')+
        (editing && active?.batchSize>=2?' data-iadm-v3-bulk-edit="1"':'')+'>'+content+'</td>';
    }
    function toolbarHtml() {
      const total = Number(st.projectRecordsTotal || records().length);
      const selectedCount = selected.size;
      return '<div class="iadm-cor-ghost-toolbar iadm-cor-v2-toolbar iadm-cor-v3-toolbar" role="region" aria-label="Herramientas de edicion">'+
        '<div><strong>Edicion directa · Autoguardado</strong>'+ 
          '<span>'+(bulkMode()?'Edicion multiple: selecciona una celda de una fila marcada. Se confirmara el cambio a todos.':
            'Selecciona de 2 a '+MAX_MULTI+' equipos para editar una columna en todos.')+'</span>'+
          '<span data-iadm-v2-message="1" data-state="'+esc(messageKind)+'" role="status" aria-live="polite">'+esc(message)+'</span></div>'+
        '<div class="iadm-cor-ghost-toolbar-actions">'+
          '<span class="iadm-cor-v3-selected-count" data-iadm-v3-count="1" aria-live="polite">'+
          selectedCount+' de '+total+' equipos seleccionados</span>'+
          '<button type="button" class="iadm-cor-btn iadm-cor-v3-clear" data-iadm-v3-clear="1"'+
          (saving || st.saving?' disabled aria-disabled="true"':'')+
          '>Deseleccionar todo</button></div></div>';
    }
    function render() {
      if (st.page !== 'equipos') return;
      const host = $('iadm-cor-equipment-list');
      if (!host) return;
      const oldScroll = host.querySelector('.iadm-cor-matrix-scroll');
      const left = oldScroll?.scrollLeft || 0, top = oldScroll?.scrollTop || 0;
      const titleNode = $('iadm-cor-project-title');
      if (titleNode) titleNode.textContent = st.selectedProject?.proyecto || 'Proyecto sin nombre';
      const cols = columns();
      if (!cols.length) host.innerHTML = toolbarHtml() + '<div class="iadm-cor-matrix-empty">No hay columnas autorizadas para mostrar.</div>';
      else if (!records().length) host.innerHTML = toolbarHtml() + '<div class="iadm-cor-matrix-empty">Sin equipos visibles para este proyecto.</div>';
      else {
        const headers = cols.map(f => '<th scope="col" title="'+esc(f)+'">'+esc(title(f))+'</th>').join('');
        const rows = records().map((row,index) => {
          const id=Number(row.id_ins_fl),checked=selected.has(id),available=canSelectRow(row);
          const name=row.referencia_sitio || row.numero_equipo_fabrica || 'fila '+(index+1);
          return '<tr data-equipment-id="'+esc(id)+'"'+(checked?' data-iadm-v3-selected="1"':'')+'>'+
            '<td class="iadm-cor-v3-select-cell" data-iadm-v3-select-column="1"><input type="checkbox" '+
            'data-iadm-v3-select="1" data-iadm-v3-select-id="'+esc(id)+'" '+
            'aria-label="Seleccionar equipo '+esc(name)+'"'+(checked?' checked':'')+
            (!available || !checked && selected.size>=MAX_MULTI || saving || st.saving || verificationRequired?' disabled':'')+'/></td>'+
            cols.map(field => cellHtml(row,field)).join('')+'</tr>';
        }).join('');
        host.innerHTML = toolbarHtml() +
          '<div class="iadm-cor-matrix-scroll" role="region" tabindex="0" '+
            'aria-label="Tabla de equipos con edicion individual y multiple">'+
            '<table class="iadm-cor-matrix"><thead><tr><th scope="col" class="iadm-cor-v3-select-cell" data-iadm-v3-select-column="1">Seleccionar</th>'+headers+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
          '<p class="iadm-cor-matrix-caption">'+cols.length+' columnas visibles · '+records().length+
            ' equipos en esta pagina · '+Number(st.projectRecordsTotal || 0)+' equipos autorizados en total.</p>';
      }
      const scroller = host.querySelector('.iadm-cor-matrix-scroll');
      if (scroller) {scroller.scrollLeft = left;scroller.scrollTop = top;}
      pager('iadm-cor-equipment-pagination',st.equipmentOffset,PAGE_SIZE,st.projectRecordsTotal,'equipos');
      const bulk = $('iadm-cor-bulk-bar');if (bulk) bulk.hidden = true;
    }
    function redrawCell(id,field) {
      const old = view()?.querySelector('[data-iadm-ghost-cell="1"][data-iadm-ghost-id="'+
        Number(id)+'"][data-iadm-ghost-field="'+field+'"]');
      const row = findRecord(id);
      if (!old || !row) return;
      const holder = document.createElement('tbody');
      holder.innerHTML = '<tr>'+cellHtml(row,field)+'</tr>';
      const newer = holder.querySelector('td');
      if (newer) old.replaceWith(newer);
    }
    function showError(text) {
      const error = view()?.querySelector('[data-iadm-v2-error]');
      if (error) {error.textContent = text;error.hidden = false;}
      setMessage(text,'error');
    }
    function clear() {
      epoch++;
      active = null;
      saving = false;
      st.saving = false;
      catalogs = null;
      catalogPromise = null;
      verificationRequired = false;
      selected.clear();
      message = 'Edita una celda. Texto: Enter o salir. Listas y fechas: al seleccionar.';
      messageKind = 'ready';
    }
    function hasPending() {return saving || Boolean(active?.touched);}
    function changeEquipmentPage() {
      if (saving) {setMessage('Espera a que termine el guardado.','loading');return false;}
      if (active?.touched && !window.confirm('Hay una celda sin guardar. Deseas salir sin guardar?'))return false;
      if (active) active = null;
      return true;
    }
    async function beginEdit(id,field) {
      if (saving || st.saving || st.loading || verificationRequired) return;
      const row = findRecord(id);
      if (!canEditCell(field,row) || !columns().includes(field)) return;
      if (active && active.id === Number(id) && active.field === field) return;
      if (active) {
        // No permitir descartar silenciosamente un cambio al abrir otra celda.
        if (active.touched) return;
        const previous = active;
        active = null;
        redrawCell(previous.id,previous.field);
      }
      const context = ctx(), serial = epoch;
      if (LIST_FIELDS.has(field)) {
        try {await loadCatalogs();} catch (error) {
          if (validCurrent(context,serial)) setMessage(error?.message || 'No se pudo leer el catalogo.','error');
          return;
        }
        if (!validCurrent(context,serial)) return;
      }
      if (!canEditCell(field,findRecord(id))) return;
      const batchSize = bulkMode() && selected.has(Number(id)) ? selected.size : 0;
      const originalValues = batchSize ? selectedRows().map(r => r[field]) : [];
      const mixed = batchSize > 0 && originalValues.some(value =>
        canonicalCompare(field,value) !== canonicalCompare(field,originalValues[0]));
      active = {id:Number(id),field,touched:false,blocked:false,batchSize,mixed,
        editValue:mixed?null:row[field]};
      redrawCell(id,field);
      const input = view()?.querySelector('[data-iadm-ghost-cell="1"][data-iadm-ghost-id="'+
        Number(id)+'"][data-iadm-ghost-field="'+field+'"] [data-iadm-v2-control]');
      input?.focus?.();
    }
    function clearSelection() {
      if (saving || st.saving) {
        setMessage('Espera a que termine el guardado en curso.','loading');
        return false;
      }
      if (active) active = null; // Cancelar una celda aun sin confirmar; NUNCA enviar PATCH.
      selected.clear();
      setMessage(verificationRequired?
        'Seleccion eliminada. Esta accion no altera datos; pulsa Actualizar para verificar el ultimo intento.':
        'Seleccion eliminada. Esta accion no modifica datos.','ready');
      render();
      return true;
    }
    function toggleSelection(id,checked) {
      const row = findRecord(id);
      if (saving || st.saving || verificationRequired || active?.touched) {
        setMessage(active?.touched?'Finaliza o cancela la edicion antes de cambiar la seleccion.':
          'Espera a que termine el guardado o actualiza los datos.','error');
        return false;
      }
      if (!canSelectRow(row)) return false;
      if (checked) {
        if (selected.has(Number(id))) return true;
        if (selected.size>=MAX_MULTI) {
          setMessage('La edicion multiple admite maximo '+MAX_MULTI+' equipos.','error');
          return false;
        }
        selected.set(Number(id),{...row}); // original para expected incluso entre paginas
      } else selected.delete(Number(id));
      active = null;
      setMessage(selected.size+' de '+Number(st.projectRecordsTotal||records().length)+
        ' equipos seleccionados. '+(bulkMode()?'Edita una celda marcada para aplicar el cambio a todos.':
          'Selecciona otro equipo para activar la edicion multiple.'),'ready');
      render();
      return true;
    }
    async function commitBulk_cor(entry,parsed,input) {
      if (!bulkMode() || !selected.has(entry.id) || selected.size !== entry.batchSize) {
        showError('La seleccion ha cambiado. Cancela la celda y vuelve a editar.');
        entry.blocked=true;return false;
      }
      const projectKey=String(st.selectedProject?.project_key || '');
      const snapshots=selectedRows();
      let payload;
      try {payload=buildMultiPayload_cor(projectKey,snapshots,entry.field,parsed.value);}
      catch(error) {entry.blocked=true;showError(error.message);return false;}
      if (snapshots.every(row=>canonicalCompare(entry.field,row[entry.field]) ===
                                    canonicalCompare(entry.field,parsed.value))) {
        active=null;redrawCell(entry.id,entry.field);
        setMessage('Todos los equipos ya tienen ese valor. No hay cambios.','ready');
        return true;
      }
      const readable = parsed.value == null ? '(vacio)' : String(parsed.value);
      const preview=readable.length>140?readable.slice(0,137)+'...':readable;
      // Unica confirmacion ANTES de tocar el backend. Rechazar no escribe nada.
      if (!window.confirm('Confirmar cambio multiple\n\nCampo: '+title(entry.field)+
          '\nNuevo valor: '+preview+'\nEquipos: '+payload.ids.length+
          '\n\nLa operacion es atomica (todos o ninguno) y quedara auditada.')) {
        active=null;redrawCell(entry.id,entry.field);
        setMessage('Cambio multiple cancelado. Ningun equipo modificado.','ready');
        return false;
      }
      const current=ctx(),serial=epoch;
      if (!validCurrent(current,serial)) {entry.blocked=true;showError('Sesion cambiada. Actualiza.');return false;}
      saving=true;st.saving=true;input.disabled=true;
      const clearButton=view()?.querySelector('[data-iadm-v3-clear]');
      if(clearButton){clearButton.disabled=true;clearButton.setAttribute('aria-disabled','true');}
      setMessage('Guardando '+payload.ids.length+' equipos y comprobando cada cambio...','loading');
      let patchVerified=false;
      try {
        const result=await persistVerifiedMulti_cor(api,{projectKey,selectedRows:snapshots,
          field:entry.field,value:parsed.value,canonicalCompare});
        patchVerified=true;
        if (!validCurrent(current,serial)) return false;
        // Cada equipo se verifico por GET autorizado antes de refrescar la pagina.
        for (const [id,fresh] of result.verified) {
          const old=selected.get(id);
          if(old)selected.set(id,{...old,...fresh});
        }
        st.listStale=true;
        let list;
        try {
          const q=new URLSearchParams({limit:String(PAGE_SIZE),offset:String(st.equipmentOffset)});
          list=await api(ROOT+'/proyectos/'+encodeURIComponent(projectKey)+'/equipos/tabla?'+q);
        } catch(error) {
          if ([401,403,404].includes(Number(error?.status))) throw error;
          st.records=records().map(row=>({...row,...(result.verified.get(Number(row.id_ins_fl))||{})}));
          active=null;
          setMessage('Lote guardado y verificado ('+result.selected+'). No se pudo recargar la pagina: pulsa Actualizar.','error');
          render();return true;
        }
        if (!validCurrent(current,serial)) return false;
        if (!Array.isArray(list?.data) || !Array.isArray(list?.columns)) {
          throw error_cor('La respuesta de la tabla es invalida.',
            'ADMIN_V3_BAD_TABLE',{committed:true});
        }
        st.records=list.data;st.tableColumns=list.columns;
        st.projectRecordsTotal=Number(list.total)||0;
        active=null;
        setMessage('Cambio confirmado: '+result.selected+' equipos verificados; '+
          result.updated+' modificados. Auditoria backend.','ready');
        render();return true;
      } catch(error) {
        if (!validCurrent(current,serial)) return false;
        entry.blocked=true;
        // En fallo de relectura/scope, el PATCH pudo confirmar: impedir reenvio.
        verificationRequired=true;
        if ([401,403,404].includes(Number(error?.status))) {
          active=null;selected.clear();st.records=[];st.tableColumns=[];
          setMessage('Acceso o alcance cambiado. No se repetira el lote: actualiza para verificar.','error');
          render();
        } else showError((error?.committed || error?.uncertain || patchVerified?
          'Operacion enviada: resultado sin verificacion total. NO reintentar. ':
          'Lote rechazado o sin confirmar. Ningun reintento automatico. ')+
          String(error?.message || 'Actualiza antes de editar nuevamente.'));
        return false;
      } finally {
        if(epoch===serial){
          saving=false;st.saving=false;
          const btn=view()?.querySelector('[data-iadm-v3-clear]');
          if(btn){btn.disabled=false;btn.removeAttribute('aria-disabled');}
          const control=view()?.querySelector('[data-iadm-v2-control]');
          if(control)control.disabled=false;
          // Render previo ocurrio con saving=true: liberar checkboxes para
          // permitir seleccionar/deseleccionar inmediatamente tras confirmar.
          if(!active && validCurrent(current,serial))render();
        }
      }
    }

    async function commitActive() {
      if (!active || saving || active.blocked || verificationRequired) return false;
      const entry = active, row = findRecord(entry.id);
      if (!row || !canEditCell(entry.field,row) || !columns().includes(entry.field)) {
        showError('Permiso de edicion revocado o registro no disponible. Actualiza la tabla.');
        entry.blocked = true;return false;
      }
      const input = view()?.querySelector('[data-iadm-ghost-cell="1"][data-iadm-ghost-id="'+
        entry.id+'"][data-iadm-ghost-field="'+entry.field+'"] [data-iadm-v2-control]');
      if (!input) return false;
      if (!entry.touched) {active=null;redrawCell(entry.id,entry.field);return true;}
      const parsed = validValue_cor(entry.field,input.value,meta(entry.field),catalogs);
      if (!parsed.ok) {showError(parsed.error);return false;}
      if (entry.batchSize >= 2) return commitBulk_cor(entry,parsed,input);
      if (canonicalCompare(entry.field,row[entry.field]) === canonicalCompare(entry.field,parsed.value)) {
        active=null;redrawCell(entry.id,entry.field);return true;
      }
      const current = ctx(), serial = epoch, projectKey = st.selectedProject?.project_key;
      if (!validCurrent(current,serial) || !projectKey) {
        showError('El proyecto o la sesion cambio. Actualiza la tabla.');entry.blocked=true;return false;
      }
      saving = true;
      st.saving = true;
      input.disabled = true;
      setMessage('Guardando cambio y verificando con el servidor...','loading');
      let patchAccepted = false;
      try {
        const fresh = await persistVerified_cor(api,{
          projectKey,id:entry.id,field:entry.field,
          original:row[entry.field],value:parsed.value,canonicalCompare
        });
        patchAccepted = true;
        if (!validCurrent(current,serial)) return false;
        if (selected.has(entry.id)) selected.set(entry.id,{...selected.get(entry.id),...fresh});
        // GET de la pagina completa aporta los 4 calculados y rel_admin actualizado.
        let list = null;
        try {
          const q = new URLSearchParams({limit:String(PAGE_SIZE),offset:String(st.equipmentOffset)});
          list = await api(ROOT + '/proyectos/' + encodeURIComponent(projectKey) +
            '/equipos/tabla?' + q.toString());
        } catch (error) {
          if ([401,403,404].includes(Number(error?.status))) throw error;
          // Guardado VERIFICADO. Conservamos after-read y marcamos pagina obsoleta.
          st.records = records().map(r => Number(r.id_ins_fl) === entry.id ? {...r,...fresh} : r);
          st.listStale = true;
          active = null;
          setMessage('Guardado confirmado. No se pudo refrescar toda la tabla: pulsa Actualizar.','error');
          render();
          return true;
        }
        if (!validCurrent(current,serial)) return false;
        if (!Array.isArray(list?.data) || !Array.isArray(list?.columns)) throw error_cor(
          'La respuesta de la tabla es invalida.','ADMIN_V2_BAD_TABLE');
        st.records = list.data;
        st.tableColumns = list.columns;
        st.projectRecordsTotal = Number(list.total) || 0;
        st.listStale = true;
        active = null;
        setMessage('Guardado y verificado correctamente.','ready');
        render();
        return true;
      } catch (error) {
        if (!validCurrent(current,serial)) return false;
        entry.blocked = true;
        verificationRequired = Boolean(error?.committed || error?.uncertain || patchAccepted ||
          error?.code === 'ADMIN_V2_RECHECK_MISMATCH');
        // Si ya hubo PATCH correcto pero perdimos lectura, nunca conservar informacion vieja visible.
        if ([401,403,404].includes(Number(error?.status))) {
          active = null;selected.clear();st.records = [];st.tableColumns = [];
          verificationRequired = true;
          setMessage('Permiso o alcance cambiado. Actualiza o vuelve a entrar para verificar el resultado.','error');
          render();
        } else {
          showError((error?.committed || error?.uncertain || patchAccepted ?
            'Operacion enviada, resultado no verificable; NO se reintentara automaticamente. ' :
            'No se pudo guardar. ') + (error?.message || 'Actualiza la tabla.'));
        }
        return false;
      } finally {
        if (epoch === serial) {
          saving = false;st.saving = false;
          const control = view()?.querySelector('[data-iadm-v2-control]');
          if (control) control.disabled = false;
          if(!active && validCurrent(current,serial))render();
        }
      }
    }
    function bind(rootElement) {
      if (bound) return;
      if (!rootElement) throw new Error('Falta la vista de Administracion de Instalaciones.');
      bound = true;
      rootElement.addEventListener('pointerdown',event => {
        if (event.target?.closest?.('[data-iadm-v3-clear]')) {
          // No provocar blur/autoguardado al descartar SOLO la seleccion.
          event.preventDefault();
        } else if(event.target?.closest?.('[data-iadm-v3-select]') && active?.touched) {
          event.preventDefault();
          setMessage('Finaliza o cancela la edicion antes de seleccionar mas equipos.','error');
        }
      },true);
      rootElement.addEventListener('click',event => {
        const clearButton=event.target?.closest?.('[data-iadm-v3-clear]');
        if(!clearButton || !rootElement.contains(clearButton) || st.page!=='equipos')return;
        event.preventDefault();event.stopImmediatePropagation();
        clearSelection();
      },true);
      rootElement.addEventListener('change',event => {
        const checkbox=event.target;
        if(st.page!=='equipos' || !checkbox?.matches?.('[data-iadm-v3-select]'))return;
        event.stopImmediatePropagation();
        const id=checkbox.dataset.iadmV3SelectId;
        if(!toggleSelection(id,Boolean(checkbox.checked)))checkbox.checked=!checkbox.checked;
      },true);
      rootElement.addEventListener('click',event => {
        const button = event.target?.closest?.('[data-iadm-ghost-action="edit"]');
        if (!button || !rootElement.contains(button) || st.page !== 'equipos') return;
        event.preventDefault();event.stopImmediatePropagation();
        if (active?.touched || saving) return;
        void beginEdit(button.dataset.iadmGhostId,button.dataset.iadmGhostField);
      },true);
      for (const eventName of ['input','change']) rootElement.addEventListener(eventName,event => {
        if (st.page !== 'equipos' || !active || saving || active.blocked ||
            !event.target?.matches?.('[data-iadm-v2-control]')) return;
        active.touched = true;
        if (eventName === 'change' && (LIST_FIELDS.has(active.field) || meta(active.field)?.kind === 'date')) {
          void commitActive();
        }
      },true);
      rootElement.addEventListener('focusout',event => {
        if (st.page !== 'equipos' || !active || saving || active.blocked ||
            !event.target?.matches?.('[data-iadm-v2-control]')) return;
        // Para selects/fecha solo se guarda al seleccionar un valor valido.
        if (LIST_FIELDS.has(active.field) || meta(active.field)?.kind === 'date' ||
            event.relatedTarget?.closest?.('[data-iadm-v3-clear]')) return;
        void commitActive();
      },true);
      rootElement.addEventListener('keydown',event => {
        if (st.page !== 'equipos' || !active || !event.target?.matches?.('[data-iadm-v2-control]')) return;
        if (event.key === 'Escape' && !saving) {
          event.preventDefault();
          const id = active.id, field = active.field;
          active = null;redrawCell(id,field);setMessage('Edicion cancelada.','ready');
        } else if (event.key === 'Enter' && !saving &&
                   meta(active.field)?.kind !== 'textarea') {
          event.preventDefault();void commitActive();
        }
      },true);
    }

    return Object.freeze({bind,render,clear,hasPending,changeEquipmentPage,
      listDrafts:()=>[],pendingCount:()=>0,readyToSave:()=>false,
      setSaving:value=>{saving=Boolean(value);},
      setSaveMessage:()=>{},ackSaved:()=>{}});
  }
  return {create,helpers:Object.freeze({visibleColumns_cor,editable_cor,validCivilDate_cor,
    uniqueInitials_cor,validValue_cor,payload_cor,persistVerified_cor,
    buildMultiPayload_cor,persistVerifiedMulti_cor,MAX_MULTI,
    HIDDEN_FIELDS,DERIVED_FIELDS,STATUS_CODES})};
});
