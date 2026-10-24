(function(win){
  'use strict';
  // [BLT NOW | 2026-10-23 | COBRANZA_UNI_EXCEL_FASE_5_V001]
  // Zona 1: 128 columnas, editor fantasma y edición múltiple como GC.
  // Permisos, whitelist, identidad, concurrencia y auditoria son del backend.
  const API='/api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1/registros';
  const WRITE='/api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1';
  const EXPECTED=128,MAX_BULK=20;
  const ESC=value=>String(value==null?'':value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const FIELD_LABELS=Object.freeze({
    id_mp_zona_1:'ID Zona 1',id_dmp:'Consecutivo MP',idns:'ID',
    created_at:'Creación',updated_at:'Actualización',
    facturacion:'Facturación',fecha_pago:'Fecha de pago',
    estatus_factura:'Estatus factura',fecha_factura:'Fecha factura',
    numero_factura:'Número factura',vencimiento:'Vencimiento',
    dias_vencimiento:'Días vencimiento',estatus:'Estatus',forma_pago:'Forma de pago'
  });
  const has=(obj,name)=>Object.prototype.hasOwnProperty.call(obj||{},name);
  const display=value=>value==null||value===''?'—':String(value);
  function label(c){
    const match=/^(.+)_([0-9]{2})$/.exec(c.name);
    if(match)return 'Factura '+match[2]+' · '+(FIELD_LABELS[match[1]]||match[1]);
    return FIELD_LABELS[c.name]||c.sheetHeader||c.name;
  }
  function mount(root,options={}){
    if(!root||typeof root.addEventListener!=='function')return null;
    const allowedFields=new Set(Array.isArray(options.editableFields)?options.editableFields:[]);
    const canEdit=options.canEdit===true&&allowedFields.size>0&&
      win.ManttoAuth?.isViewingAs?.()!==true;
    let disposed=false,loading=false,saving=false,editing=null,requestSeq=0;
    const state={page:1,pageSize:25,search:'',filterColumn:'',filterValue:'',
      sort:'id_mp_zona_1',order:'asc',columns:[],rows:[],total:0,pages:0,
      selected:new Set()};
    const valid=()=>!disposed&&(typeof options.isCurrent!=='function'||options.isCurrent());
    const el=selector=>root.querySelector(selector);
    const status=(message,kind='info')=>{
      const node=el('[data-mpz-status]');
      if(node){node.textContent=message;node.dataset.kind=kind;}
    };
    const repairFields=new Set(['proyecto','idns','cliente']);
    const allowed=c=>canEdit&&c?.kind!=='protected'&&c?.sheetColumn&&allowedFields.has(c.name);
    const rowAllowed=(c,row)=>allowed(c)&&(!row?.repair_only||repairFields.has(c.name));
    const editableCols=()=>state.columns.filter(allowed);
    const findRow=id=>state.rows.find(row=>String(row.id_mp_zona_1)===String(id));
    root.innerHTML='<section class="cua-mpz-admin" aria-label="Zona 1 de Mantenimiento Preventivo">'+
      '<header class="cua-mpz-head"><div><strong>Facturación Zona 1 · 128 columnas</strong>'+
        '<p>16 campos generales · 12 facturaciones × 9 campos · 4 columnas técnicas. '+
          'Vínculo por id_dmp; filas desajustadas solo visibles para reparación autorizada.</p></div>'+
        '<span class="cua-mpz-badge">'+(canEdit?'Edición Excel auditada':'Solo consulta')+'</span></header>'+
      '<form class="cua-mpz-filters" data-mpz-form autocomplete="off">'+
        '<label><span>Buscar</span><input data-mpz-search type="search" maxlength="120" '+
          'placeholder="Proyecto, ID, cliente, consecutivo…" /></label>'+
        '<label><span>Columna</span><select data-mpz-filter-column><option value="">Seleccionar columna</option></select></label>'+
        '<label><span>Contiene</span><input data-mpz-filter-value type="search" maxlength="120" /></label>'+
        '<button class="cua-mp-btn cua-mp-primary" type="submit">Aplicar</button>'+
        '<button class="cua-mp-btn" type="button" data-mpz-clear>Limpiar</button></form>'+
      '<div class="cua-mpz-controls"><label>Filas <select data-mpz-page-size>'+ 
        '<option value="15">15</option><option value="25" selected>25</option><option value="50">50</option></select></label>'+
        '<button class="cua-mp-btn" type="button" data-mpz-reload>↻ Actualizar</button></div>'+
      (canEdit?'<form class="cua-mpz-bulk" data-mpz-bulk-form autocomplete="off">'+
        '<strong data-mpz-bulk-count>0 seleccionados (máx. 20)</strong>'+
        '<label>Campo <select data-mpz-bulk-field aria-label="Campo a modificar"></select></label>'+
        '<label>Valor <input data-mpz-bulk-input type="text" maxlength="150" placeholder="Nuevo valor" /></label>'+
        '<label class="cua-mpz-null"><input data-mpz-bulk-null type="checkbox" /> Vaciar (NULL)</label>'+
        '<button class="cua-mp-btn cua-mp-primary" type="submit" data-mpz-bulk-apply disabled>Aplicar y auditar lote</button>'+ 
        '</form>':'')+
      '<p class="cua-mpz-hint">La vinculación es por id_dmp, nunca por nombre. '+
        (canEdit?'Doble clic o Enter en una celda de datos · Enter para guardar · Escape para cancelar. '+
          'Solo PK, FK y marcas de tiempo permanecen protegidas. Si la identidad difiere, primero corrige proyecto, IDNS o cliente.' :
          'Los registros sin identidad verificable no se muestran. Edición sujeta a permisos.')+
        '</p>'+
      '<div data-mpz-status class="cua-mpz-status" role="status" aria-live="polite">Consulta pendiente…</div>'+
      '<div class="cua-mpz-scroll" tabindex="0" role="region" aria-label="Zona 1 · tabla Excel desplazable">'+
        '<table class="cua-mpz-table"><thead data-mpz-head></thead><tbody data-mpz-body></tbody></table></div>'+
      '<nav class="cua-mpz-pager" aria-label="Paginación Zona 1">'+
        '<span data-mpz-range>0 registros</span><div><button type="button" class="cua-mp-btn" data-mpz-prev disabled>← Anterior</button>'+
        '<span data-mpz-page>Página 1</span><button type="button" class="cua-mp-btn" data-mpz-next disabled>Siguiente →</button></div></nav>'+
      '</section>';
    function updateBulk(){
      if(!canEdit)return;
      const counter=el('[data-mpz-bulk-count]');
      if(counter)counter.textContent=state.selected.size+' seleccionados (máx. '+MAX_BULK+')';
      const button=el('[data-mpz-bulk-apply]');
      if(button)button.disabled=saving||loading||Boolean(editing)||
        state.selected.size<2||state.selected.size>MAX_BULK;
    }
    function renderBulkFields(){
      if(!canEdit)return;
      const target=el('[data-mpz-bulk-field]');if(!target)return;
      const original=target.value;
      const repairSelected=[...state.selected].some(id=>findRow(id)?.repair_only===true);
      const cols=editableCols().filter(c=>!repairSelected||repairFields.has(c.name));
      target.innerHTML=cols.map(c=>'<option value="'+ESC(c.name)+'">'+ESC(label(c))+'</option>').join('');
      if(cols.some(c=>c.name===original))target.value=original;
      updateBulkInput();updateBulk();
    }
    function updateBulkInput(){
      const field=el('[data-mpz-bulk-field]')?.value||'';
      const col=editableCols().find(c=>c.name===field),input=el('[data-mpz-bulk-input]');
      if(!col||!input)return;
      input.type=col.sqlType==='date'?'date':'text';
      input.inputMode=col.sqlType==='int'?'numeric':col.sqlType==='decimal(18,2)'?'decimal':'text';
      input.maxLength=Number((/^varchar\((\d+)\)$/i.exec(col.sqlType)||[])[1])||150;
    }
    function render(){
      if(!valid())return;
      const scroll=el('.cua-mpz-scroll'),left=scroll?.scrollLeft||0,top=scroll?.scrollTop||0;
      const filter=el('[data-mpz-filter-column]');
      if(filter){const previous=state.filterColumn;
        filter.innerHTML='<option value="">Seleccionar columna</option>'+state.columns.map(c=>
          '<option value="'+ESC(c.name)+'"'+(previous===c.name?' selected':'')+'>'+ESC(label(c))+'</option>').join('');
      }
      const head=el('[data-mpz-head]'),body=el('[data-mpz-body]');
      if(head)head.innerHTML='<tr>'+state.columns.map(c=>{
        const arrow=state.sort===c.name?(state.order==='asc'?' ↑':' ↓'):'';
        return '<th scope="col" data-mpz-kind="'+ESC(c.kind)+'" '+
          'aria-sort="'+ESC(state.sort===c.name?(state.order==='asc'?'ascending':'descending'):'none')+'">'+
          '<button type="button" data-mpz-sort="'+ESC(c.name)+'" '+
          'title="Ordenar por '+ESC(label(c))+'">'+ESC(label(c))+arrow+'</button>'+
          '<small>'+ESC(c.kind==='protected'?'Identificador / técnico':allowed(c)?'Editable · auditado':'Origen Zona 1 · solo lectura')+'</small></th>';
      }).join('')+'</tr>';
      if(body)body.innerHTML=state.rows.length?state.rows.map(row=>
        '<tr data-mpz-id="'+ESC(row.id_mp_zona_1)+'"'+
          (row.repair_only?' class="cua-mpz-repair" title="Identidad desajustada: corrige proyecto, IDNS o cliente"':'')+'>'+state.columns.map(c=>{
          const editable=rowAllowed(c,row),selection=canEdit&&c.name==='id_mp_zona_1'
            ?'<label class="cua-mpz-select"><input type="checkbox" data-mpz-select value="'+ESC(row.id_mp_zona_1)+'"'+
              (state.selected.has(String(row.id_mp_zona_1))?' checked':'')+' aria-label="Seleccionar Zona 1 '+ESC(row.id_mp_zona_1)+'" /> '+
              '<span>'+ESC(display(row[c.name]))+'</span></label>'+
              (row.repair_only?' <small>Identidad desajustada</small>':'') :
              '<span>'+ESC(display(row[c.name]))+'</span>';
          return '<td data-mpz-field="'+ESC(c.name)+'" data-mpz-kind="'+ESC(c.kind)+'"'+
            ' class="cua-mpz-cell'+(editable?' cua-mpz-canedit':'')+'"'+
            (editable?' tabindex="0" role="button" aria-label="Editar '+ESC(label(c))+' del registro '+ESC(row.id_mp_zona_1)+'"':'')+
            ' title="'+ESC(display(row[c.name]))+'">'+selection+'</td>';
        }).join('')+'</tr>'
      ).join(''):'<tr><td class="cua-mpz-empty" colspan="'+Math.max(1,state.columns.length)+'">'+
        'Sin filas verificadas de Zona 1 para los filtros aplicados.</td></tr>';
      const prev=el('[data-mpz-prev]'),next=el('[data-mpz-next]');
      if(prev)prev.disabled=loading||saving||state.page<=1;
      if(next)next.disabled=loading||saving||state.page>=state.pages;
      const page=el('[data-mpz-page]');if(page)page.textContent='Página '+state.page+' de '+Math.max(1,state.pages);
      const range=el('[data-mpz-range]');if(range)range.textContent=state.total+
        ' registros vinculados · '+state.rows.filter(row=>row.repair_only).length+
        ' desajustados en esta página';
      if(scroll){scroll.scrollLeft=left;scroll.scrollTop=top;}
      renderBulkFields();
    }
    async function load(){
      if(!valid()||saving)return false;
      if(editing)cancelCellEdit();
      const current=++requestSeq;
      loading=true;updateBulk();status('Consultando Zona 1 con permisos y alcance UNITED…');
      const query=new URLSearchParams({page:String(state.page),page_size:String(state.pageSize),
        search:state.search,filter_column:state.filterColumn,filter_value:state.filterValue,
        sort:state.sort,order:state.order});
      try{
        const response=await win.ManttoAuth.apiGet(API+'?'+query.toString());
        if(!valid()||current!==requestSeq)return false;
        if(response?.ok!==true||response.table!=='detalle_mp_2026_zona_1'||
          response.readonly!==true||
          !(response.identity_verified===true||
            (canEdit&&response.repair_mode===true&&response.scope_verified===true))||
          response.relation!=='id_dmp'||
          response.primary_key!=='id_mp_zona_1'||!Array.isArray(response.columns)||
          response.columns.length!==EXPECTED||!Array.isArray(response.rows)||
          response.rows.length>state.pageSize||new Set(response.columns.map(c=>c.name)).size!==EXPECTED||
          response.columns.some(c=>typeof c.name!=='string'||typeof c.sqlType!=='string')||
          !Number.isSafeInteger(Number(response.total))||Number(response.total)<0||
          !Number.isSafeInteger(Number(response.pages))||Number(response.pages)<0||
          Number(response.page)!==state.page||Number(response.page_size)!==state.pageSize)
          throw new Error('Contrato Zona 1 no confiable.');
        const set=new Set();
        for(const row of response.rows){
          const id=String(row?.id_mp_zona_1??''),parent=String(row?.id_dmp??'');
          if(!/^[1-9]\d*$/.test(id)||!/^[1-9]\d*$/.test(parent)||set.has(id)||
            (response.repair_mode===true&&typeof row.repair_only!=='boolean')||
            response.columns.some(c=>!has(row,c.name)))throw new Error('Fila Zona 1 sin identidad confiable.');
          set.add(id);
        }
        state.columns=response.columns;state.rows=response.rows;
        state.total=Number(response.total);state.pages=Number(response.pages);
        state.selected.clear();
        loading=false;render();status('Zona 1 actualizada · '+state.total+
          ' filas vinculadas · '+state.rows.filter(row=>row.repair_only).length+
          ' con identidad desajustada en esta página.','ready');
        return true;
      }catch(_error){
        if(!valid()||current!==requestSeq)return false;
        loading=false;state.rows=[];state.columns=[];state.pages=0;state.total=0;
        state.selected.clear();render();status('No se pudo consultar Zona 1 con identidad y permisos verificados.','error');
        return false;
      }
    }
    function beginEdit(td){
      if(!valid()||!canEdit||saving||loading||editing||!td?.classList.contains('cua-mpz-canedit'))return;
      const id=td.closest('tr')?.dataset.mpzId,field=td.dataset.mpzField;
      const col=editableCols().find(c=>c.name===field),row=findRow(id);
      if(!col||!row||!row.id_dmp||!rowAllowed(col,row))return;
      const doc=root.ownerDocument||win.document;
      if(!doc||typeof doc.createElement!=='function')return;
      const original=row[field]??null;
      const input=doc.createElement('input');input.type=col.sqlType==='date'?'date':'text';
      input.value=original==null?'':String(original);
      input.maxLength=Number((/^varchar\((\d+)\)$/i.exec(col.sqlType)||[])[1])||150;
      input.inputMode=col.sqlType==='int'?'numeric':col.sqlType==='decimal(18,2)'?'decimal':'text';
      input.className='cua-mpz-edit-input';input.setAttribute('data-mpz-cell-input','');
      input.setAttribute('aria-label','Nuevo valor para '+label(col));
      editing={id,field,parent:String(row.id_dmp),original,td,committing:false};
      td.replaceChildren(input);td.classList.add('cua-mpz-editing');
      updateBulk();input.focus();input.select();
    }
    function cancelCellEdit(){
      if(!editing||editing.committing)return;
      const {td,original}=editing;editing=null;
      td.classList.remove('cua-mpz-editing');
      td.innerHTML='<span>'+ESC(display(original))+'</span>';
      td.focus();updateBulk();
    }
    async function saveCellEdit(){
      if(!canEdit||!valid()||saving||loading||!editing||editing.committing)return;
      const current=editing,{id,field,parent,original,td}=current;
      const input=td.querySelector('[data-mpz-cell-input]');if(!input)return;
      const value=input.value.trim()||null;
      if(value===(original==null||original===''?null:String(original))){cancelCellEdit();return;}
      current.committing=true;editing=null;saving=true;updateBulk();
      status('Guardando y auditando celda de Zona 1…');
      try{
        const response=await win.ManttoAuth.api(WRITE+'/'+encodeURIComponent(parent)+'/'+encodeURIComponent(id),{
          method:'PATCH',body:JSON.stringify({changes:{[field]:value},expected:{[field]:original}})
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='detalle_mp_2026_zona_1'||
          response.operation!=='edit'||String(response.id_dmp)!==parent||
          String(response.id_mp_zona_1)!==id||response.field!==field||
          typeof response.changed!=='boolean')throw new Error('Servidor no confirmó la operación.');
        saving=false;await load();
        if(valid())status(response.changed?'Celda guardada y auditada.':'Sin cambios.','ready');
      }catch(error){
        if(!valid())return;
        saving=false;await load();
        if(valid())status('No se guardó la celda: '+String(error?.message||'revisa permisos o conflictos.'),'error');
      }
    }
    async function saveBulk(event){
      event.preventDefault();if(!valid()||!canEdit||saving||loading||editing)return;
      const ids=[...state.selected],field=el('[data-mpz-bulk-field]')?.value||'';
      if(ids.length<2||ids.length>MAX_BULK||!editableCols().some(c=>c.name===field)||
        ids.some(id=>!rowAllowed(state.columns.find(c=>c.name===field),findRow(id))))return;
      const value=el('[data-mpz-bulk-null]')?.checked===true?null:
        (el('[data-mpz-bulk-input]')?.value||'').trim()||null;
      const expected={};
      for(const id of ids){
        const row=findRow(id);if(!row){status('Selección no confiable. Actualiza.','error');return;}
        expected[id]={[field]:row[field]??null};
      }
      if(typeof win.confirm==='function'&&!win.confirm('Modificar '+ids.length+' registros de Zona 1?'))return;
      saving=true;updateBulk();status('Guardando lote con auditoría…');
      try{
        const response=await win.ManttoAuth.api(API+'/edicion-multiple',{
          method:'PATCH',body:JSON.stringify({ids,changes:{[field]:value},expected})
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='detalle_mp_2026_zona_1'||
          response.operation!=='bulk'||response.field!==field||
          Number(response.total)!==ids.length)throw new Error('Lote sin confirmación del servidor.');
        saving=false;await load();
        if(valid())status(response.changed+' cambios guardados y auditados.','ready');
      }catch(error){
        if(!valid())return;
        saving=false;await load();
        if(valid())status('Lote no guardado: '+String(error?.message||'revisa permisos o conflictos.'),'error');
      }
    }
    function submit(event){
      if(event.target?.matches?.('[data-mpz-bulk-form]')){saveBulk(event).catch(()=>{});return;}
      if(!event.target?.matches?.('[data-mpz-form]'))return;
      event.preventDefault();if(!valid()||loading||saving||editing)return;
      const column=el('[data-mpz-filter-column]')?.value||'';
      const value=(el('[data-mpz-filter-value]')?.value||'').trim();
      if(value&&!column){status('Selecciona una columna para filtrar.','error');return;}
      state.search=(el('[data-mpz-search]')?.value||'').trim();
      state.filterColumn=column;state.filterValue=value;state.page=1;load().catch(()=>{});
    }
    function click(event){
      if(!valid()||loading||saving||editing)return;
      const sort=event.target?.closest?.('[data-mpz-sort]');
      if(sort){const key=sort.dataset.mpzSort;
        if(!state.columns.some(c=>c.name===key))return;
        state.order=state.sort===key&&state.order==='asc'?'desc':'asc';
        state.sort=key;state.page=1;load().catch(()=>{});return;
      }
      if(event.target?.closest?.('[data-mpz-prev]')&&state.page>1){state.page--;load().catch(()=>{});return;}
      if(event.target?.closest?.('[data-mpz-next]')&&state.page<state.pages){state.page++;load().catch(()=>{});return;}
      if(event.target?.closest?.('[data-mpz-reload]')){load().catch(()=>{});return;}
      if(event.target?.closest?.('[data-mpz-clear]')){
        state.page=1;state.search='';state.filterColumn='';state.filterValue='';
        state.sort='id_mp_zona_1';state.order='asc';
        for(const selector of ['[data-mpz-search]','[data-mpz-filter-value]']){
          const field=el(selector);if(field)field.value='';
        }
        const col=el('[data-mpz-filter-column]');if(col)col.value='';
        load().catch(()=>{});
      }
    }
    function change(event){
      if(!valid()||saving||loading||editing)return;
      if(canEdit&&event.target?.matches?.('[data-mpz-select]')){
        const id=String(event.target.value);
        if(!findRow(id)){event.target.checked=false;return;}
        if(event.target.checked){
          if(state.selected.size>=MAX_BULK){event.target.checked=false;
            status('Máximo 20 registros por lote.','error');return;}
          state.selected.add(id);
        }else state.selected.delete(id);
        renderBulkFields();return;
      }
      if(canEdit&&event.target?.matches?.('[data-mpz-bulk-field]')){
        updateBulkInput();return;
      }
      if(!event.target?.matches?.('[data-mpz-page-size]'))return;
      const size=Number(event.target.value);
      if(![15,25,50].includes(size))return;
      state.pageSize=size;state.page=1;load().catch(()=>{});
    }
    function keydown(event){
      if(event.target?.matches?.('[data-mpz-cell-input]')){
        if(event.key==='Escape'){event.preventDefault();cancelCellEdit();}
        else if(event.key==='Enter'){event.preventDefault();saveCellEdit().catch(()=>{});}
        return;
      }
      if(event.key==='Enter'&&event.target?.matches?.('td.cua-mpz-canedit')){
        event.preventDefault();beginEdit(event.target);
      }
    }
    function dblclick(event){beginEdit(event.target?.closest?.('td.cua-mpz-canedit'));}
    function focusout(event){
      if(event.target?.matches?.('[data-mpz-cell-input]'))saveCellEdit().catch(()=>{});
    }
    root.addEventListener('submit',submit);
    root.addEventListener('click',click);
    root.addEventListener('change',change);
    root.addEventListener('keydown',keydown);
    root.addEventListener('dblclick',dblclick);
    root.addEventListener('focusout',focusout);
    load().catch(()=>{});
    return Object.freeze({refresh:load,destroy(){
      disposed=true;requestSeq++;editing=null;state.selected.clear();
      for(const [name,handler] of [['submit',submit],['click',click],['change',change],
        ['keydown',keydown],['dblclick',dblclick],['focusout',focusout]])
        root.removeEventListener(name,handler);
      root.replaceChildren();
    }});
  }
  win.ManttoCobranzaMPZona1_uni=Object.freeze({mount});
})(window);
