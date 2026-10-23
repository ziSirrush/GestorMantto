(function (win, doc) {
  'use strict';
  // [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_5_V001]
  // Vista Excel: los PATCH recalculan dependientes en backend en la MISMA transaccion.
  // Los siete derivados siempre permanecen bloqueados para edicion manual.

  const API='/api/cobranza-uni/administracion/tablas/gestion_credito/registros';
  const BULK_LIMIT=20;
  const LABELS=Object.freeze({
    id_gc:'Consecutivo',idns:'ID',proyecto:'Proyecto',id_proyecto_cobranza:'ID Proyecto Cobranza',
    cliente:'Cliente',subsidiaria:'Subsidiaria',region:'Región',estado:'Estado',
    z_oper:'Z. Oper.',z_adm:'Z. Adm.',categoria:'Categoría',prioridad:'Prioridad',
    suma_valor_unitario:'Suma de Valor Unitario',recuento_no_equipos:'Recuento de No. Equipos',
    mp_2025:'MP 2025',monto_mp_2025:'MONTO MP 2025',mp_2026:'MP 2026',
    monto_mp_2026:'MONTO MP 2026',facturas_mp:'FACTURAS MP',montp_mp:'MONTO MP',
    facturas_va:'FACTURAS VA',monto_va:'MONTO VA',adeudo:'ADEUDO',
    facts_adeudadas:'FACTS ADEUDADAS',suministro:'SUMINISTRO',
    nivel_riesgo_credito:'NIVEL DE RIESGO CRÉDITO',credito_para_va:'CRÉDITO PARA VA',
    credito_disponible_venta:'Crédito disponible para venta',anticipo:'Anticipo'
  });
  const ESC=value=>String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const has=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);

  function mount(root,options={}){
    if(!root||typeof root.addEventListener!=='function')return null;
    const canEdit=options.canEdit===true && win.ManttoAuth?.isViewingAs?.()!==true;
    let disposed=false,requestNo=0,saving=false,editing=null;
    const state={
      page:1,pageSize:50,search:'',filterColumn:'',filterValue:'',
      sort:'id_gc',order:'asc',columns:[],rows:[],total:0,pages:0,
      selected:new Set()
    };
    const valid=()=>!disposed && (typeof options.isCurrent!=='function'||options.isCurrent());
    const el=selector=>root.querySelector(selector);
    const status=(message,kind='info')=>{
      const target=el('[data-gc-status]');
      if(target){target.textContent=message;target.dataset.kind=kind;}
    };
    const attr=kind=>kind==='derived'?'Automático · solo lectura'
      :kind==='protected'?'Protegido · solo lectura':canEdit?'Doble clic o Enter para editar':'Solo consulta';
    const cols=()=>state.columns.filter(c=>has(LABELS,c.name));
    const editableCols=()=>cols().filter(c=>c.kind==='editable' && c.editable===true);
    const rowId=row=>String(row?.id_gc??'');
    const findRow=id=>state.rows.find(r=>rowId(r)===id);

    root.innerHTML=
      '<div class="cua-gc-admin" data-cua-gc-grid>'+
      '<div class="cua-gc-toolbar">'+
       '<form class="cua-gc-search" data-gc-form autocomplete="off">'+
        '<label><span>Buscar</span><input data-gc-search type="search" maxlength="120" placeholder="Proyecto, cliente, ID, región..." /></label>'+
        '<label><span>Columna</span><select data-gc-filter-column><option value="">Todas / ninguna</option></select></label>'+
        '<label><span>Contiene</span><input data-gc-filter-value maxlength="120" type="search" placeholder="Filtrar columna" /></label>'+
        '<button type="submit" class="cua-gc-btn cua-gc-primary">Aplicar</button>'+
        '<button type="button" class="cua-gc-btn" data-gc-clear>Limpiar</button>'+
       '</form>'+
       '<div class="cua-gc-actions">'+
        '<label>Filas <select data-gc-page-size><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option></select></label>'+
        '<button type="button" class="cua-gc-btn" data-gc-reload>↻ Actualizar</button>'+
       '</div></div>'+
      (canEdit?
       '<form class="cua-gc-bulk" data-gc-bulk-form autocomplete="off">'+
        '<strong data-gc-selected-count>0 seleccionados (máx. 20)</strong>'+
        '<label>Columna <select data-gc-bulk-field aria-label="Columna de edición múltiple"></select></label>'+
        '<label>Valor <input data-gc-bulk-value type="text" maxlength="255" placeholder="Nuevo valor" /></label>'+
        '<label class="cua-gc-null"><input data-gc-bulk-null type="checkbox" /> Vaciar (NULL)</label>'+
        '<button type="submit" class="cua-gc-btn cua-gc-primary" data-gc-bulk-apply disabled>Aplicar a seleccionados</button>'+
       '</form>':'')+
      '<p class="cua-gc-hint">29 columnas · 20 editables (incluye idns) · 2 claves protegidas · 7 calculadas y bloqueadas. '+
      (canEdit?'Doble clic en una celda para editar; Enter confirma, Esc cancela. '+
        'Los calculados relacionados se actualizan automáticamente después de guardar. '+
        'Las modificaciones de GAS y el editor aún requieren validación integral (Fase 6).'
        :'Acceso en modo consulta.')+'</p>'+
      '<div class="cua-gc-status" data-gc-status role="status" aria-live="polite">Consultando...</div>'+
      '<div class="cua-gc-scroll" tabindex="0" role="region" aria-label="Gestión de Crédito: tabla de 29 columnas">'+
       '<table class="cua-gc-grid"><thead data-gc-head></thead><tbody data-gc-body></tbody></table>'+
      '</div>'+
      '<nav class="cua-gc-pager" aria-label="Paginación Gestión de Crédito">'+
       '<button type="button" class="cua-gc-btn" data-gc-prev disabled>← Anterior</button>'+
       '<span data-gc-page aria-live="polite">Página 1</span>'+
       '<button type="button" class="cua-gc-btn" data-gc-next disabled>Siguiente →</button>'+
      '</nav></div>';

    function updateBulkControls(){
      if(!canEdit)return;
      const count=el('[data-gc-selected-count]');
      if(count)count.textContent=state.selected.size+' seleccionados (máx. '+BULK_LIMIT+')';
      const action=el('[data-gc-bulk-apply]');
      if(action)action.disabled=state.selected.size<2||saving||Boolean(editing);
    }
    function setBusy(busy){
      saving=busy;
      root.querySelectorAll('button, [data-gc-select]').forEach(button=>{
        if(button.hasAttribute('data-gc-bulk-apply'))return;
        button.disabled=busy;
      });
      updateBulkControls();
    }
    function renderGrid(){
      if(!valid())return;
      const scroll=el('.cua-gc-scroll');
      const left=scroll?.scrollLeft||0,top=scroll?.scrollTop||0;
      const allowed=cols();
      const filterEl=el('[data-gc-filter-column]');
      if(filterEl)filterEl.innerHTML='<option value="">Todas / ninguna</option>'+allowed.map(col=>
        '<option value="'+ESC(col.name)+'"'+(state.filterColumn===col.name?' selected':'')+'>'+ESC(LABELS[col.name])+'</option>'
      ).join('');
      const bulkField=el('[data-gc-bulk-field]');
      if(bulkField){
        const selected=bulkField.value;
        bulkField.innerHTML=editableCols().map(col=>'<option value="'+ESC(col.name)+'">'+ESC(LABELS[col.name])+'</option>').join('');
        if(editableCols().some(c=>c.name===selected))bulkField.value=selected;
      }
      const thead=el('[data-gc-head]'),tbody=el('[data-gc-body]');
      if(thead)thead.innerHTML='<tr>'+allowed.map(col=>{
        const key=String(col.name),kind=String(col.kind||'');
        const asc=state.sort===key&&state.order==='asc';
        const indicator=state.sort===key?(asc?' ↑':' ↓'):'';
        const ariaSort=state.sort===key?(asc?'ascending':'descending'):'none';
        return '<th scope="col" aria-sort="'+ariaSort+'" class="cua-gc-th cua-gc-'+ESC(kind)+'">'+
          '<button type="button" data-gc-sort="'+ESC(key)+'" title="Ordenar por '+ESC(LABELS[key])+'">'+ESC(LABELS[key])+indicator+'</button>'+
          '<small>'+ESC(attr(kind))+'</small></th>';
      }).join('')+'</tr>';
      if(tbody){
        tbody.innerHTML=state.rows.length ? state.rows.map(row=>{
          const id=rowId(row);
          return '<tr data-gc-id="'+ESC(id)+'">'+allowed.map(col=>{
            const field=String(col.name),kind=String(col.kind||'');
            const raw=has(row,field)?row[field]:null;
            const value=raw===null||raw===undefined||raw===''?'—':String(raw);
            const numeric=/^(?:decimal|int|bigint)/i.test(String(col.sqlType||''))?' cua-gc-number':'';
            const enabled=canEdit && kind==='editable' && col.editable===true;
            const checkbox=canEdit&&field==='id_gc'
              ? '<label class="cua-gc-select-label"><input type="checkbox" data-gc-select value="'+ESC(id)+'"'+(state.selected.has(id)?' checked':'')+' aria-label="Seleccionar registro '+ESC(id)+'" /> <span>'+ESC(value)+'</span></label>'
              :'<span>'+ESC(value)+'</span>';
            return '<td class="cua-gc-cell cua-gc-'+ESC(kind)+numeric+(enabled?' cua-gc-canedit':'')+'" data-gc-field="'+ESC(field)+'"'+
              (enabled?' tabindex="0" role="button" aria-label="Editar '+ESC(LABELS[field])+' del registro '+ESC(id)+'"':'')+
              ' title="'+ESC(attr(kind))+'">'+checkbox+'</td>';
          }).join('')+'</tr>';
        }).join('')
         :'<tr><td class="cua-gc-empty" colspan="'+allowed.length+'">Sin registros para los filtros indicados.</td></tr>';
      }
      const p=el('[data-gc-page]');
      if(p)p.textContent='Página '+state.page+' de '+Math.max(1,state.pages)+' · '+state.total+' registros';
      const prev=el('[data-gc-prev]'),next=el('[data-gc-next]');
      if(prev)prev.disabled=state.page<=1||saving;
      if(next)next.disabled=state.page>=state.pages||saving;
      updateBulkControls();
      if(scroll){scroll.scrollLeft=left;scroll.scrollTop=top;}
    }

    async function load(){
      if(!valid()||saving||editing)return false;
      const seq=++requestNo;
      status('Consultando gestion_credito en Aiven...');
      const query=new URLSearchParams({
        page:String(state.page),page_size:String(state.pageSize),
        search:state.search,filter_column:state.filterColumn,
        filter_value:state.filterValue,sort:state.sort,order:state.order
      });
      try{
        const response=await win.ManttoAuth.apiGet(API+'?'+query.toString());
        if(!valid()||seq!==requestNo)return false;
        if(response?.ok!==true||response.table!=='gestion_credito'||response.readonly!==true||
          !Array.isArray(response.columns)||!Array.isArray(response.rows))throw new Error('Contrato de consulta inválido.');
        const columns=response.columns.filter(x=>x&&has(LABELS,x.name)&&
          ['protected','editable','derived'].includes(x.kind));
        if(columns.length!==29||new Set(columns.map(x=>x.name)).size!==29){
          throw new Error('La respuesta no contiene el esquema GC esperado.');
        }
        state.columns=columns;
        state.rows=response.rows;
        state.total=Number(response.total)||0;
        state.pages=Number(response.pages)||0;
        state.selected.clear();
        renderGrid();
        status(state.total+' registros encontrados · '+(canEdit?'Edición habilitada':'Solo consulta'),'ready');
        return true;
      }catch(error){
        if(!valid()||seq!==requestNo)return false;
        state.rows=[];state.total=0;state.pages=0;state.selected.clear();
        renderGrid();
        status('No fue posible consultar la tabla. Revisa permisos, conexión y filtros.','error');
        return false;
      }
    }

    function savedStatus_uni(response,prefix){
      const calculated=Number(response?.calculated)||0;
      const warnings=Array.isArray(response?.warnings)?response.warnings:[];
      const auto=calculated>0?' · '+calculated+' campos calculados actualizados':'';
      if(warnings.length){
        return {kind:'warning',message:prefix+auto+
          ' · Atención: '+warnings.length+' registros con categoría sin regla de crédito (NULL).'};
      }
      return {kind:'ready',message:prefix+auto+'.'};
    }

    function beginEdit(td){
      if(!valid()||!canEdit||saving||editing||!td?.classList.contains('cua-gc-canedit'))return;
      const field=td.dataset.gcField;
      const id=td.closest('tr')?.dataset.gcId;
      const row=findRow(id);
      if(!row||!editableCols().some(c=>c.name===field))return;
      const original=has(row,field)?row[field]:null;
      const col=state.columns.find(c=>c.name===field);
      editing={id,field,original,td,committing:false};
      const input=doc.createElement('input');
      input.type='text';input.value=original==null?'':String(original);
      input.className='cua-gc-edit-input';input.setAttribute('data-gc-cell-input','');
      input.setAttribute('aria-label','Nuevo valor para '+LABELS[field]);
      input.maxLength=/varchar\((\d+)\)/i.test(col.sqlType)?Number(RegExp.$1):32;
      input.inputMode=/^int/.test(col.sqlType)?'numeric':/^decimal/.test(col.sqlType)?'decimal':'text';
      td.replaceChildren(input);td.classList.add('cua-gc-editing');
      input.focus();input.select();
      updateBulkControls();
    }

    function cancelEdit(){
      if(!editing||editing.committing)return;
      const {td,original}=editing;
      editing=null;
      td.classList.remove('cua-gc-editing');
      td.innerHTML='<span>'+ESC(original===null||original===undefined||original===''?'—':original)+'</span>';
      td.focus();updateBulkControls();
    }

    async function finishEdit(){
      if(!editing||editing.committing||!valid())return;
      const current=editing;
      const input=current.td.querySelector('[data-gc-cell-input]');
      if(!input)return;
      const value=input.value.trim();
      const rawOriginal=current.original===null||current.original===undefined?'':String(current.original);
      if(value===rawOriginal){cancelEdit();return;}
      editing.committing=true;
      editing=null;
      setBusy(true);
      status('Guardando celda de gestion_credito...');
      const payload={changes:{[current.field]:value||null},expected:{[current.field]:current.original??null}};
      try{
        const response=await win.ManttoAuth.api(API+'/'+encodeURIComponent(current.id),{
          method:'PATCH',body:JSON.stringify(payload)
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='gestion_credito'||response.field!==current.field)
          throw new Error('El servidor no confirmó el cambio.');
        setBusy(false);
        await load();
        if(valid()){
          const notice=savedStatus_uni(response,response.changed===1?'Cambio guardado y auditado':'No había cambios');
          status(notice.message,notice.kind);
        }
      }catch(error){
        if(!valid())return;
        setBusy(false);
        await load();
        if(valid())status('No se guardó la celda: '+String(error?.message||'revise permisos o conflictos.'),'error');
      }
    }

    async function submitBulk(event){
      if(!event.target.matches('[data-gc-bulk-form]'))return;
      event.preventDefault();
      if(!valid()||!canEdit||saving||editing)return;
      const ids=[...state.selected];
      if(ids.length<2||ids.length>BULK_LIMIT){status('Selecciona de 2 a 20 registros.','error');return;}
      const field=String(el('[data-gc-bulk-field]')?.value||'');
      if(!editableCols().some(c=>c.name===field)){status('Columna no editable.','error');return;}
      const value=el('[data-gc-bulk-null]')?.checked===true ? null
        :String(el('[data-gc-bulk-value]')?.value||'').trim();
      if(value==='' && value!==null){status('Introduce un valor o marca Vaciar (NULL).','error');return;}
      const expected={};
      for(const id of ids){
        const row=findRow(id);
        if(!row){status('La selección cambió. Actualiza la tabla.','error');return;}
        expected[id]={[field]:has(row,field)?row[field]:null};
      }
      if(typeof win.confirm==='function' && !win.confirm(
        '¿Aplicar el cambio de '+LABELS[field]+' a '+ids.length+' registros?'))return;
      setBusy(true);
      status('Guardando '+ids.length+' registros en una transacción...');
      try{
        const response=await win.ManttoAuth.api(API+'/edicion-multiple',{
          method:'PATCH',body:JSON.stringify({ids,changes:{[field]:value},expected})
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='gestion_credito'||response.total!==ids.length)
          throw new Error('El servidor no confirmó el lote.');
        setBusy(false);
        await load();
        if(valid()){
          const notice=savedStatus_uni(response,response.changed+
            ' cambios guardados y auditados de '+response.total+' registros');
          status(notice.message,notice.kind);
        }
      }catch(error){
        if(!valid())return;
        setBusy(false);
        await load();
        if(valid())status('El lote NO se guardó: '+String(error?.message||'conflicto o permiso insuficiente.'),'error');
      }
    }

    function delegatedClick(event){
      if(!valid()||saving||editing)return;
      const action=event.target.closest('[data-gc-sort],[data-gc-prev],[data-gc-next],[data-gc-reload],[data-gc-clear]');
      if(!action||!root.contains(action))return;
      const field=action.dataset.gcSort;
      if(field&&state.columns.some(c=>c.name===field)){
        if(state.sort===field)state.order=state.order==='asc'?'desc':'asc';
        else{state.sort=field;state.order='asc';}
        state.page=1;load().catch(()=>{});return;
      }
      if(action.hasAttribute('data-gc-prev')&&state.page>1){state.page--;load().catch(()=>{});return;}
      if(action.hasAttribute('data-gc-next')&&state.page<state.pages){state.page++;load().catch(()=>{});return;}
      if(action.hasAttribute('data-gc-reload')){load().catch(()=>{});return;}
      if(action.hasAttribute('data-gc-clear')){
        state.search='';state.filterColumn='';state.filterValue='';state.page=1;
        const s=el('[data-gc-search]'),c=el('[data-gc-filter-column]'),v=el('[data-gc-filter-value]');
        if(s)s.value='';if(c)c.value='';if(v)v.value='';
        load().catch(()=>{});
      }
    }
    function submitFilter(event){
      if(!event.target.matches('[data-gc-form]'))return;
      event.preventDefault();if(!valid()||saving||editing)return;
      state.search=String(el('[data-gc-search]')?.value||'').trim();
      state.filterColumn=String(el('[data-gc-filter-column]')?.value||'');
      state.filterValue=state.filterColumn?String(el('[data-gc-filter-value]')?.value||'').trim():'';
      state.page=1;load().catch(()=>{});
    }
    function changeControl(event){
      if(!valid()||saving||editing)return;
      if(event.target.matches('[data-gc-page-size]')){
        const size=Number(event.target.value);
        if(![25,50,100].includes(size))return;
        state.pageSize=size;state.page=1;load().catch(()=>{});
      }else if(canEdit&&event.target.matches('[data-gc-select]')){
        const id=String(event.target.value);
        if(event.target.checked){
          if(state.selected.size>=BULK_LIMIT){
            event.target.checked=false;
            status('Máximo 20 registros por operación.','error');return;
          }
          state.selected.add(id);
        }else state.selected.delete(id);
        updateBulkControls();
      }
    }
    function keydown(event){
      if(!valid()||!canEdit)return;
      if(event.target.matches('[data-gc-cell-input]')){
        if(event.key==='Escape'){event.preventDefault();cancelEdit();}
        else if(event.key==='Enter'){event.preventDefault();finishEdit().catch(()=>{});}
        return;
      }
      if(event.key==='Enter'){
        const td=event.target.closest('td.cua-gc-canedit');
        if(td){event.preventDefault();beginEdit(td);}
      }
    }
    function dblclick(event){
      if(!valid()||!canEdit)return;
      const td=event.target.closest('td.cua-gc-canedit');
      if(td&&root.contains(td))beginEdit(td);
    }
    function blur(event){
      if(event.target.matches('[data-gc-cell-input]'))finishEdit().catch(()=>{});
    }

    root.addEventListener('click',delegatedClick);
    root.addEventListener('submit',submitFilter);
    root.addEventListener('submit',submitBulk);
    root.addEventListener('change',changeControl);
    root.addEventListener('keydown',keydown);
    root.addEventListener('dblclick',dblclick);
    root.addEventListener('focusout',blur);
    load().catch(()=>{});
    return Object.freeze({
      refresh:load,
      destroy(){
        disposed=true;requestNo++;
        root.removeEventListener('click',delegatedClick);
        root.removeEventListener('submit',submitFilter);
        root.removeEventListener('submit',submitBulk);
        root.removeEventListener('change',changeControl);
        root.removeEventListener('keydown',keydown);
        root.removeEventListener('dblclick',dblclick);
        root.removeEventListener('focusout',blur);
        root.replaceChildren();
      }
    });
  }

  win.ManttoCobranzaAdministracionGC_uni=Object.freeze({mount});
})(window,document);
