(function (win,doc) {
  'use strict';
  // [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_6_V001]
  // Tabla Excel con edicion fantasma en celda y alta controlada por el backend.
  // Los 31 campos llegan de /administracion/tablas/pc/registros (backend seguro).
  const API='/api/cobranza-uni/administracion/tablas/pc/registros';
  const EXPECTED_FIELDS=31;
  const MAX_BULK=20;
  const LOCAL_CALCULATED=new Set([
    'mes_ov','pagado_iva','no_pagado_iva','venta_total',
    'mes_factura','fecha_vencimiento','dias_vencimiento','estatus'
  ]);
  const RELATED_CALCULATED=new Set([
    'facturas_pendientes_pago','adeudo','terminos',
    'zona_operativa','estado','estatus_cartera'
  ]);
  const ALL_PREVIEW=new Set([...LOCAL_CALCULATED,...RELATED_CALCULATED]);
  const MONEY=new Set(['precio_venta','pagado_iva','no_pagado_iva','venta_total','adeudo']);
  const HEADINGS=Object.freeze({
    id_pc:'Consecutivo',proyecto:'Proyecto',id_proyecto_cobranza:'ID Proyecto Cobranza',
    cliente:'Cliente',ov:'OV',fecha_ov:'Fecha OV',mes_ov:'Mes OV',
    concepto:'Concepto',precio_venta:'Precio de venta',pagado_iva:'Pagado IVA',
    no_pagado_iva:'No pagado IVA',venta_total:'Venta total',
    facturas_pendientes_pago:'Facturas pendientes',adeudo:'Adeudo',
    no_factura:'No. factura',fecha_factura:'Fecha factura',mes_factura:'Mes factura',
    terminos:'Términos (días)',fecha_vencimiento:'Fecha vencimiento',
    dias_vencimiento:'Días vencimiento',estatus:'Estatus',
    estatus_administrativo:'Estatus administrativo',estatus_operativo:'Estatus operativo',
    fecha_pago:'Fecha pago',refacturacion_sustitucion:'Refacturación o sustitución',
    zona_adm:'Zona administrativa',zona_operativa:'Zona operativa',
    estado:'Estado',comentarios_cobranza:'Comentarios cobranza',
    estatus_cartera:'Estatus cartera',tipo_pago:'Tipo pago'
  });
  const ESC=value=>String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
  const formatMoney=value=>{
    const number=Number(value);
    return Number.isFinite(number)
      ?number.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})
      :String(value);
  };
  function mount(root,options={}) {
    if(!root||typeof root.addEventListener!=='function')return null;
    let disposed=false,requestNo=0,saving=false,editing=null,createPreview=null;
    const enabledFields=new Set(Array.isArray(options.editableFields)?options.editableFields:[]);
    const canEdit=options.canEdit===true && enabledFields.size>0;
    const canPrepareCreate=options.canPrepareCreate===true;
    const canCreate=canPrepareCreate && options.canCreate===true;
    const state={
      page:1,pageSize:30,search:'',filterColumn:'',filterValue:'',
      sort:'id_pc',order:'desc',columns:[],rows:[],total:0,pages:0,selected:new Set(),
      previews:new Map(),previewDate:null,relationSummary:null
    };
    const valid=()=>!disposed &&
      (typeof options.isCurrent!=='function'||options.isCurrent());
    function dateMxNow(){
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',
        year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const part=k=>parts.find(x=>x.type===k)?.value;
      return part('year')+'-'+part('month')+'-'+part('day');
    }
    const el=selector=>root.querySelector(selector);
    const label=column=>HEADINGS[column.name]||column.sheetHeader||column.name;
    const colList=()=>state.columns.filter(column=>has(HEADINGS,column.name));
    const safeColumns=()=>state.columns.filter(c=>c.editable===true&&enabledFields.has(c.name));
    const rowById=id=>state.rows.find(row=>String(row.id_pc)===String(id));
    const updateStatus=(message,kind='info')=>{
      const target=el('[data-pc-status]');
      if(target){target.textContent=message;target.dataset.kind=kind;}
    };

    root.innerHTML='<section class="cua-pc-admin" data-cua-pc-grid aria-label="Venta Adicional: consulta de registros">'+
      '<div class="cua-pc-topline">'+
       '<div><strong>Registros de Venta Adicional</strong><p>Datos actuales de Aiven · tabla <code>pc</code></p></div>'+
       '<span class="cua-pc-readonly" aria-label="Estado">'+(canEdit?'Edición fantasma · '+enabledFields.size+' campos · doble clic o Enter':'Solo consulta')+'</span>'+
      '</div>'+
      '<div class="cua-pc-tools">'+
       '<form data-pc-form class="cua-pc-form" autocomplete="off">'+
        '<label class="cua-pc-search"><span>Buscar</span><input type="search" maxlength="120" data-pc-search placeholder="Proyecto, cliente, OV, factura..." /></label>'+
        '<label><span>Columna</span><select data-pc-filter-column aria-label="Columna de filtro"><option value="">Seleccionar columna</option></select></label>'+
        '<label><span>Contiene</span><input type="search" maxlength="120" data-pc-filter-value placeholder="Valor del filtro" /></label>'+
        '<button type="submit" class="cua-pc-btn cua-pc-primary">Aplicar</button>'+
        '<button type="button" class="cua-pc-btn" data-pc-clear>Limpiar</button>'+
       '</form>'+
       '<div class="cua-pc-actions">'+
        '<label><span>Filas/página</span><select data-pc-page-size><option value="15">15</option><option selected value="30">30</option><option value="50">50</option><option value="100">100</option></select></label>'+
        '<button type="button" class="cua-pc-btn" data-pc-reload>↻ Actualizar</button>'+
        (canPrepareCreate?'<button type="button" class="cua-pc-btn cua-pc-primary" data-pc-create-open>+ Nuevo registro</button>':'')+
       '</div>'+
      '</div>'+
      '<div class="cua-pc-caption">'+
        '<p class="cua-pc-note">Vista previa sin guardar: 8 fórmulas locales y 6 derivados relacionados, solo con identidad válida. Los acumulados incluyen todas las ventas autorizadas del proyecto, sin duplicarse en el resumen de página.'+'</p>'+
        '<span class="cua-pc-status" data-pc-status role="status" aria-live="polite">Consultando registros...</span>'+
      '</div>'+
      '<div class="cua-pc-relations-summary" data-pc-relations role="status" aria-live="polite">Acumulados por proyecto: consultando relaciones...</div>'+
      (canEdit?'<form class="cua-pc-bulk" data-pc-bulk-form autocomplete="off">'+
        '<strong>Edicion multiple</strong><span data-pc-bulk-count>0 seleccionados (maximo 20)</span>'+
        '<label>Campo <select data-pc-bulk-field aria-label="Campo para lote"></select></label>'+
        '<label>Valor <input data-pc-bulk-input type="text" maxlength="4000" placeholder="Nuevo valor" /></label>'+
        '<label class="cua-pc-null"><input data-pc-bulk-null type="checkbox" /> Vaciar (NULL)</label>'+
        '<button class="cua-pc-btn cua-pc-primary" type="submit" data-pc-bulk-save disabled>Aplicar a seleccion</button>'+
        '</form>':'')+
      '<div class="cua-pc-scroll" tabindex="0" role="region" aria-label="Tabla desplazable de Venta Adicional">'+
       '<table class="cua-pc-grid"><thead data-pc-head></thead><tbody data-pc-body></tbody></table>'+
      '</div>'+
      '<nav class="cua-pc-pager" aria-label="Paginación de Venta Adicional">'+
       '<span data-pc-range>0 registros</span><div class="cua-pc-pager-controls">'+
       '<button type="button" class="cua-pc-btn" data-pc-prev disabled>← Anterior</button>'+
       '<span data-pc-page>Página 1</span>'+
       '<button type="button" class="cua-pc-btn" data-pc-next disabled>Siguiente →</button></div>'+
      '</nav>'+
      (canPrepareCreate?'<div class="cua-pc-dialog" data-pc-create-dialog hidden>'+ 
        '<div class="cua-pc-dialog-backdrop" data-pc-create-close></div>'+ 
        '<section class="cua-pc-dialog-panel cua-pc-create-panel" role="dialog" aria-modal="true" aria-labelledby="cua-pc-create-title">'+
          '<header><div><p>Venta Adicional · Alta controlada</p><h3 id="cua-pc-create-title">Nuevo registro en pc</h3></div>'+ 
            '<button class="cua-pc-btn" data-pc-create-close type="button">Cerrar</button></header>'+ 
          '<p class="cua-pc-create-note">El consecutivo no es autoincremental. Verifica el ID sugerido; el servidor comprueba la llave primaria al guardar. El alta depende de permisos y configuracion del servidor.</p>'+ 
          '<form data-pc-create-form autocomplete="off">'+
            '<label class="cua-pc-create-id">Consecutivo (id_pc) <input data-pc-create-id inputmode="numeric" type="text" maxlength="19" placeholder="Sugerencia al validar" /></label>'+ 
            '<div class="cua-pc-create-fields" data-pc-create-fields></div>'+ 
            '<button class="cua-pc-btn cua-pc-primary" type="submit" data-pc-create-check>Validar y calcular (sin guardar)</button>'+ 
            '<div class="cua-pc-create-result" data-pc-create-result role="status" aria-live="polite">La validación consulta Aiven sin modificar registros.</div>'+ 
            '<button class="cua-pc-btn cua-pc-primary" type="button" data-pc-create-save disabled>'+ 
              (canCreate?'Crear registro y auditar':'Creación no habilitada')+'</button>'+ 
          '</form></section></div>':'')+
    '</section>';

    // F6: el formulario se arma exclusivamente desde la lista blanca de columnas.
    function renderCreateForm(){
      if(!canPrepareCreate)return;
      const fields=el('[data-pc-create-fields]');
      if(!fields||fields.childElementCount)return;
      fields.innerHTML=state.columns.filter(c=>c.editable===true).map(meta=>{
        const name=meta.name,title=label(meta);
        const required=['proyecto','cliente','precio_venta','tipo_pago','estatus_administrativo'].includes(name);
        const isDate=meta.sqlType==='date',isMoney=meta.sqlType==='decimal(18,2)';
        const max=Number((/varchar\((\d+)\)/.exec(meta.sqlType)||[])[1])||4000;
        const input=name==='comentarios_cobranza'
          ?'<textarea rows="3" maxlength="4000" data-pc-create-field="'+ESC(name)+'"></textarea>'
          :'<input data-pc-create-field="'+ESC(name)+'" type="'+(isDate?'date':'text')+'"'+
            (isMoney?' inputmode="decimal"':'')+' maxlength="'+ESC(max)+'"'+
            (required?' required':'')+' />';
        return '<label>'+ESC(title)+(required?' <strong aria-label="Obligatorio">*</strong>':'')+input+'</label>';
      }).join('');
    }
    function collectCreateForm(){
      const fields={};
      root.querySelectorAll('[data-pc-create-field]').forEach(input=>{
        fields[input.dataset.pcCreateField]=input.value.trim()||null;
      });
      return {id_pc:el('[data-pc-create-id]')?.value.trim()||null,fields};
    }
    function clearCreatePreview(){
      createPreview=null;
      const button=el('[data-pc-create-save]');if(button)button.disabled=true;
    }
    function closeCreateDialog(){
      const dialog=el('[data-pc-create-dialog]');if(dialog)dialog.hidden=true;
      clearCreatePreview();
    }
    function showCreateDialog(){
      if(!canPrepareCreate||!valid()||saving||editing||state.columns.length!==EXPECTED_FIELDS)return;
      renderCreateForm();clearCreatePreview();
      const form=el('[data-pc-create-form]');if(form)form.reset();
      const result=el('[data-pc-create-result]');
      if(result)result.textContent='La validación consulta Aiven sin modificar registros.';
      const dialog=el('[data-pc-create-dialog]');if(dialog)dialog.hidden=false;
      el('[data-pc-create-id]')?.focus();
    }
    async function previewCreate(event){
      event.preventDefault();
      if(!canPrepareCreate||saving||!valid())return;
      clearCreatePreview();
      const request=collectCreateForm();
      busy(true);updateStatus('Validando nueva venta sin escribir en Aiven...');
      try{
        const response=await win.ManttoAuth.api(API+'/validar-alta',{
          method:'POST',body:JSON.stringify(request)
        });
        if(!valid())return;
        if(response?.ok!==true||response.mode!=='preview_only'||response.table!=='pc'||
           !response.derived||!response.id_pc)throw new Error('Validación no confirmada.');
        const id=el('[data-pc-create-id]');
        if(id&&!id.value.trim())id.value=response.id_pc;
        createPreview={id_pc:response.id_pc,payload:JSON.stringify(collectCreateForm())};
        const output=el('[data-pc-create-result]');
        if(output){
          const keys=['venta_total','terminos','fecha_vencimiento','estatus',
            'facturas_pendientes_pago','adeudo','zona_operativa','estado','estatus_cartera'];
          output.innerHTML='<strong>Validación correcta · ID '+ESC(response.id_pc)+'</strong><p>'+ 
            'Proyecto: '+ESC(response.proyecto)+' · Corte: '+ESC(response.as_of)+
            ' · '+(canCreate?'Lista para confirmar alta.':'Solo simulación; alta no habilitada.')+'</p>'+ 
            '<dl>'+keys.map(name=>'<div><dt>'+ESC(HEADINGS[name]||name)+'</dt><dd>'+ 
              ESC(response.derived[name]??'—')+'</dd></div>').join('')+'</dl>';
        }
        const button=el('[data-pc-create-save]');if(button)button.disabled=!canCreate;
        updateStatus('Alta validada en modo lectura · '+(canCreate?'pendiente de confirmación':'escritura deshabilitada'),'ready');
      }catch(error){
        if(!valid())return;
        const output=el('[data-pc-create-result]');
        if(output)output.textContent='Validación rechazada: '+String(error?.message||'revisa los datos y el proyecto.');
        updateStatus('No se puede dar de alta: datos o relaciones no verificables.','error');
      }finally{if(valid())busy(false);}
    }
    async function saveCreate(){
      if(!canCreate||saving||!valid()||!createPreview)return;
      const request=collectCreateForm();
      if(JSON.stringify(request)!==createPreview.payload||request.id_pc!==createPreview.id_pc){
        clearCreatePreview();updateStatus('Cambiaste datos: vuelve a validar el alta.','error');return;
      }
      if(typeof win.confirm==='function'&&!win.confirm('Crear registro '+request.id_pc+' en pc y auditar?'))return;
      busy(true);updateStatus('Creando registro y auditando...');
      try{
        const response=await win.ManttoAuth.api(API,{
          method:'POST',body:JSON.stringify(request)
        });
        if(!valid())return;
        if(response?.ok!==true||response.created!==true||response.table!=='pc'||
           response.id_pc!==request.id_pc)throw new Error('El servidor no confirmó el alta.');
        closeCreateDialog();busy(false);await load();
        if(valid())updateStatus('Registro '+response.id_pc+' creado y auditado.','ready');
      }catch(error){
        if(!valid())return;
        clearCreatePreview();
        updateStatus('Alta NO confirmada: '+String(error?.message||'revisa ID, permisos o configuración.'),'error');
      }finally{if(valid())busy(false);}
    }
    function renderColumnsSelect(){
      const select=el('[data-pc-filter-column]');
      if(!select)return;
      const current=state.filterColumn;
      select.innerHTML='<option value="">Seleccionar columna</option>'+colList().map(column=>
        '<option value="'+ESC(column.name)+'"'+(current===column.name?' selected':'')+'>'+ESC(label(column))+'</option>'
      ).join('');
    }
    function renderEditorOptions(){
      if(!canEdit)return;
      const control=el('[data-pc-bulk-field]');
      if(control){
        const current=control.value;
        control.innerHTML=safeColumns().map(column=>
          '<option value="'+ESC(column.name)+'">'+ESC(label(column))+'</option>'
        ).join('');
        if(safeColumns().some(column=>column.name===current))control.value=current;
      }
      bulkControlChanged();
    }
    function renderBulkControls(){
      if(!canEdit)return;
      const count=el('[data-pc-bulk-count]');
      if(count)count.textContent=state.selected.size+' seleccionados (maximo '+MAX_BULK+')';
      const submit=el('[data-pc-bulk-save]');
      if(submit)submit.disabled=saving||Boolean(editing)||
        state.selected.size<2||state.selected.size>MAX_BULK;
    }
    function busy(value){
      saving=Boolean(value);
      renderBulkControls();
      const check=el('[data-pc-create-check]');if(check)check.disabled=saving;
      const create=el('[data-pc-create-save]');if(create)create.disabled=saving||!canCreate||!createPreview;
    }
    function bulkControlChanged(){
      if(!canEdit)return;
      const input=el('[data-pc-bulk-input]'),field=el('[data-pc-bulk-field]')?.value||'';
      const type=state.columns.find(c=>c.name===field)?.sqlType;
      if(input){input.type=type==='date'?'date':'text';
        const size=Number((/varchar\((\d+)\)/.exec(type||'')||[])[1]);
        input.maxLength=Number.isSafeInteger(size)&&size>0?size:4000;
      }
    }
    function render(){
      if(!valid())return;
      const scroll=el('.cua-pc-scroll');
      const left=scroll?.scrollLeft||0;
      const top=scroll?.scrollTop||0;
      const columns=colList();
      const head=el('[data-pc-head]'),body=el('[data-pc-body]');
      if(head)head.innerHTML='<tr>'+columns.map((column,index)=>{
        const currentSort=state.sort===column.name;
        const direction=currentSort?state.order:'none';
        const isAsc=direction==='asc';
        const arrow=currentSort?(isAsc?' ↑':' ↓'):'';
        return '<th scope="col" aria-sort="'+(currentSort?(isAsc?'ascending':'descending'):'none')+'"'+
          ' class="cua-pc-th cua-pc-kind-'+ESC(column.kind)+'"'+(index<2?' data-pc-fixed="'+index+'"':'')+'>'+ 
          '<button type="button" data-pc-sort="'+ESC(column.name)+'" aria-label="Ordenar por '+ESC(label(column))+'">'+ESC(label(column))+arrow+'</button>'+
          '<small>'+ESC(column.kind==='protected'?'Clave protegida':column.kind==='derived'&&state.previews.size&&ALL_PREVIEW.has(column.name)?'Vista previa F4/F5':column.kind==='derived'?'Calculado en Aiven':'Dato de origen')+'</small></th>';
      }).join('')+'</tr>';
      if(body)body.innerHTML=state.rows.length?state.rows.map(row=>
        '<tr data-pc-row="'+ESC(row.id_pc)+'">'+columns.map((column,index)=>{
          const original=has(row,column.name)?row[column.name]:null;
          const preview=state.previews.get(String(row.id_pc));
          const calculated=Boolean(preview&&ALL_PREVIEW.has(column.name)&&has(preview.values,column.name));
          const raw=calculated?preview.values[column.name]:original;
          const shown=raw===null||raw===undefined||raw===''?'—':MONEY.has(column.name)?formatMoney(raw):String(raw);
          const stored=original===null||original===undefined||original===''?'—':MONEY.has(column.name)?formatMoney(original):String(original);
          const warning=calculated&&Array.isArray(preview.warnings)&&preview.warnings.length>0;
          const origin=calculated&&RELATED_CALCULATED.has(column.name) ? (preview.sources?.[column.name]||'acumulado_proyecto') : 'formula_local';
          const title=calculated?'Vista previa sin guardar · corte '+state.previewDate+' · origen: '+origin+' · Aiven: '+stored+(warning?' · advertencias: '+preview.warnings.join(', '):''):shown;
          const numeric=/^(?:int|bigint|decimal)/i.test(column.sqlType||'');
          const editable=canEdit&&safeColumns().some(c=>c.name===column.name)&&!calculated;
          const controls=canEdit&&column.name==='id_pc'
            ?'<div class="cua-pc-cell-actions">'+
              '<label><input type="checkbox" data-pc-select value="'+ESC(row.id_pc)+'"'+
                (state.selected.has(String(row.id_pc))?' checked':'')+' aria-label="Seleccionar venta '+ESC(row.id_pc)+'" /></label></div>':'';
          return '<td'+(index<2?' data-pc-fixed="'+index+'"':'')+
            ' data-pc-field="'+ESC(column.name)+'" class="cua-pc-cell cua-pc-kind-'+ESC(column.kind)+(numeric?' cua-pc-number':'')+(calculated?' cua-pc-preview-cell':'')+(warning?' cua-pc-preview-warning':'')+(editable?' cua-pc-canedit':'')+'"'+
            (editable?' tabindex="0" role="button" aria-label="Editar '+ESC(label(column))+' de la venta '+ESC(row.id_pc)+'"':'')+
            ' title="'+ESC(title)+'"><span>'+ESC(shown)+'</span>'+
            (calculated?'<small class="cua-pc-preview-tag" aria-label="Cálculo temporal sin guardar">Vista previa</small>':'')+
            controls+'</td>';
        }).join('')+'</tr>'
      ).join(''):'<tr><td class="cua-pc-empty" colspan="'+Math.max(columns.length,1)+'">Sin registros para los filtros seleccionados.</td></tr>';
      const summary=el('[data-pc-relations]');
      if(summary){
        const s=state.relationSummary;
        summary.textContent=!s?'Relaciones no disponibles para esta consulta.' :
          s.projects===0?'Sin proyectos con identidad verificada en esta página.':
          s.incomplete>0?'Proyectos de esta página: '+s.projects+' · '+s.incomplete+
            ' con acumulados no verificables; se omiten totales incompletos.':
          'Proyectos únicos de esta página: '+s.projects+
          ' · Facturas vencidas: '+s.facturas_pendientes_pago+
          ' · Adeudo vencido: $'+formatMoney(s.adeudo)+' MXN (cada proyecto contado una sola vez).';
      }
      const page=el('[data-pc-page]');
      if(page)page.textContent='Página '+state.page+' de '+Math.max(1,state.pages);
      const range=el('[data-pc-range]');
      const start=state.total?(state.page-1)*state.pageSize+1:0;
      const end=state.total?Math.min(state.page*state.pageSize,state.total):0;
      if(range)range.textContent=start+'–'+end+' de '+state.total+' registros';
      const prev=el('[data-pc-prev]'),next=el('[data-pc-next]');
      if(prev)prev.disabled=state.page<=1;
      if(next)next.disabled=state.page>=state.pages;
      if(scroll){scroll.scrollLeft=left;scroll.scrollTop=top;}
      renderBulkControls();
    }
    async function load(){
      if(!valid())return false;
      const seq=++requestNo;
      updateStatus('Consultando Venta Adicional...');
      const params=new URLSearchParams({
        page:String(state.page),page_size:String(state.pageSize),
        search:state.search,filter_column:state.filterColumn,
        filter_value:state.filterValue,sort:state.sort,order:state.order
      });
      try{
        if(typeof win.ManttoAuth?.apiGet!=='function')throw new Error('Sesion no disponible.');
        const response=await win.ManttoAuth.apiGet(API+'?'+params.toString());
        if(!valid()||seq!==requestNo)return false;
        if(response?.ok!==true||response.table!=='pc'||response.readonly!==true||
          !Array.isArray(response.columns)||!Array.isArray(response.rows)){
          throw new Error('Respuesta de consulta no valida.');
        }
        const columns=response.columns.filter(c=>c&&has(HEADINGS,c.name)&&
          ['protected','derived','editable'].includes(c.kind));
        if(columns.length!==EXPECTED_FIELDS||new Set(columns.map(c=>c.name)).size!==EXPECTED_FIELDS){
          throw new Error('Contrato de columnas incompleto.');
        }
        const total=Number(response.total),pages=Number(response.pages);
        if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(pages)||pages<0||
          Number(response.page)!==state.page||Number(response.page_size)!==state.pageSize){
          throw new Error('Paginacion inconsistente.');
        }
        if(editing)cancelCellEdit();state.selected.clear();
        state.columns=columns;
        state.rows=response.rows;
        state.previews=new Map();state.previewDate=null;state.relationSummary=null;
        const calc=response.formula_preview;
        if(calc?.mode==='preview_only'&&calc.source==='formulas_backend'&&
          calc.time_zone==='America/Mexico_City'&&/^\d{4}-\d{2}-\d{2}$/.test(calc.as_of||'')&&
          Array.isArray(calc.rows)&&Array.isArray(calc.fields)&&
          [...LOCAL_CALCULATED].every(field=>calc.fields.includes(field))){
          const ids=new Set(response.rows.map(row=>String(row.id_pc)));
          for(const item of calc.rows){
            const key=String(item?.id_pc??'');
            if(!ids.has(key)||state.previews.has(key)||!item?.values||typeof item.values!=='object')continue;
            state.previews.set(key,{values:item.values,warnings:Array.isArray(item.warnings)?item.warnings:[]});
          }
          state.previewDate=calc.as_of;
        }
        const relation=response.relation_preview;
        if(relation?.mode==='preview_only'&&relation.source==='relaciones_aiven'&&
          relation.as_of===state.previewDate&&Array.isArray(relation.rows)&&
          Array.isArray(relation.fields)&&[...RELATED_CALCULATED].every(field=>relation.fields.includes(field))){
          const ids=new Set(response.rows.map(row=>String(row.id_pc)));
          const seen=new Set();
          for(const item of relation.rows){
            const key=String(item?.id_pc??'');
            if(!ids.has(key)||seen.has(key)||!item?.values||typeof item.values!=='object')continue;
            seen.add(key);
            const old=state.previews.get(key)||{values:{},warnings:[]};
            const fields={};
            for(const name of RELATED_CALCULATED)if(has(item.values,name))fields[name]=item.values[name];
            state.previews.set(key,{values:{...old.values,...fields},
              warnings:[...new Set([...old.warnings,...(Array.isArray(item.warnings)?item.warnings:[])])],
              sources:item.sources&&typeof item.sources==='object'?item.sources:{}});
          }
          if(seen.size===response.rows.length && relation.project_summary?.projects>=0)
            state.relationSummary=relation.project_summary;
        }
        state.total=total;
        state.pages=pages;
        renderColumnsSelect();
        renderEditorOptions();
        render();
        updateStatus(total+' registros · '+(state.previewDate?'Fórmulas y relaciones al '+state.previewDate+' (sin guardar)':'Datos Aiven')+' · '+(canEdit?'Edición limitada':'Solo consulta'),'ready');
        return true;
      }catch(error){
        if(!valid()||seq!==requestNo)return false;
        if(editing)cancelCellEdit();state.selected.clear();
        state.rows=[];state.previews.clear();state.previewDate=null;state.relationSummary=null;state.total=0;state.pages=0;
        render();
        updateStatus('No se pudo consultar Venta Adicional. Comprueba permisos, conexión o filtros.','error');
        return false;
      }
    }
    function beginCellEdit(td){
      if(!valid()||!canEdit||saving||editing||!td?.classList.contains('cua-pc-canedit'))return;
      const field=td.dataset.pcField,id=td.closest('tr')?.dataset.pcRow;
      const row=rowById(id),col=safeColumns().find(c=>c.name===field);
      if(!row||!col)return;
      const old=row[field]??null;
      const input=doc.createElement(field==='comentarios_cobranza'?'textarea':'input');
      if(input.tagName==='INPUT')input.type=col.sqlType==='date'?'date':'text';
      const size=Number((/varchar\((\d+)\)/i.exec(col.sqlType||'')||[])[1]);
      input.maxLength=Number.isSafeInteger(size)&&size>0?size:4000;
      input.value=old==null?'':String(old);
      input.className='cua-pc-edit-input';input.setAttribute('data-pc-cell-input','');
      input.setAttribute('aria-label','Nuevo valor para '+label(col));
      editing={id,field,old,td,committing:false};
      td.replaceChildren(input);td.classList.add('cua-pc-editing');
      renderBulkControls();input.focus();if(typeof input.select==='function')input.select();
    }
    function cancelCellEdit(){
      if(!editing||editing.committing)return;
      const {td,old}=editing;editing=null;
      td.classList.remove('cua-pc-editing');
      td.innerHTML='<span>'+ESC(old==null||old===''?'—':old)+'</span>';
      td.focus();renderBulkControls();
    }
    async function saveCellEdit(){
      if(!canEdit||!editing||editing.committing||!valid()||saving)return;
      const current=editing,{id,field,old,td}=current;
      const input=td.querySelector('[data-pc-cell-input]');if(!input)return;
      const value=input.value.trim()||null;
      if(value===(old==null||old===''?null:String(old))){cancelCellEdit();return;}
      if(!safeColumns().some(col=>col.name===field)){cancelCellEdit();return;}
      current.committing=true;editing=null;
      busy(true);updateStatus('Guardando y auditando venta '+id+'...');
      try{
        const response=await win.ManttoAuth.api(API+'/'+encodeURIComponent(id),{
          method:'PATCH',body:JSON.stringify({changes:{[field]:value},expected:{[field]:old}})
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='pc'||response.field!==field||
          Number(response.total)!==1)throw new Error('El servidor no confirmo la edicion.');
        busy(false);await load();
        if(valid())updateStatus(response.changed===1?'Cambio guardado y auditado.':'Sin cambios.','ready');
      }catch(error){
        if(!valid())return;
        busy(false);await load();
        if(valid())updateStatus('No se guardo el cambio: '+String(error?.message||'verifica permisos o recarga.'),'error');
      }
    }
    async function saveBulk(event){
      event.preventDefault();
      if(!canEdit||saving||editing||!valid())return;
      const ids=[...state.selected];
      if(ids.length<2||ids.length>MAX_BULK){
        updateStatus('Selecciona de 2 a 20 registros.','error');return;
      }
      const field=el('[data-pc-bulk-field]')?.value||'';
      if(!safeColumns().some(col=>col.name===field))return;
      const isNull=el('[data-pc-bulk-null]')?.checked===true;
      const raw=el('[data-pc-bulk-input]')?.value||'';
      if(!isNull&&!raw.trim()){
        updateStatus('Introduce un valor o marca Vaciar (NULL).','error');return;
      }
      const value=isNull?null:raw.trim();
      const expected={};
      for(const id of ids){
        const row=rowById(id);
        if(!row){updateStatus('La seleccion cambio. Actualiza.','error');return;}
        expected[id]={[field]:row[field]??null};
      }
      if(typeof win.confirm==='function'&&!win.confirm(
        'Aplicar '+label(state.columns.find(c=>c.name===field))+' a '+ids.length+' registros?'))return;
      busy(true);updateStatus('Guardando lote en una sola transaccion...');
      try{
        const response=await win.ManttoAuth.api(API+'/edicion-multiple',{
          method:'PATCH',body:JSON.stringify({ids,changes:{[field]:value},expected})
        });
        if(!valid())return;
        if(response?.ok!==true||response.table!=='pc'||Number(response.total)!==ids.length)
          throw new Error('El servidor no confirmo el lote.');
        busy(false);await load();
        if(valid())updateStatus(response.changed+' cambios guardados y auditados.','ready');
      }catch(error){
        if(!valid())return;
        busy(false);await load();
        if(valid())updateStatus('El lote NO se guardo: '+String(error?.message||'conflicto o permiso insuficiente.'),'error');
      }
    }
    function onSubmit(event){
      if(event.target.matches('[data-pc-create-form]')){previewCreate(event).catch(()=>{});return;}
      if(event.target.matches('[data-pc-bulk-form]')){saveBulk(event).catch(()=>{});return;}
      if(!event.target.matches('[data-pc-form]'))return;
      event.preventDefault();
      if(saving||editing||!valid())return;
      const column=el('[data-pc-filter-column]')?.value||'';
      const value=(el('[data-pc-filter-value]')?.value||'').trim();
      if(value&&!column){updateStatus('Selecciona una columna para filtrar.','error');return;}
      state.search=(el('[data-pc-search]')?.value||'').trim();
      state.filterColumn=column;
      state.filterValue=value;
      state.page=1;
      load().catch(()=>{});
    }
    function onClick(event){
      if(saving||editing||!valid())return;
      if(event.target.closest('[data-pc-create-close]')){closeCreateDialog();return;}
      const button=event.target.closest('button');
      if(!button||!root.contains(button))return;
      if(button.hasAttribute('data-pc-create-open')){showCreateDialog();return;}
      if(button.hasAttribute('data-pc-create-save')){saveCreate().catch(()=>{});return;}
      if(button.hasAttribute('data-pc-sort')){
        const column=button.dataset.pcSort;
        if(!state.columns.some(c=>c.name===column))return;
        if(state.sort===column)state.order=state.order==='asc'?'desc':'asc';
        else {state.sort=column;state.order='asc';}
        state.page=1;
        load().catch(()=>{});
        return;
      }
      if(button.hasAttribute('data-pc-prev')){
        if(state.page>1){state.page--;load().catch(()=>{});}return;
      }
      if(button.hasAttribute('data-pc-next')){
        if(state.page<state.pages){state.page++;load().catch(()=>{});}return;
      }
      if(button.hasAttribute('data-pc-reload')){load().catch(()=>{});return;}
      if(button.hasAttribute('data-pc-clear')){
        state.page=1;state.search='';state.filterColumn='';state.filterValue='';
        state.sort='id_pc';state.order='desc';
        for(const selector of ['[data-pc-search]','[data-pc-filter-value]']){
          const input=el(selector);if(input)input.value='';
        }
        const select=el('[data-pc-filter-column]');if(select)select.value='';
        load().catch(()=>{});
      }
    }
    function onChange(event){
      if(!valid()||saving||editing)return;
      if(canEdit&&event.target.matches('[data-pc-bulk-field]')){
        bulkControlChanged();return;
      }
      if(canEdit&&event.target.matches('[data-pc-select]')){
        const id=String(event.target.value);
        if(event.target.checked){
          if(state.selected.size>=MAX_BULK){
            event.target.checked=false;
            updateStatus('Maximo 20 registros por operacion.','error');return;
          }
          state.selected.add(id);
        }else state.selected.delete(id);
        renderBulkControls();return;
      }
      if(!event.target.matches('[data-pc-page-size]'))return;
      const size=Number(event.target.value);
      if(![15,30,50,100].includes(size))return;
      state.pageSize=size;state.page=1;
      load().catch(()=>{});
    }
    function onKey(event){
      if(event.target.matches?.('[data-pc-cell-input]')){
        if(event.key==='Escape'){event.preventDefault();cancelCellEdit();}
        else if(event.key==='Enter'&&(event.target.tagName!=='TEXTAREA'||event.ctrlKey)){
          event.preventDefault();saveCellEdit().catch(()=>{});
        }
        return;
      }
      if(event.key==='Enter'&&event.target.matches?.('td.cua-pc-canedit')){
        event.preventDefault();beginCellEdit(event.target);return;
      }
      if(event.key==='Escape'&&!saving)closeCreateDialog();
    }
    function onDblClick(event){beginCellEdit(event.target.closest?.('td.cua-pc-canedit'));}
    function onFocusOut(event){
      if(event.target.matches?.('[data-pc-cell-input]'))saveCellEdit().catch(()=>{});
    }
    function onInput(event){
      if(!canPrepareCreate||saving)return;
      if(event.target.matches('[data-pc-create-id], [data-pc-create-field]'))clearCreatePreview();
    }
    root.addEventListener('keydown',onKey);
    root.addEventListener('submit',onSubmit);
    root.addEventListener('click',onClick);
    root.addEventListener('change',onChange);
    root.addEventListener('input',onInput);
    root.addEventListener('dblclick',onDblClick);
    root.addEventListener('focusout',onFocusOut);
    load().catch(()=>{});
    // Si la vista permanece abierta al pasar medianoche en CDMX, actualizar
    // solo lectura sin editar ningun registro ni depender del activador GAS.
    const midnightTimer=typeof win.setInterval==='function' ? win.setInterval(()=>{
      if(!valid()||saving||editing||el('[data-pc-create-dialog]')?.hidden===false||doc.hidden===true||!state.previewDate)return;
      if(dateMxNow()!==state.previewDate)load().catch(()=>{});
    },60000) : null;
    return Object.freeze({
      destroy(){disposed=true;requestNo++;if(midnightTimer!==null)win.clearInterval?.(midnightTimer);
        if(editing)cancelCellEdit();closeCreateDialog();root.removeEventListener('keydown',onKey);root.removeEventListener('submit',onSubmit);
        root.removeEventListener('dblclick',onDblClick);root.removeEventListener('focusout',onFocusOut);
        root.removeEventListener('click',onClick);root.removeEventListener('change',onChange);
        root.removeEventListener('input',onInput);
        root.replaceChildren();}
    });
  }
  win.ManttoCobranzaAdministracionPC_uni=Object.freeze({mount});
})(window,document);
