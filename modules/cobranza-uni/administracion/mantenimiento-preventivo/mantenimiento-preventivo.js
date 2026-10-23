(function(win,doc){
  'use strict';
  // [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_6_V001]
  // F5: consulta detalle de Zona 1 por id_dmp validado, sin cruzar nombres.
  // Las 12 facturaciones son consulta historica; GAS sigue activo.
  const API='/api/cobranza-uni/administracion/tablas/detalle_mp_2026/registros';
  const RECONCILE_API='/api/cobranza-uni/administracion/tablas/detalle_mp_2026/conciliacion';
  const EXPECTED=20,MAX_BULK=20;
  const ZONE1_ADMIN_API='/api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1';
  const ZONE1_FIELDS=Object.freeze([
    'facturacion','fecha_pago','estatus_factura','fecha_factura','numero_factura',
    'vencimiento','dias_vencimiento','estatus','forma_pago'
  ]);
  const ZONE1_LABELS=Object.freeze({
    facturacion:'FACTURACIÓN',fecha_pago:'FECHA DE PAGO',
    estatus_factura:'ESTATUS FACTURA',fecha_factura:'FECHA FACTURA',
    numero_factura:'NO. FACTURA',vencimiento:'VENCIMIENTO',
    dias_vencimiento:'DÍAS DE VENCIMIENTO',estatus:'ESTATUS',forma_pago:'FORMA DE PAGO'
  });
  const CLIENT_SAFE=new Set(['zona_adm','periodicidad','momento_facturacion','forma_pago','factor_monto_anual']);
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
  const GROUPS=Object.freeze({
    resumen:Object.freeze({label:'Resumen',fields:Object.freeze([
      'id_dmp','proyecto','cliente','idns','zona_adm','periodicidad',
      'monto_anual','pendiente','facturas_pendientes','estatus_cartera'
    ])}),
    contrato:Object.freeze({label:'Contrato',fields:Object.freeze([
      'id_dmp','proyecto','id_proyecto_cobranza','idns','cliente','zona_adm',
      'periodicidad','momento_facturacion','estado','z_oper','forma_pago',
      'iguala','factor_monto_anual','condiciones_pago','monto_anual','estatus_cartera'
    ])}),
    cartera:Object.freeze({label:'Cartera',fields:Object.freeze([
      'id_dmp','proyecto','cliente','condiciones_pago','monto_anual',
      'pendiente_corriente','pendiente_vencido','pendiente','facturas_pendientes','estatus_cartera'
    ])}),
    todas:Object.freeze({label:'20 columnas',fields:null})
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
    const canPrepareZone1=options.canPrepareZone1===true && win.ManttoAuth?.isViewingAs?.()!==true;
    const canWriteZone1=canPrepareZone1 && options.canWriteZone1===true;
    let disposed=false,requestId=0,saving=false,editing=null,zoneRequestId=0,reconcileRequestId=0;
    let zone1State=null,zone1Preview=null;
    const state={
      page:1,pageSize:50,search:'',filterColumn:'',filterValue:'',
      estatus:'',pendientes:'todos',sort:'id_dmp',order:'asc',
      columns:[],rows:[],total:0,pages:0,group:'resumen',selected:new Set(),
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
    const visibleColumns=()=>{
      const fields=GROUPS[state.group].fields;
      return fields===null?state.columns:state.columns.filter(col=>fields.includes(col.name));
    };

    root.innerHTML='<section class="cua-mp-admin" data-cua-mp-grid>'+
      '<div class="cua-mp-topline"><div><strong>Mantenimiento Preventivo</strong>'+
      '<p>Tabla principal · 20 columnas · fórmula anual en vista previa · facturación Zona 1 por registro</p></div>'+
      '<span class="cua-mp-badge">'+(canEdit?'Edición autorizada · auditada':'Solo consulta · GAS activo')+'</span></div>'+
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
        '<nav class="cua-mp-groups" aria-label="Grupos de columnas de mantenimiento">'+
        Object.entries(GROUPS).map(([name,meta])=>
          '<button class="cua-mp-btn cua-mp-group" type="button" data-mp-group="'+name+'" aria-pressed="'+(name===state.group)+'">'+ESC(meta.label)+'</button>'
        ).join('')+'</nav>'+
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
        (canEdit?'Solo se permiten campos F3 expresamente aprobados; otros cálculos e identidades están protegidos.' :
        'La edición requiere terminar y autorizar el corte de GAS de GC, VA y MP.')+'</p>'+
      '<div class="cua-mp-status" data-mp-status role="status" aria-live="polite">Cargando registros…</div>'+
      '<div class="cua-mp-formula-summary" data-mp-formula-summary role="status" aria-live="polite">Previsualización pendiente…</div>'+
      '<section class="cua-mp-reconcile" aria-label="Conciliación de MP">'+
        '<div><strong>Conciliación de MP y Zona 1</strong><small>Solo lectura; datos limitados a tus proyectos autorizados. No sustituye la conciliación completa con Sheets.</small></div>'+
        '<button class="cua-mp-btn" type="button" data-mp-reconcile>Consultar conciliación</button>'+
        '<div data-mp-reconcile-report class="cua-mp-reconcile-result" role="status" aria-live="polite">Pendiente de consulta · GAS sigue activo.</div>'+
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
      '<div class="cua-mp-zona1-dialog" data-mp-zona1-dialog hidden>'+
        '<div class="cua-mp-zona1-backdrop" data-mp-zona1-close></div>'+
        '<section class="cua-mp-zona1-panel" role="dialog" aria-modal="true" aria-labelledby="cua-mp-zona1-title">'+
          '<header><div><p>DETALLE MP 2026 ZONA 1 · Solo lectura</p>'+
            '<h3 id="cua-mp-zona1-title">Facturación · MP <span data-mp-zona1-id></span></h3></div>'+
            '<button type="button" class="cua-mp-btn" data-mp-zona1-close>Cerrar</button></header>'+
          '<div class="cua-mp-zona1-status" data-mp-zona1-status role="status" aria-live="polite">Consulta pendiente</div>'+
          '<div class="cua-mp-zona1-content" data-mp-zona1-content></div>'+
          '<div class="cua-mp-zona1-actions" data-mp-zona1-actions></div>'+
        '</section></div>'+
      (canEdit?'<div class="cua-mp-dialog" data-mp-dialog hidden>'+ 
        '<div class="cua-mp-dialog-backdrop" data-mp-close></div>'+ 
        '<section class="cua-mp-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="cua-mp-dialog-title">'+
          '<header><h3 id="cua-mp-dialog-title">Editar registro <span data-mp-dialog-id></span></h3>'+
          '<button class="cua-mp-btn" type="button" data-mp-close>Cerrar</button></header>'+
          '<form data-mp-edit-form autocomplete="off">'+
            '<p data-mp-edit-label></p><p><b>Valor original:</b> <span data-mp-edit-before></span></p>'+
            '<label>Nuevo valor <input data-mp-edit-value type="text" maxlength="150" /></label>'+
            '<label class="cua-mp-null"><input type="checkbox" data-mp-edit-null /> Vaciar (NULL)</label>'+
            '<button class="cua-mp-btn cua-mp-primary" type="submit">Guardar y auditar</button>'+
          '</form></section></div>':'')+
      '</section>';

    function updateBulk(){
      if(!canEdit)return;
      const counter=el('[data-mp-selected-count]');
      if(counter)counter.textContent=state.selected.size+' seleccionados (máx. '+MAX_BULK+')';
      const action=el('[data-mp-bulk-apply]');
      if(action)action.disabled=saving||state.selected.size<2||state.selected.size>MAX_BULK;
    }
    function render(){
      if(!valid())return;
      const columns=visibleColumns();
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
            const zoneLink=column.name==='id_dmp'
              ? '<button class="cua-mp-btn cua-mp-zone1-open" type="button" data-mp-zona1="'+ESC(id)+'" aria-label="Consultar 12 facturaciones Zona 1 del registro '+ESC(id)+'">Facturación Zona 1</button>'
              : '';
            const action=zoneLink;
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
              ' title="'+ESC(value)+'">'+selector+detail+action+'</td>';
          }).join('')+'</tr>';
        }).join(''):'<tr><td class="cua-mp-empty" colspan="'+Math.max(1,columns.length)+'">No se encontraron registros con los filtros seleccionados.</td></tr>';
      }
      for(const btn of root.querySelectorAll('[data-mp-group]'))
        btn.setAttribute('aria-pressed',String(btn.dataset.mpGroup===state.group));
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
        note+=' · Estado: '+report.status+'. NO autoriza apagar GAS ni editar datos.';
        if(output){output.textContent=note;output.dataset.kind=report.status==='SIN_DIFERENCIAS_DETECTADAS_EN_ALCANCE'?'info':'warning';}
        return true;
      }catch(error){
        if(!valid()||request!==reconcileRequestId)return false;
        if(output){output.textContent='No se pudo verificar la conciliación. No habilitar escritura ni detener GAS.';
          output.dataset.kind='error';}
        return false;
      }
    }
    async function load(){
      if(!valid()||saving)return false;
      closeZona1();
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
    // El detalle Zona 1 NO habilita acceso a un cuarto ni modifica saldos.
    // Se consulta una fila por id_dmp, con identidad y alcance verificados por backend.
    function zoneLabel(meta){
      const matched=/^(.+)_\d{2}$/.exec(meta.name);
      return matched?ZONE1_LABELS[matched[1]]||meta.name:
        LABELS[meta.name]||meta.sheetHeader||meta.name;
    }
    const zoneValue=value=>value===null||value===undefined||value===''?'—':String(value);
    function closeZona1(){
      ++zoneRequestId;zone1State=null;zone1Preview=null;
      const dialog=el('[data-mp-zona1-dialog]');if(dialog)dialog.hidden=true;
      const content=el('[data-mp-zona1-content]');if(content)content.innerHTML='';
      const actions=el('[data-mp-zona1-actions]');if(actions)actions.innerHTML='';
    }
    function renderZona1(response){
      const content=el('[data-mp-zona1-content]');if(!content)return;
      if(response.linked===false){
        content.innerHTML='<p class="cua-mp-zona1-unlinked">No existe una fila de Zona 1 vinculada mediante id_dmp. No se utilizará el nombre del proyecto como búsqueda alternativa.</p>';
        return;
      }
      const meta=response.columns;
      const row=response.row;
      const general=meta.filter(c=>c.sheetColumn&&!/_\d{2}$/.test(c.name));
      const comparison=response.lookup_preview;
      const matchText={match:'Coincide',different:'Diferente',missing:'Sin dato',invalid:'Dato inválido'};
      const preview=comparison.comparisons.map(item=>
        '<tr><th scope="row">'+ESC(LABELS[item.field]||item.field)+'</th>'+ 
        '<td>'+ESC(zoneValue(item.main_value))+'</td>'+ 
        '<td>'+ESC(zoneValue(item.zone1_value))+'</td>'+ 
        '<td data-zona1-match="'+ESC(item.status)+'">'+ESC(matchText[item.status]||'Revisar')+'</td></tr>'
      ).join('');
      const generalCards=general.map(c=>
        '<div class="cua-mp-zona1-general-field"><dt>'+ESC(zoneLabel(c))+'</dt>'+ 
        '<dd>'+ESC(zoneValue(row[c.name]))+'</dd></div>'
      ).join('');
      const blocks=Array.from({length:12},(_,i)=>{
        const number=String(i+1).padStart(2,'0');
        const cols=ZONE1_FIELDS.map(name=>meta.find(c=>c.name===name+'_'+number));
        const hasValues=cols.some(c=>row[c.name]!==null&&row[c.name]!==undefined&&row[c.name]!=='');
        return '<section class="cua-mp-zona1-block">'+
          '<h5>Facturación '+number+' <small>'+(hasValues?'Con datos':'Sin captura')+'</small></h5>'+ 
          '<dl>'+cols.map(c=>'<div><dt>'+ESC(zoneLabel(c))+'</dt><dd>'+ 
            ESC(zoneValue(row[c.name]))+'</dd></div>').join('')+'</dl></section>';
      }).join('');
      content.innerHTML=
        '<p class="cua-mp-zona1-info">Vínculo verificado por id_dmp y proyecto. Fuente Zona 1: los importes y estados se muestran sin recalcular ni guardar.</p>'+ 
        '<section class="cua-mp-zona1-section"><h4>Datos generales · 16 columnas</h4>'+ 
          '<dl class="cua-mp-zona1-general">'+generalCards+'</dl></section>'+ 
        '<section class="cua-mp-zona1-section"><h4>Comparativo con MP principal · BUSCARV original</h4>'+ 
          '<p class="cua-mp-zona1-info">Solo vista previa · '+ESC(comparison.summary.match)+' coinciden · '+ 
          ESC(comparison.summary.different)+' diferentes · '+ESC(comparison.summary.missing)+' sin dato · '+ 
          ESC(comparison.summary.invalid)+' inválidos. No sincroniza valores.</p>'+ 
          '<div class="cua-mp-zona1-compare-scroll"><table><thead><tr><th>Campo</th><th>MP principal</th><th>Zona 1</th><th>Comparación</th></tr></thead>'+ 
          '<tbody>'+preview+'</tbody></table></div></section>'+ 
        '<section class="cua-mp-zona1-section"><h4>12 bloques de facturación · 9 campos por bloque</h4>'+ 
          '<div class="cua-mp-zona1-blocks">'+blocks+'</div></section>';
    }
    // F6: preparation only while GAS is active. No submit persists data.
    const invoiceCandidates=()=>Array.from({length:12},(_,i)=>{
      const suffix=String(i+1).padStart(2,'0');
      return ZONE1_FIELDS.map(field=>field+'_'+suffix);
    }).flat();
    const zoneOptionHtml=()=>invoiceCandidates().map(name=>{
      const matched=/^(.+)_([0-9]{2})$/.exec(name);
      return '<option value="'+ESC(name)+'">Facturacion '+ESC(matched[2])+' - '+
        ESC(ZONE1_LABELS[matched[1]]||matched[1])+'</option>';
    }).join('');
    const zoneInputHtml='<label>Campo de factura <select data-mp-zona1-field>'+zoneOptionHtml()+'</select></label>'+
      '<label>Valor a preparar <input data-mp-zona1-value type="text" maxlength="150" autocomplete="off" /></label>'+
      '<label class="cua-mp-zona1-null"><input data-mp-zona1-null type="checkbox" /> Registrar NULL</label>';
    function renderZone1Actions(response){
      const actions=el('[data-mp-zona1-actions]');if(!actions)return;
      if(!canPrepareZone1){actions.innerHTML='';return;}
      const note='<p>Validaciones sin guardar. La escritura y el corte GAS siguen bloqueados hasta autorizacion final de GC, VA y MP.</p>';
      if(response.linked===true){
        actions.innerHTML='<section class="cua-mp-zona1-prepare"><h4>Preparar edicion de factura</h4>'+note+
          '<form data-mp-zona1-preflight="edit">'+zoneInputHtml+
          '<button class="cua-mp-btn cua-mp-primary" type="submit">Validar cambio (sin guardar)</button></form>'+
          '<div data-mp-zona1-preview role="status" aria-live="polite"></div></section>';
      }else{
        actions.innerHTML='<section class="cua-mp-zona1-prepare"><h4>Preparar vinculacion</h4>'+note+
          '<form data-mp-zona1-preflight="link"><label>Identificador de fila importada (id_mp_zona_1)'+
          '<input data-mp-zona1-link-id type="text" inputmode="numeric" maxlength="20" autocomplete="off" /></label>'+
          '<button class="cua-mp-btn cua-mp-primary" type="submit">Validar vinculo (sin guardar)</button></form>'+
          '<h4>O preparar una captura nueva</h4><form data-mp-zona1-preflight="create">'+zoneInputHtml+
          '<button class="cua-mp-btn cua-mp-primary" type="submit">Validar captura (sin guardar)</button></form>'+
          '<div data-mp-zona1-preview role="status" aria-live="polite"></div></section>';
      }
      if(canWriteZone1){
        // Not reached while the backend contract sets zone1WritesEnabled=false.
        actions.innerHTML+='<button type="button" class="cua-mp-btn" data-mp-zona1-apply disabled>Guardar operacion validada</button>';
      }
    }
    function getZone1Payload(kind){
      const id=zone1State?.id;
      if(!id||!zone1State?.response)return null;
      if(kind==='link'){
        const raw=el('[data-mp-zona1-link-id]')?.value?.trim()||'';
        if(!/^[1-9]\d{0,19}$/.test(raw))return null;
        return {path:ZONE1_ADMIN_API+'/'+encodeURIComponent(id)+'/validar-vinculo',
          body:{id_mp_zona_1:raw},operation:'link',id};
      }
      const field=el('[data-mp-zona1-field]')?.value||'';
      if(!invoiceCandidates().includes(field))return null;
      const nullValue=el('[data-mp-zona1-null]')?.checked===true;
      const raw=el('[data-mp-zona1-value]')?.value??'';
      const value=nullValue?null:(raw.trim()===''?null:raw.trim());
      if(kind==='create')return {path:ZONE1_ADMIN_API+'/'+encodeURIComponent(id)+'/validar-alta',
        body:{changes:{[field]:value}},operation:'create',id};
      const original=zone1State.response?.row?.[field]??null;
      const zoneId=String(zone1State.response.row?.id_mp_zona_1||'');
      if(!/^[1-9]\d*$/.test(zoneId))return null;
      return {path:ZONE1_ADMIN_API+'/'+encodeURIComponent(id)+'/validar-cambio/'+encodeURIComponent(zoneId),
        body:{changes:{[field]:value},expected:{[field]:original}},operation:'edit',id,zoneId};
    }
    async function preflightZone1(kind){
      if(!valid()||!canPrepareZone1||!zone1State)return false;
      const payload=getZone1Payload(kind);
      const status=el('[data-mp-zona1-preview]');
      if(!status)return false;
      if(!payload){status.textContent='Captura invalida: comprueba los campos e identificadores.';return false;}
      const epoch=zoneRequestId;
      zone1Preview=null;
      status.textContent='Validando identidad y datos sin modificar Aiven...';
      try{
        const result=await win.ManttoAuth.api(payload.path,{method:'POST',body:JSON.stringify(payload.body)});
        if(!valid()||epoch!==zoneRequestId)return false;
        if(result?.ok!==true||result.mode!=='preview_only'||result.can_write!==false||
          result.operation!==kind||result.id_dmp!==payload.id||
          result.table!=='detalle_mp_2026_zona_1')throw new Error('Preflight no confiable.');
        zone1Preview={...payload,snapshot:JSON.stringify(payload.body)};
        status.textContent='Validacion correcta (sin guardar). '+
          (kind==='edit'?'Cambio preparado.':kind==='link'?'Identidad de vinculacion verificada.':'Captura preparada.');
        const apply=el('[data-mp-zona1-apply]');if(apply)apply.disabled=!canWriteZone1;
        return true;
      }catch(_error){
        if(valid()&&epoch===zoneRequestId){status.textContent='No se valido: registro, permisos, identidad o valores incompatibles.';
          zone1Preview=null;}
        return false;
      }
    }
    async function applyZone1(){
      // Not available until explicit global cutover changes the backend contract.
      if(!canWriteZone1||!zone1Preview||!valid())return false;
      const preview=zone1Preview;
      if(JSON.stringify(getZone1Payload(preview.operation)?.body)!==preview.snapshot)return false;
      if(typeof win.confirm==='function'&&!win.confirm('Confirmar operacion de MP Zona 1 y auditar?'))return false;
      const url=ZONE1_ADMIN_API+'/'+encodeURIComponent(preview.id);
      const path=preview.operation==='edit'?url+'/'+encodeURIComponent(preview.zoneId):
        preview.operation==='link'?url+'/vincular':url;
      const method=preview.operation==='edit'?'PATCH':'POST';
      const response=await win.ManttoAuth.api(path,{method,body:JSON.stringify(preview.body)});
      if(response?.ok!==true||response.table!=='detalle_mp_2026_zona_1')return false;
      if(valid())await openZona1(preview.id); // selective refresh
      return true;
    }
    async function openZona1(id){
      if(!valid()||!getRow(id))return false;
      const dialog=el('[data-mp-zona1-dialog]');if(!dialog)return false;
      const current=++zoneRequestId;
      dialog.hidden=false;
      const who=el('[data-mp-zona1-id]');if(who)who.textContent=id;
      const status=el('[data-mp-zona1-status]');
      if(status){status.textContent='Verificando alcance y relación de Zona 1…';status.dataset.kind='info';}
      const content=el('[data-mp-zona1-content]');if(content)content.innerHTML='';
      try{
        const response=await win.ManttoAuth.apiGet(API+'/'+encodeURIComponent(id)+'/zona-1');
        if(!valid()||current!==zoneRequestId)return false;
        if(response?.ok!==true||response.readonly!==true||response.table!=='detalle_mp_2026_zona_1'||
          response.id_dmp!==id||response.relation!=='id_dmp'||response.invoice_blocks!==12||
          !Array.isArray(response.columns)||response.columns.length!==128||
          new Set(response.columns.map(c=>c.name)).size!==128)throw new Error('Contrato Zona 1 inválido.');
        if(response.linked===true){
          if(response.identity_verified!==true||response.identity?.verified!==true||
            !response.row||String(response.row.id_dmp)!==id||
            !response.lookup_preview||response.lookup_preview.mode!=='preview_only'||
            !Array.isArray(response.lookup_preview.comparisons)||response.lookup_preview.comparisons.length!==6||
            response.columns.filter(c=>c.sheetColumn&&!/_\d{2}$/.test(c.name)).length!==16||
            Array.from({length:12},(_,i)=>ZONE1_FIELDS.every(name=>response.columns.some(c=>c.name===name+'_'+String(i+1).padStart(2,'0')))).some(ok=>!ok))
            throw new Error('Detalle Zona 1 incompleto o sin identidad verificada.');
        }else if(response.linked!==false||response.row!==null||response.identity_verified!==false)
          throw new Error('Vínculo Zona 1 inválido.');
        renderZona1(response);
        zone1State={id,response};zone1Preview=null;
        renderZone1Actions(response);
        if(status){status.textContent=response.linked?'Vínculo Zona 1 verificado · 12 bloques · solo consulta.':'Sin vinculación por id_dmp · no se muestran datos ajenos.';
          status.dataset.kind=response.linked?'ready':'warning';}
        return true;
      }catch(_error){
        if(!valid()||current!==zoneRequestId)return false;
        if(content)content.innerHTML='';
        if(status){status.textContent='No se puede mostrar Zona 1: comprueba la vinculación, identidad y permisos.';
          status.dataset.kind='error';}
        return false;
      }
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
      input.focus();input.select();
    }
    function closeDialog(){
      if(saving||!editing||editing.committing)return;
      const {td,old}=editing;editing=null;
      td.classList.remove('cua-mp-editing');
      td.innerHTML='<span>'+ESC(old==null||old===''?'—':old)+'</span>';
      td.focus();
    }
    function updateBusy(value){saving=value;updateBulk();}
    async function saveSingle(){
      if(!canEdit||!valid()||saving||!editing||editing.committing)return;
      const current=editing,{id,field,old,td}=current;
      const input=td.querySelector('[data-mp-cell-input]');if(!input)return;
      const value=input.value.trim()||null;
      if(value===(old==null||old===''?null:String(old))){closeDialog();return;}
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
      if(!canEdit||!valid()||saving||state.selected.size<2||state.selected.size>MAX_BULK)return;
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
      }catch(_error){if(valid()){updateBusy(false);setStatus('Lote cancelado: revisa alcance, GAS o valores originales.','error');}}
    }
    root.addEventListener('submit',event=>{
      const target=event.target;
      if(target?.matches?.('[data-mp-form]')){
        event.preventDefault();if(!valid()||saving)return;
        state.search=el('[data-mp-search]')?.value?.trim()||'';
        state.filterColumn=el('[data-mp-filter-column]')?.value||'';
        state.filterValue=el('[data-mp-filter-value]')?.value?.trim()||'';
        state.estatus=el('[data-mp-estatus]')?.value||'';
        state.pendientes=el('[data-mp-pendientes]')?.value||'todos';
        state.page=1;load().catch(()=>{});
      }else if(target?.matches?.('[data-mp-bulk-form]')){
        event.preventDefault();saveBulk().catch(()=>{});
      }else if(canPrepareZone1 && target?.matches?.('[data-mp-zona1-preflight]')){
        event.preventDefault();
        const kind=target.dataset.mpZona1Preflight;
        if(['edit','link','create'].includes(kind))preflightZone1(kind).catch(()=>{});
      }
    });
    root.addEventListener('click',event=>{
      if(!valid()||saving)return;
      if(event.target.closest?.('[data-mp-reconcile]')){reconcile().catch(()=>{});return;}
      if(event.target.closest?.('[data-mp-zona1-close]')){closeZona1();return;}
      if(event.target.closest?.('[data-mp-zona1-apply]')){applyZone1().catch(()=>{});return;}
      const zona=event.target.closest?.('[data-mp-zona1]');
      if(zona){openZona1(zona.dataset.mpZona1).catch(()=>{});return;}
      const group=event.target.closest?.('[data-mp-group]');
      if(group){
        if(Object.prototype.hasOwnProperty.call(GROUPS,group.dataset.mpGroup)){
          state.group=group.dataset.mpGroup;render();
        }
        return;
      }
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
      if(!valid()||saving)return;
      if(event.target?.matches?.('[data-mp-page-size]')){
        const size=Number(event.target.value);
        if(![25,50,100].includes(size))return;
        state.pageSize=size;state.page=1;load().catch(()=>{});
        return;
      }
      if(canPrepareZone1 && event.target?.matches?.('[data-mp-zona1-field]')){
        zone1Preview=null;
        const apply=el('[data-mp-zona1-apply]');if(apply)apply.disabled=true;
        const field=event.target.value;
        const input=el('[data-mp-zona1-value]');
        if(input){input.value='';input.type=field.startsWith('fecha_')||field.startsWith('vencimiento_')?'date':'text';
          input.inputMode=field.startsWith('dias_vencimiento_')?'numeric':'text';}
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
    root.addEventListener('input',event=>{
      if(!canPrepareZone1||!event.target?.closest?.('[data-mp-zona1-preflight]'))return;
      zone1Preview=null;
      const apply=el('[data-mp-zona1-apply]');if(apply)apply.disabled=true;
    });
    root.addEventListener('keydown',event=>{
      if(event.target.matches?.('[data-mp-cell-input]')){
        if(event.key==='Escape'){event.preventDefault();closeDialog();}
        else if(event.key==='Enter'){event.preventDefault();saveSingle().catch(()=>{});}
        return;
      }
      if(event.key==='Enter'&&event.target.matches?.('td.cua-mp-canedit')){
        event.preventDefault();openEdit(event.target);return;
      }
      if(event.key==='Escape' && el('[data-mp-zona1-dialog]')?.hidden===false){
        event.preventDefault?.();closeZona1();
      }
    });
    root.addEventListener('dblclick',event=>openEdit(event.target.closest?.('td.cua-mp-canedit')));
    root.addEventListener('focusout',event=>{
      if(event.target.matches?.('[data-mp-cell-input]'))saveSingle().catch(()=>{});
    });
    load().catch(()=>{});
    return Object.freeze({destroy(){disposed=true;requestId++;zoneRequestId++;reconcileRequestId++;editing=null;state.selected.clear();root.replaceChildren();}});
  }
  win.ManttoCobranzaAdministracionMP_uni=Object.freeze({mount});
})(window,document);
