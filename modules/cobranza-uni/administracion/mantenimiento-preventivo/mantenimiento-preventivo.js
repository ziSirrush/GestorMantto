(function(win,doc){
  'use strict';
  // [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_6_V001]
  // Edicion tipo Excel en tabla principal MP, con auditoria/alcance de backend.
  // MP conserva en exclusiva las pestanas MP / Zona 1; ambas tablas editan
  // celdas autorizadas mediante el mismo flujo Excel de GC.
  const API='/api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros';
  const RECONCILE_API='/api/cobranza-uni/administracion/tablas/detalle_mp_2026/conciliacion';
  const EXPECTED=20,MAX_BULK=20;
  const CLIENT_SAFE=new Set(['zona_adm','proyecto','idns','cliente','periodicidad',
    'momento_facturacion','estado','z_oper','forma_pago','factor_monto_anual','estatus_cartera']);
  const LABELS=Object.freeze({
    id_dmp:'Consecutivo',zona_adm:'ZONA ADM',proyecto:'PROYECTO',
    id_proyecto_cobranza:'ID Proyecto Cobranza',idns:'ID',cliente:'CLIENTE',
    periodicidad:'PERIODICIDAD',momento_facturacion:'MOMENTO DE FACTURACIÓN',
    estado:'Estado',z_oper:'Z.Oper',forma_pago:'FORMA DE PAGO',iguala:'IGUALA',
    factor_monto_anual:'FACTOR MONTO ANUAL',condiciones_pago:'CONDICIONES DE PAGO',
    monto_anual:'MONTO ANUAL',pendiente_corriente:'$ PENDIENTE CORRIENTE',
    pendiente_vencido:'$ PENDIENTE VENCIDO',pendiente:'$ PENDIENTE',
    facturas_pendientes:'N° DE FACTURAS PENDIENTES',estatus_cartera:'Activo / Inactivo'
  });
  const ESC=value=>String(value==null?'':value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const known=name=>Object.prototype.hasOwnProperty.call(LABELS,name);
  const isNumeric=col=>/^(?:decimal|int|bigint|smallint)/i.test(String(col?.sqlType||''));

  function mount(root,options={}){
    if(!root||typeof root.addEventListener!=='function')return null;
    const permitted=new Set((Array.isArray(options.editableFields)?options.editableFields:[])
      .filter(field=>CLIENT_SAFE.has(field)));
    const canEdit=options.canEdit===true && permitted.size>0 &&
      win.ManttoAuth?.isViewingAs?.()!==true;
    let disposed=false,requestId=0,saving=false,editing=null,reconcileRequestId=0;
    let zoneTab=null;
    const state={
      page:1,pageSize:50,search:'',filterColumn:'',filterValue:'',
      estatus:'',pendientes:'todos',sort:'id_dmp',order:'asc',
      columns:[],rows:[],total:0,pages:0,selected:new Set(),
      formulaById:new Map(),formulaSummary:null
    };
    const valid=()=>!disposed&&(typeof options.isCurrent!=='function'||options.isCurrent());
    const el=selector=>root.querySelector(selector);
    const getRow=id=>state.rows.find(row=>String(row?.id_dmp??'')===id);
    const setStatus=(message,kind='info')=>{
      const node=el('[data-mp-status]');
      if(node){node.textContent=message;node.dataset.kind=kind;}
    };
    const colLabel=column=>LABELS[column.name]||column.sheetHeader||column.name;
    const allowed=col=>canEdit && permitted.has(col.name) && col.kind==='editable' && col.editable===true;
    const editableCols=()=>state.columns.filter(allowed);

    root.innerHTML='<section class="cua-mp-admin" data-cua-mp-grid>'+
      '<div class="cua-mp-tabs" role="tablist" aria-label="Tablas MP">'+
        '<button type="button" role="tab" aria-selected="true" aria-controls="cua-mp-panel-principal" data-mp-tab="principal">MP</button>'+
        '<button type="button" role="tab" aria-selected="false" aria-controls="cua-mp-panel-zona1" data-mp-tab="zona1">Zona 1</button>'+
      '</div>'+
      '<div class="cua-mp-tabpanel" id="cua-mp-panel-principal" data-mp-panel="principal" role="tabpanel">'+
      '<div class="cua-mp-topline"><div><strong>Mantenimiento Preventivo</strong>'+
      '<p>Tabla principal · 20 columnas · fórmula anual en vista previa</p></div>'+
      '<span class="cua-mp-badge">'+(canEdit?'Edición autorizada · doble clic o Enter':'Solo consulta')+'</span></div>'+
      '<form class="cua-mp-filters" data-mp-form autocomplete="off">'+
        '<label class="cua-mp-search"><span>Buscar</span><input data-mp-search type="search" maxlength="120" placeholder="Proyecto, cliente, consecutivo, ID…" /></label>'+
        '<label><span>Columna</span><select data-mp-filter-column><option value="">Sin filtro de columna</option></select></label>'+
        '<label><span>Contiene</span><input data-mp-filter-value type="search" maxlength="120" placeholder="Texto de columna" /></label>'+
        '<label><span>Activo / Inactivo</span><select data-mp-estatus><option value="">Todos</option><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option><option value="Sin estado">Sin estado</option></select></label>'+
        '<label><span>Pendientes</span><select data-mp-pendientes><option value="todos">Todos</option><option value="importe">$ pendiente &gt; 0</option><option value="facturas">Facturas pendientes &gt; 0</option><option value="ambos">Ambas condiciones</option></select></label>'+
        '<button class="cua-mp-btn cua-mp-primary" type="submit">Aplicar filtros</button>'+
        '<button class="cua-mp-btn" type="button" data-mp-clear>Limpiar</button>'+
      '</form>'+
      '<div class="cua-mp-controls">'+
        '<label class="cua-mp-pagesize">Filas <select data-mp-page-size><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option></select></label>'+
        '<button class="cua-mp-btn" type="button" data-mp-reload>↻ Actualizar</button>'+
      '</div>'+
      (canEdit?'<form class="cua-mp-bulk" data-mp-bulk-form autocomplete="off">'+
        '<strong data-mp-selected-count>0 seleccionados (máx. 20)</strong>'+
        '<label>Campo <select data-mp-bulk-field aria-label="Campo de edición múltiple"></select></label>'+
        '<label>Nuevo valor <input data-mp-bulk-value maxlength="150" placeholder="Nuevo valor" /></label>'+
        '<label class="cua-mp-null"><input type="checkbox" data-mp-bulk-null /> Vaciar (NULL)</label>'+
        '<button type="submit" class="cua-mp-btn cua-mp-primary" data-mp-bulk-apply disabled>Aplicar y auditar lote</button>'+
        '</form>':'')+
      '<p class="cua-mp-help">Se conserva el importe almacenado. Monto anual previsto = IGUALA × FACTOR, calculado en el servidor y nunca guardado desde la consulta. '+
        (canEdit?'Solo los campos autorizados por el backend se pueden editar; los cálculos e identificadores están protegidos.' :
        'Consulta de solo lectura; para editar se requieren permisos y habilitación del servidor.')+'</p>'+
      '<div class="cua-mp-status" data-mp-status role="status" aria-live="polite">Cargando registros…</div>'+
      '<div class="cua-mp-formula-summary" data-mp-formula-summary role="status" aria-live="polite">Previsualización pendiente…</div>'+
      '<section class="cua-mp-reconcile" aria-label="Conciliación de MP">'+
        '<div><strong>Conciliación de MP y Zona 1</strong><small>Solo lectura; datos limitados a tus proyectos autorizados. No sustituye la conciliación completa con Sheets.</small></div>'+
        '<button class="cua-mp-btn" type="button" data-mp-reconcile>Consultar conciliación</button>'+
        '<div data-mp-reconcile-report class="cua-mp-reconcile-result" role="status" aria-live="polite">Pendiente de consulta · solo diagnóstico.</div>'+
      '</section>'+
      '<div class="cua-mp-scroll" tabindex="0" role="region" aria-label="Mantenimiento Preventivo: tabla desplazable">'+
        '<table class="cua-mp-table"><thead data-mp-head></thead><tbody data-mp-body></tbody></table>'+
      '</div>'+
      '<nav class="cua-mp-pager" aria-label="Paginación de Mantenimiento Preventivo">'+
        '<span data-mp-range>Sin datos</span><div class="cua-mp-pager-actions">'+
        '<button class="cua-mp-btn" type="button" data-mp-prev disabled>← Anterior</button>'+
        '<span data-mp-page>Página 1</span>'+
        '<button class="cua-mp-btn" type="button" data-mp-next disabled>Siguiente →</button>'+ 
        '</div></nav>'+
      '</div>'+
      '<div class="cua-mp-tabpanel" id="cua-mp-panel-zona1" data-mp-panel="zona1" role="tabpanel" hidden>'+
        '<div class="cua-mp-zona1-grid" data-mp-zona1-grid></div>'+
      '</div>'+
      '</section>';

    function updateBulk(){
      if(!canEdit)return;
      const counter=el('[data-mp-selected-count]');
      if(counter)counter.textContent=state.selected.size+' seleccionados (máx. '+MAX_BULK+')';
      const action=el('[data-mp-bulk-apply]');
      if(action)action.disabled=saving||Boolean(editing)||state.selected.size<2||state.selected.size>MAX_BULK;
    }
    function render(){
      if(!valid())return;
      const columns=state.columns;
      const scroll=el('.cua-mp-scroll');
      const left=scroll?.scrollLeft||0,top=scroll?.scrollTop||0;
      const filter=el('[data-mp-filter-column]');
      if(filter){
        const previous=state.filterColumn;
        filter.innerHTML='<option value="">Sin filtro de columna</option>'+state.columns.map(c=>
          '<option value="'+ESC(c.name)+'"'+(previous===c.name?' selected':'')+'>'+ESC(colLabel(c))+'</option>').join('');
      }
      const bulk=el('[data-mp-bulk-field]');
      if(bulk){
        const old=bulk.value;
        bulk.innerHTML=editableCols().map(col=>'<option value="'+ESC(col.name)+'">'+ESC(colLabel(col))+'</option>').join('');
        if(editableCols().some(col=>col.name===old))bulk.value=old;
      }
      const summary=el('[data-mp-formula-summary]');
      if(summary){
        const m=state.formulaSummary;
        summary.textContent=m
          ? 'Vista previa (sin guardar) · '+m.ready+' cálculos disponibles · '+
            m.missing_factor+' sin factor · '+m.amount_differences+
            ' montos distintos al valor guardado · '+m.pending_differences+
            ' diferencias orientativas de cartera.'
          : 'Vista previa del monto anual pendiente de consulta.';
      }
      const head=el('[data-mp-head]'),body=el('[data-mp-body]');
      if(head)head.innerHTML='<tr>'+columns.map(column=>{
        const name=column.name;
        const indicator=state.sort===name?(state.order==='asc'?' ↑':' ↓'):'';
        const aria=state.sort===name?(state.order==='asc'?'ascending':'descending'):'none';
        return '<th scope="col" aria-sort="'+aria+'" data-mp-kind="'+ESC(column.kind)+'">'+
          '<button type="button" data-mp-sort="'+ESC(name)+'" title="Ordenar por '+ESC(colLabel(column))+'">'+ESC(colLabel(column))+indicator+'</button>'+ 
          '<small>'+(column.kind==='derived'?'Origen / cálculo':column.kind==='protected'?'Identificador protegido':allowed(column)?'Editable · auditado':'Solo consulta')+'</small></th>';
      }).join('')+'</tr>';
      if(body){
        body.innerHTML=state.rows.length?state.rows.map(row=>{
          const id=String(row?.id_dmp??'');
          const preview=state.formulaById.get(id);
          return '<tr data-mp-id="'+ESC(id)+'">'+columns.map(column=>{
            const raw=Object.prototype.hasOwnProperty.call(row,column.name)?row[column.name]:null;
            const value=raw===null||raw===undefined||raw===''?'—':String(raw);
            const selector=canEdit&&column.name==='id_dmp'
              ?'<label class="cua-mp-select"><input type="checkbox" data-mp-select value="'+ESC(id)+'"'+(state.selected.has(id)?' checked':'')+' aria-label="Seleccionar MP '+ESC(id)+'" /> <span>'+ESC(value)+'</span></label>'
              :'<span>'+ESC(value)+'</span>';
            let detail='';
            if(column.name==='monto_anual' && preview){
              const result=preview.monto_anual;
              if(result.status==='ready'){
                detail='<small class="cua-mp-formula-tag'+(result.matches_stored?'':' cua-mp-formula-diff')+'">'+
                  'Previsto: '+ESC(result.calculated)+(result.matches_stored?' · coincide':' · revisar diferencia')+
                  ' · no guardado</small>';
              }else if(result.status==='sin_factor'){
                detail='<small class="cua-mp-formula-tag cua-mp-formula-pending">Sin factor · se conserva el monto actual</small>';
              }else if(result.status==='sin_iguala'){
                detail='<small class="cua-mp-formula-tag cua-mp-formula-pending">Sin IGUALA · cálculo pendiente</small>';
              }else{
                detail='<small class="cua-mp-formula-tag cua-mp-formula-diff">No calculable · revisar datos</small>';
              }
            }
            if(column.name==='pendiente' && preview?.pendiente?.status==='different'){
              detail='<small class="cua-mp-formula-tag cua-mp-formula-diff">'+
                'Corriente + vencido: '+ESC(preview.pendiente.component_sum)+
                ' · diferencia orientativa, sin recalcular</small>';
            }
            return '<td class="cua-mp-cell'+(isNumeric(column)?' cua-mp-numeric':'')+(allowed(column)?' cua-mp-canedit':'')+'" data-mp-field="'+ESC(column.name)+'" data-mp-kind="'+ESC(column.kind)+'"'+
              (allowed(column)?' tabindex="0" role="button" aria-label="Editar '+ESC(colLabel(column))+' del registro '+ESC(id)+'"':'')+
              ' title="'+ESC(value)+'">'+selector+detail+'</td>';
          }).join('')+'</tr>';
        }).join(''):'<tr><td class="cua-mp-empty" colspan="'+Math.max(1,columns.length)+'">No se encontraron registros con los filtros seleccionados.</td></tr>';
      }
      const previous=el('[data-mp-prev]'),next=el('[data-mp-next]');
      if(previous)previous.disabled=saving||state.page<=1;
      if(next)next.disabled=saving||state.page>=state.pages;
      const pg=el('[data-mp-page]');
      if(pg)pg.textContent='Página '+state.page+' de '+Math.max(1,state.pages);
      const range=el('[data-mp-range]');
      if(range)range.textContent=state.total+' registros encontrados';
      updateBulk();
      if(scroll){scroll.scrollLeft=left;scroll.scrollTop=top;}
    }
    async function reconcile(){
      if(!valid()||saving)return false;
      const request=++reconcileRequestId;
      const output=el('[data-mp-reconcile-report]');
      if(output)output.textContent='Consultando Aiven en modo lectura…';
      try{
        const report=await win.ManttoAuth.apiGet(RECONCILE_API);
        if(!valid()||request!==reconcileRequestId)return false;
        if(report?.ok!==true||report.mode!=='diagnostic_only'||report.readonly!==true||
          report.cutover_ready!==false||report.gas_must_remain_active!==true||
          !report.schema||typeof report.status!=='string')
          throw new Error('Respuesta de conciliación no confiable.');
        let note='Esquema: '+(report.schema.matches?'válido':'REVISAR')+
          ' · MP 20 / Zona 1 128 columnas esperadas.';
        if(report.counts){
          const c=report.counts;
          const expected=['mp_visibles','zona1_vinculadas','zona1_sin_vinculo',
            'identidad_conflictiva','buscarv_diferencias','buscarv_sin_dato',
            'monto_anual_discrepante','pendiente_discrepante','facturas_con_campos'];
          if(!expected.every(key=>Number.isSafeInteger(c[key])&&c[key]>=0))
            throw new Error('Métricas incompletas.');
          note+=' · MP visibles '+c.mp_visibles+' · Zona 1 vinculadas '+c.zona1_vinculadas+
            ' · Sin Zona 1 '+c.zona1_sin_vinculo+' · Identidad en conflicto '+c.identidad_conflictiva+
            ' · Diferencias BUSCARV '+c.buscarv_diferencias+' · Datos BUSCARV faltantes '+c.buscarv_sin_dato+
            ' · Diferencias monto anual '+c.monto_anual_discrepante+
            ' · Diferencias pendiente '+c.pendiente_discrepante+
            ' · Espacios de factura con datos '+c.facturas_con_campos+'.';
        }
        note+=' · Estado: '+report.status+'. Este diagnóstico no habilita cambios de configuración ni escritura de Zona 1.';
        if(output){output.textContent=note;output.dataset.kind=report.status==='SIN_DIFERENCIAS_DETECTADAS_EN_ALCANCE'?'info':'warning';}
        return true;
      }catch(error){
        if(!valid()||request!==reconcileRequestId)return false;
        if(output){output.textContent='No se pudo verificar la conciliación. No cambiar configuración ni habilitar Zona 1 por este resultado.';
          output.dataset.kind='error';}
        return false;
      }
    }
    async function load(){
      if(!valid()||saving)return false;
      if(editing)cancelCellEdit();
      const current=++requestId;
      setStatus('Consultando registros…');
      const query=new URLSearchParams({
        page:String(state.page),page_size:String(state.pageSize),
        search:state.search,filter_column:state.filterColumn,filter_value:state.filterValue,
        estatus:state.estatus,pendientes:state.pendientes,sort:state.sort,order:state.order
      });
      try{
        const response=await win.ManttoAuth.apiGet(API+'?'+query.toString());
        if(!valid()||current!==requestId)return false;
        if(response?.ok!==true||response.table!=='detalle_mp_2026'||response.readonly!==true||
          !Array.isArray(response.columns)||!Array.isArray(response.rows)||
          Number(response.total)<0||!Number.isSafeInteger(Number(response.total)))
          throw new Error('Respuesta de MP inválida.');
        const cols=response.columns.filter(col=>col&&known(col.name)&&
          ['editable','protected','derived'].includes(col.kind));
        if(cols.length!==EXPECTED||new Set(cols.map(col=>col.name)).size!==EXPECTED)
          throw new Error('Contrato MP F1 incompleto.');
        // El servidor calcula sobre las MISMAS filas territorialmente filtradas.
        // Nunca acepta IDs adicionales, duplicados ni preview sin correspondencia.
        const preview=response.formula_preview;
        if(preview?.mode!=='preview_only'||preview.table!=='detalle_mp_2026'||
          !Array.isArray(preview.rows)||preview.rows.length!==response.rows.length||
          preview.expression!=='iguala * factor_monto_anual'||!preview.summary)
          throw new Error('Vista previa de calculo MP incompleta.');
        const byId=new Map();
        for(const item of preview.rows){
          if(typeof item?.id_dmp!=='string'||byId.has(item.id_dmp)||
            !item.monto_anual||!item.pendiente)throw new Error('Vista previa MP inconsistente.');
          byId.set(item.id_dmp,item);
        }
        for(const row of response.rows){
          if(!byId.has(String(row.id_dmp)))throw new Error('Vista previa MP no coincide con los registros.');
        }
        state.formulaById=byId;state.formulaSummary=preview.summary;
        state.columns=cols;state.rows=response.rows;
        state.total=Number(response.total);state.pages=Number(response.pages)||0;
        state.selected.clear();
        render();
        setStatus(canEdit?'Consulta actualizada · edición sujeta a auditoría.':
          'Consulta actualizada · solo lectura.','ready');
        return true;
      }catch(error){
        if(!valid()||current!==requestId)return false;
        state.rows=[];state.total=0;state.pages=0;state.selected.clear();
        state.formulaById=new Map();state.formulaSummary=null;
        render();setStatus('No fue posible cargar MP. Verifica los filtros o los permisos.','error');
        return false;
      }
    }
    function selectTab(name){
      if(!valid()||saving||editing||!['principal','zona1'].includes(name))return false;
      const mpPanel=el('[data-mp-panel="principal"]');
      const zonePanel=el('[data-mp-panel="zona1"]');
      if(!mpPanel||!zonePanel)return false;
      if(name==='zona1'&&!zoneTab){
        const node=el('[data-mp-zona1-grid]');
        const mount=win.ManttoCobranzaMPZona1_uni?.mount;
        if(typeof mount!=='function'||!node){
          setStatus('La pestaña Zona 1 no está disponible: falta el módulo de consulta.','error');
          return false;
        }
        const instance=mount(node,{isCurrent:valid,canEdit:options.canWriteZone1===true,
          editableFields:options.zona1EditableFields||[]});
        if(!instance){setStatus('No se pudo iniciar la pestaña Zona 1.','error');return false;}
        zoneTab=instance;
      }
      mpPanel.hidden=name!=='principal';zonePanel.hidden=name!=='zona1';
      root.querySelectorAll('[data-mp-tab]').forEach(button=>{
        button.setAttribute('aria-selected',String(button.dataset.mpTab===name));
      });
      return true;
    }
    function openEdit(td){
      if(!canEdit||saving||editing||!valid()||!td?.classList.contains('cua-mp-canedit'))return;
      const field=td.dataset.mpField,id=td.closest('tr')?.dataset.mpId;
      const col=state.columns.find(c=>c.name===field),row=getRow(id);
      if(!col||!allowed(col)||!row)return;
      const old=row[field]??null;
      const input=doc.createElement('input');input.type='text';
      input.value=old==null?'':String(old);
      input.maxLength=col.name==='factor_monto_anual'?5:(Number((/varchar\((\d+)\)/i.exec(col.sqlType||'')||[])[1])||150);
      input.inputMode=col.name==='factor_monto_anual'?'numeric':'text';
      input.className='cua-mp-edit-input';input.setAttribute('data-mp-cell-input','');
      input.setAttribute('aria-label','Nuevo valor para '+colLabel(col));
      editing={id,field,old,td,committing:false};
      td.replaceChildren(input);td.classList.add('cua-mp-editing');
      updateBulk();input.focus();input.select();
    }
    function cancelCellEdit(){
      if(saving||!editing||editing.committing)return;
      const {td,old}=editing;editing=null;
      td.classList.remove('cua-mp-editing');
      td.innerHTML='<span>'+ESC(old==null||old===''?'—':old)+'</span>';
      td.focus();updateBulk();
    }
    function updateBusy(value){saving=value;updateBulk();}
    async function saveSingle(){
      if(!canEdit||!valid()||saving||!editing||editing.committing)return;
      const current=editing,{id,field,old,td}=current;
      const input=td.querySelector('[data-mp-cell-input]');if(!input)return;
      const value=input.value.trim()||null;
      if(value===(old==null||old===''?null:String(old))){cancelCellEdit();return;}
      current.committing=true;editing=null;
      updateBusy(true);setStatus('Guardando y auditando registro MP '+id+'…');
      try{
        const response=await win.ManttoAuth.api(API+'/'+encodeURIComponent(id),{
          method:'PATCH',body:JSON.stringify({changes:{[field]:value},expected:{[field]:old}})
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='detalle_mp_2026'||response.field!==field||
          Number(response.total)!==1)throw new Error('El servidor no confirmo la edicion.');
        updateBusy(false);await load();
        if(valid())setStatus(response.changed===1?'Cambio guardado y auditado.':'Sin cambios.','ready');
      }catch(error){if(valid()){updateBusy(false);await load();if(valid())setStatus('No se guardó MP: '+String(error?.message||'revisa conflicto, alcance o permisos.'),'error');}}
    }
    async function saveBulk(){
      if(!canEdit||!valid()||saving||editing||state.selected.size<2||state.selected.size>MAX_BULK)return;
      const field=el('[data-mp-bulk-field]')?.value||'';
      const col=state.columns.find(c=>c.name===field);
      if(!col||!allowed(col))return;
      const nullable=el('[data-mp-bulk-null]')?.checked===true;
      const raw=el('[data-mp-bulk-value]')?.value??'';
      const value=nullable?null:raw.trim()||null;
      const ids=[...state.selected].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
      const expected={};
      for(const id of ids){
        const row=getRow(id);
        if(!row)return;
        expected[id]={[field]:row[field]??null};
      }
      if(typeof win.confirm==='function'&&!win.confirm('Aplicar '+colLabel(col)+' a '+ids.length+' registros MP?'))return;
      updateBusy(true);setStatus('Guardando lote de MP en una sola transacción…');
      try{
        const response=await win.ManttoAuth.api(API+'/edicion-multiple',{
          method:'PATCH',body:JSON.stringify({ids,changes:{[field]:value},expected})
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='detalle_mp_2026'||
          response.field!==field||Number(response.total)!==ids.length)
          throw new Error('El servidor no confirmo el lote.');
        updateBusy(false);await load();
        if(valid())setStatus(response.changed+' registros guardados y auditados.','ready');
      }catch(error){if(valid()){updateBusy(false);await load();if(valid())setStatus('Lote no guardado: '+String(error?.message||'revisa alcance, permisos o valores originales.'),'error');}}
    }
    root.addEventListener('submit',event=>{
      const target=event.target;
      if(target?.matches?.('[data-mp-form]')){
        event.preventDefault();if(!valid()||saving||editing)return;
        state.search=el('[data-mp-search]')?.value?.trim()||'';
        state.filterColumn=el('[data-mp-filter-column]')?.value||'';
        state.filterValue=el('[data-mp-filter-value]')?.value?.trim()||'';
        state.estatus=el('[data-mp-estatus]')?.value||'';
        state.pendientes=el('[data-mp-pendientes]')?.value||'todos';
        state.page=1;load().catch(()=>{});
      }else if(target?.matches?.('[data-mp-bulk-form]')){
        event.preventDefault();saveBulk().catch(()=>{});
      }
    });
    root.addEventListener('click',event=>{
      if(!valid()||saving||editing)return;
      if(event.target.closest?.('[data-mp-reconcile]')){reconcile().catch(()=>{});return;}
      const tab=event.target.closest?.('[data-mp-tab]');
      if(tab){selectTab(tab.dataset.mpTab);return;}
      const sort=event.target.closest?.('[data-mp-sort]');
      if(sort){
        const name=sort.dataset.mpSort;
        if(!known(name)||!state.columns.some(col=>col.name===name))return;
        state.order=state.sort===name&&state.order==='asc'?'desc':'asc';
        state.sort=name;state.page=1;load().catch(()=>{});return;
      }
      if(event.target.closest?.('[data-mp-prev]')&&state.page>1){state.page--;load().catch(()=>{});return;}
      if(event.target.closest?.('[data-mp-next]')&&state.page<state.pages){state.page++;load().catch(()=>{});return;}
      if(event.target.closest?.('[data-mp-reload]')){load().catch(()=>{});return;}
      if(event.target.closest?.('[data-mp-clear]')){
        state.page=1;state.search='';state.filterColumn='';state.filterValue='';state.estatus='';state.pendientes='todos';
        const form=el('[data-mp-form]');if(form)form.reset();
        load().catch(()=>{});
      }
    });
    root.addEventListener('change',event=>{
      if(!valid()||saving||editing)return;
      if(event.target?.matches?.('[data-mp-page-size]')){
        const size=Number(event.target.value);
        if(![25,50,100].includes(size))return;
        state.pageSize=size;state.page=1;load().catch(()=>{});
        return;
      }
      if(canEdit&&event.target?.matches?.('[data-mp-bulk-field]')){
        const input=el('[data-mp-bulk-value]');
        if(input){const factor=event.target.value==='factor_monto_anual';
          input.maxLength=factor?5:150;input.inputMode=factor?'numeric':'text';}
        return;
      }
      if(canEdit&&event.target?.matches?.('[data-mp-select]')){
        const id=String(event.target.value||'');
        if(!getRow(id))return;
        if(event.target.checked){
          if(state.selected.size>=MAX_BULK){event.target.checked=false;return;}
          state.selected.add(id);
        }else{state.selected.delete(id);}
        updateBulk();
      }
    });
    root.addEventListener('keydown',event=>{
      if(event.target.matches?.('[data-mp-cell-input]')){
        if(event.key==='Escape'){event.preventDefault();cancelCellEdit();}
        else if(event.key==='Enter'){event.preventDefault();saveSingle().catch(()=>{});}
        return;
      }
      if(event.key==='Enter'&&event.target.matches?.('td.cua-mp-canedit')){
        event.preventDefault();openEdit(event.target);return;
      }
    });
    root.addEventListener('dblclick',event=>openEdit(event.target.closest?.('td.cua-mp-canedit')));
    root.addEventListener('focusout',event=>{
      if(event.target.matches?.('[data-mp-cell-input]'))saveSingle().catch(()=>{});
    });
    load().catch(()=>{});
    return Object.freeze({destroy(){disposed=true;requestId++;reconcileRequestId++;editing=null;if(zoneTab)zoneTab.destroy();zoneTab=null;state.selected.clear();root.replaceChildren();}});
  }
  win.ManttoCobranzaAdministracionMP_uni=Object.freeze({mount});
})(window,document);
