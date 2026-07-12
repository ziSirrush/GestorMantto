(function(){
  'use strict';

  const RL_PIPELINE=[
    'SIN PRODUCCIÓN / Documentación Pendiente',
    'SIN PRODUCCIÓN / Primera Visita a Obra',
    'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente',
    'SIN PRODUCCIÓN / Programados a Producción',
    'EN PRODUCCIÓN',
    'PARADOS POR CLIENTE',
    'PENDIENTE PAGO LIBERACIÓN',
    'PROGRAMADO',
    'EN TRÁNSITO',
    'PROGRAMA ENTREGA',
    'ALMACENADOS',
    'ENTREGADO'
  ];

  const RL_FIELDS={
    id_ppns:'PP NS',ph_ns:'PH NS',estatus:'Estatus',marca:'Marca',no_control:'No. control',cantidad:'Cantidad',proyecto:'Proyecto',
    supervisor:'Supervisor(a)',asesor:'Asesor',ict:'ICT',incoterm:'Incoterm',proveedor:'Proveedor',carpeta:'Carpeta',pvo:'PVO',
    pago_cliente:'Pago cliente',pago_liberacion:'Pago de liberación',fecha_produccion:'Fecha producción',fecha_estimada_obra:'Estimado obra',
    fecha_exw:'EXW date',puerto_origen:'POL',fecha_salida_estimada:'ETD',fecha_salida_real:'Real departure',tiempo_transito:'T/T',
    puerto_destino:'POD',fecha_llegada_estimada:'ETA',fecha_llegada_real:'Real arrival',fecha_pago_pedimento:'Pago pdmto',
    fecha_carga_transporte_nacional:'Loaded at truck or train',tiempo_aduana:'Tiempo aduana',lugar_entrega:'PLoD',
    fecha_entrega_programada:'Entrega programada',fecha_entrega_real_obra:'Entrega real en obra',fecha_entrada_almacen:'Fecha Alm.',
    fecha_salida_almacen:'Fecha Fin Alm.',fecha_termino_aditiva:'Aditiva termina',diferencia_dias:'Dif.',tiempo_total:'Tiempo total',
    comentarios:'Comentarios',estatus_corte_anterior:'Estatus corte anterior',fecha_corte_anterior:'Fecha corte anterior',fecha_sync:'Fecha sync'
  };

  const RL_DATE_FIELDS=new Set([
    'pago_liberacion','pago_cliente','fecha_produccion','fecha_estimada_obra','fecha_exw','fecha_salida_estimada','fecha_salida_real',
    'fecha_llegada_estimada','fecha_llegada_real','fecha_pago_pedimento','fecha_carga_transporte_nacional','fecha_entrega_programada',
    'fecha_entrega_real_obra','fecha_entrada_almacen','fecha_salida_almacen','fecha_termino_aditiva','fecha_corte_anterior','fecha_sync'
  ]);

  const RL_GROUPS=[
    ['Identificación',['ph_ns','id_ppns','no_control','proyecto','marca','cantidad','estatus','ict','incoterm','proveedor','carpeta','supervisor','asesor']],
    ['Pagos',['pago_cliente','pago_liberacion','pvo']],
    ['Producción',['fecha_produccion','fecha_estimada_obra','fecha_exw']],
    ['Embarque y transporte',['puerto_origen','fecha_salida_estimada','fecha_salida_real','tiempo_transito','puerto_destino','fecha_llegada_estimada','fecha_llegada_real','fecha_pago_pedimento','fecha_carga_transporte_nacional','lugar_entrega','tiempo_total']],
    ['Aduana',['tiempo_aduana']],
    ['Almacén y entrega',['fecha_entrega_programada','fecha_entrega_real_obra','fecha_entrada_almacen','fecha_salida_almacen','fecha_termino_aditiva','diferencia_dias']],
    ['Corte y sincronización',['estatus_corte_anterior','fecha_corte_anterior','fecha_sync']],
    ['Comentarios',['comentarios']]
  ];

  const RL_COLUMNS_BY_STATUS={
    'SIN PRODUCCION / DOCUMENTACION PENDIENTE':['ph_ns','proyecto','supervisor','asesor','proveedor','cantidad','carpeta','pago_cliente','puerto_origen','lugar_entrega','comentarios'],
    'SIN PRODUCCION / PRIMERA VISITA A OBRA':['ph_ns','proyecto','supervisor','asesor','proveedor','cantidad','carpeta','pvo','pago_cliente','fecha_produccion','fecha_estimada_obra','puerto_origen','lugar_entrega','no_control','comentarios'],
    'SIN PRODUCCION / PENDIENTE LIBERACION POR PARTE DEL CLIENTE':['ph_ns','proyecto','supervisor','asesor','proveedor','cantidad','carpeta','pvo','pago_cliente','fecha_produccion','fecha_estimada_obra','puerto_origen','lugar_entrega','no_control','comentarios'],
    'SIN PRODUCCION / PROGRAMADOS A PRODUCCION':['ph_ns','proyecto','supervisor','asesor','proveedor','cantidad','carpeta','pvo','pago_cliente','fecha_produccion','fecha_estimada_obra','puerto_origen','lugar_entrega','no_control','comentarios'],
    'EN PRODUCCION':['ph_ns','no_control','cantidad','proyecto','supervisor','asesor','pago_cliente','pago_liberacion','fecha_exw','incoterm','puerto_origen','puerto_destino','fecha_entrega_programada','comentarios'],
    'PARADOS POR CLIENTE':['ph_ns','proyecto','supervisor','asesor','proveedor','cantidad','pago_cliente','fecha_exw','puerto_origen','lugar_entrega','comentarios'],
    'PENDIENTE PAGO LIBERACION':['ph_ns','no_control','cantidad','proyecto','supervisor','asesor','incoterm','puerto_origen','puerto_destino','comentarios'],
    'PROGRAMADO':['ph_ns','no_control','cantidad','proyecto','supervisor','asesor','incoterm','fecha_exw','puerto_origen','fecha_salida_estimada','puerto_destino','fecha_llegada_estimada','comentarios'],
    'EN TRANSITO':['ph_ns','no_control','cantidad','proyecto','supervisor','asesor','ict','incoterm','fecha_exw','puerto_origen','fecha_salida_estimada','fecha_salida_real','tiempo_transito','fecha_llegada_estimada','fecha_llegada_real','fecha_estimada_obra'],
    'PROGRAMA ENTREGA':['ph_ns','cantidad','proyecto','supervisor','asesor','fecha_exw','fecha_salida_estimada','fecha_salida_real','tiempo_transito','fecha_llegada_estimada','fecha_llegada_real','fecha_pago_pedimento','fecha_carga_transporte_nacional','tiempo_aduana','lugar_entrega','fecha_entrega_real_obra','comentarios'],
    'ENTREGADO':['ph_ns','cantidad','proyecto','supervisor','asesor','fecha_exw','puerto_origen','fecha_salida_estimada','fecha_salida_real','tiempo_transito','puerto_destino','fecha_llegada_estimada','fecha_llegada_real','fecha_pago_pedimento','fecha_carga_transporte_nacional','tiempo_aduana','lugar_entrega','fecha_entrega_programada','fecha_entrega_real_obra','diferencia_dias','tiempo_total'],
    'ALMACENADOS':['ph_ns','cantidad','proyecto','supervisor','asesor','fecha_exw','puerto_origen','fecha_salida_estimada','fecha_salida_real','tiempo_transito','puerto_destino','fecha_llegada_estimada','fecha_llegada_real','fecha_pago_pedimento','fecha_carga_transporte_nacional','tiempo_aduana','lugar_entrega','fecha_entrega_programada','fecha_entrada_almacen','fecha_salida_almacen','fecha_termino_aditiva']
  };

  const RL_GEO={
    'ALGECIRA':[36.13,-5.45],'ALGECIRAS':[36.13,-5.45],'BARCELONA':[41.39,2.17],'VALENCIA':[39.47,-0.38],'ESPANA':[40.42,-3.7],
    'DALIAN':[38.91,121.6],'HUANGPU':[23.1,113.45],'NANSHA':[22.75,113.6],'NINGBO':[29.87,121.55],'QIGNDAO':[36.07,120.38],
    'QINGDAO':[36.07,120.38],'SHANGHAI':[31.23,121.47],'SHEKOU':[22.48,113.9],'XINGANG':[39,117.72],'CANADA':[56.13,-106.35],
    'ENSENADA':[31.86,-116.6],'LAREDO':[27.51,-99.51],'LAZARO C.':[17.96,-102.2],'MANZANILLO':[19.05,-104.32],
    'MAZATLAN':[23.25,-106.41],'PROGRESO':[21.28,-89.66],'VERACRUZ':[19.17,-96.13],'ACAPULCO':[16.86,-99.88],
    'AGUASCALIENTES':[21.88,-102.28],'CD GUZMAN':[19.69,-103.47],'CIUDAD GUZMAN':[19.69,-103.47],'CDMX':[19.43,-99.13],
    'CIUDAD DE MEXICO':[19.43,-99.13],'CABO SN LUCAS':[22.89,-109.91],'CANCUN':[21.16,-86.85],'CHIHUAHUA':[28.63,-106.07],
    'CUERNAVACA':[18.92,-99.22],'CULIACAN':[24.79,-107.38],'GUADALAJARA':[20.66,-103.35],'HUIXQUILUCAN':[19.36,-99.35],
    'LOS CABOS':[23.05,-109.7],'MTY':[25.69,-100.32],'MERIDA':[20.97,-89.62],'MONTERREY':[25.69,-100.32],
    'MORELIA':[19.7,-101.19],'OAXACA':[17.06,-96.73],'PACHUCA':[20.12,-98.73],'PLAYA DEL CARMEN':[20.63,-87.08],
    'PTO VALLARTA':[20.65,-105.23],'PUERTO VALLARTA':[20.65,-105.23],'VALLARTA':[20.65,-105.23],'PUEBLA':[19.04,-98.2],
    'QUERETARO':[20.59,-100.39],'JURIQUILLA, QRO':[20.7,-100.45],'REYNOSA':[26.09,-98.23],'SALTILLO':[25.42,-101],
    'SAN JOSE DEL CABO':[23.06,-109.7],'SAN LUIS POTOSI':[22.15,-100.98],'TAMPICO':[22.23,-97.86],'TIJUANA':[32.51,-117.02],
    'TOLUCA':[19.28,-99.66],'TULUM':[20.21,-87.46],'VILLAHERMOSA':[17.99,-92.93],'XALAPA':[19.54,-96.91],
    'BAJA CALIFORNIA SUR':[24.14,-110.31],'BAJA CALIFORNIA':[32.63,-115.47],'CHIAPAS':[16.75,-93.12],'COAHUILA':[25.42,-101],
    'ESTADO DE MEXICO':[19.28,-99.66],'EDO MEXICO':[19.28,-99.66],'EDO. MEX.':[19.28,-99.66],'GUANAJUATO':[21.02,-101.26],
    'GUERRERO':[17.55,-99.5],'JALISCO':[20.66,-103.35],'MICHOACAN':[19.7,-101.19],'NUEVO LEON':[25.69,-100.32],
    'QUINTANA ROO':[18.5,-88.3],'SINALOA':[24.79,-107.38],'TAMAULIPAS':[23.74,-99.14],'TLAXCALA':[19.32,-98.24],
    'YUCATAN':[20.97,-89.62],'CDMX- XALAPA':[19.43,-99.13],'CDMX-MERIDA':[19.43,-99.13]
  };

  const RL_PROVIDER_GEO={HIDRAL:[37.39,-5.98],ORONA:[43.27,-1.97],XIZI:[30.27,120.16],BLT:[41.81,123.43]};
  const RL_MAP_STATUS={
    'EN PRODUCCION':{category:'origin',color:'#2563eb'},'PARADOS POR CLIENTE':{category:'origin',color:'#2563eb'},
    'PENDIENTE PAGO LIBERACION':{category:'origin',color:'#2563eb'},PROGRAMADO:{category:'origin',color:'#2563eb'},
    'EN TRANSITO':{category:'transit',color:'#d97706'},ALMACENADOS:{category:'warehouse',color:'#7c3aed'},
    'PROGRAMA ENTREGA':{category:'destination',color:'#0891b2'},ENTREGADO:{category:'delivered',color:'#16a34a'}
  };
  const RL_WORLD_MAP='https://commons.wikimedia.org/wiki/Special:FilePath/BlankMap-World-Equirectangular.svg';
  const RL_MEXICO_MAP='https://commons.wikimedia.org/wiki/Special:FilePath/Blank_map_of_Mexico.svg';
  const RL_VB_TRANSIT={lonMin:-30,lonMax:330,latMin:-60,latMax:75};
  const RL_VB_ATLANTIC={lonMin:-125,lonMax:40,latMin:-50,latMax:70};
  const RL_VB_WORLD={lonMin:-180,lonMax:180,latMin:-60,latMax:75};
  const RL_MEXICO_BBOX={lonMin:-118,lonMax:-86,latMin:14,latMax:33};

  const state={rows:[],loaded:false,requestedStatus:'',search:'',detailId:''};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null||v===''?'—':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rawEsc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v==null?'':v).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const api=()=>String(window.MANTTO_API_BASE||'http://localhost:3001').replace(/\/$/,'');

  const HTML=`<div class="rl-page">
    <section class="rl-card rl-head rl-list-view">
      <div><p class="rl-eyebrow">Aiven · Logística</p><h1>Reporte de Logística</h1><p>Detalle operativo por etapa del pipeline.</p></div>
      <div class="rl-actions"><span id="rl-status" class="rl-status"><span class="rl-dot"></span><span>Cargando Aiven...</span></span><button id="rl-refresh" class="rl-btn" type="button">↻ Actualizar</button></div>
    </section>
    <section class="rl-card rl-section rl-list-view">
      <div class="rl-section-head"><div><h2>Detalle por estatus</h2><p>Una sección abierta a la vez. Las columnas respetan la definición original de cada etapa.</p></div><small id="rl-total">—</small></div>
      <div class="rl-search-wrap"><span class="rl-search-icon" aria-hidden="true">⌕</span><input id="rl-search" class="rl-search" type="search" placeholder="Buscar proyecto, PP NS o No. control..." autocomplete="off" aria-label="Buscar proyecto"><button id="rl-search-clear" class="rl-search-clear" type="button" aria-label="Limpiar búsqueda" hidden>×</button></div>
      <div id="rl-search-summary" class="rl-search-summary" hidden></div><div id="rl-stack" class="rl-stack"></div>
    </section>
    <section id="rl-detail-view" class="rl-detail-view" hidden>
      <section class="rl-card rl-detail-head"><button id="rl-detail-back" class="rl-btn" type="button">← Volver al reporte</button><div><p class="rl-eyebrow">Logística</p><h1 id="rl-detail-title">Detalle</h1><p id="rl-detail-subtitle">—</p></div></section>
      <section class="rl-card rl-section"><div class="rl-section-head"><div><h2>Detalle de Logística</h2><p id="rl-detail-description">Información correspondiente a la etapa seleccionada.</p></div><span id="rl-detail-chip" class="rl-status-chip">—</span></div><div id="rl-detail-body"></div></section>
    </section>
  </div>`;

  function formatDate(value){
    if(value===null||value===undefined||value==='')return '—';
    const text=String(value).trim();
    const match=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if(!match)return text;
    return `${match[3]}/${match[2]}/${match[1]}${match[4]&&match[5]?` - ${match[4]}:${match[5]}`:''}`;
  }
  function displayValue(row,key){return RL_DATE_FIELDS.has(key)?formatDate(row[key]):(row[key]==null||row[key]===''?'—':row[key]);}
  function hasValue(value){return value!==null&&value!==undefined&&value!=='';}
  function statusColumns(status){return RL_COLUMNS_BY_STATUS[norm(status)]||null;}
  function allColumns(){return Object.keys(RL_FIELDS);}
  function setStatus(cls,msg){const el=$('rl-status');if(!el)return;el.className='rl-status '+cls;el.innerHTML='<span class="rl-dot"></span><span>'+esc(msg)+'</span>';}

  async function fetchRows(){
    if(window.ManttoLogisticaStore&&Array.isArray(window.ManttoLogisticaStore.rows)&&window.ManttoLogisticaStore.rows.length)return window.ManttoLogisticaStore.rows;
    const headers=Object.assign({'Accept':'application/json'},window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{});
    const response=await fetch(api()+'/api/logistica?limit=5000',{headers,cache:'no-store'});
    const raw=await response.text();let json;
    try{json=raw?JSON.parse(raw):{};}catch(error){throw new Error('Respuesta no JSON del backend.');}
    if(!response.ok||!json.ok)throw new Error(json.message||json.error||'Error consultando Logística');
    const rows=Array.isArray(json.data)?json.data:[];
    window.ManttoLogisticaStore={rows,loadedAt:Date.now()};
    return rows;
  }

  function deliveredCurrentYear(row){
    const match=String(row.fecha_entrega_real_obra||'').match(/^(\d{4})/);
    return norm(row.estatus)==='ENTREGADO'&&match&&Number(match[1])===new Date().getFullYear();
  }
  function rowsFor(status){
    const query=norm(state.search);
    return state.rows.filter(row=>norm(row.estatus)===norm(status))
      .filter(row=>norm(status)!=='ENTREGADO'||deliveredCurrentYear(row))
      .filter(row=>!query||[row.proyecto,row.id_ppns,row.no_control,row.proveedor,row.supervisor,row.asesor].some(value=>norm(value).includes(query)));
  }

  function tableHtml(rows,status){
    if(!rows.length)return '<div class="rl-empty">Sin registros en esta sección.</div>';
    const columns=statusColumns(status)||allColumns();
    const note=statusColumns(status)?'Columnas confirmadas para esta etapa.':'Esta etapa no tiene columnas específicas; se muestran todos los campos disponibles.';
    return `<div class="rl-table-note">${esc(note)} Clic en una fila para ver el detalle.</div><div class="rl-table-wrap"><table class="rl-table"><thead><tr>${columns.map(key=>`<th>${esc(RL_FIELDS[key]||key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr data-id="${esc(row.id_log_ops)}">${columns.map(key=>`<td>${esc(displayValue(row,key))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function closeAllAccordions(except){
    document.querySelectorAll('.rl-accordion.open').forEach(accordion=>{
      if(accordion===except)return;
      accordion.classList.remove('open');
      const button=accordion.querySelector('.rl-accordion-head');
      if(button)button.setAttribute('aria-expanded','false');
    });
  }

  function render(){
    const extras=[...new Set(state.rows.map(row=>row.estatus).filter(Boolean))].filter(status=>!RL_PIPELINE.some(item=>norm(item)===norm(status)));
    const statuses=RL_PIPELINE.concat(extras);
    const searching=Boolean(state.search.trim());
    const statusData=statuses.map(status=>({status,rows:rowsFor(status)}));
    const visible=searching?statusData.filter(item=>item.rows.length):statusData;
    const visibleCount=statusData.reduce((sum,item)=>sum+item.rows.length,0);
    $('rl-total').textContent=searching?`${visibleCount} coincidencia${visibleCount===1?'':'s'}`:`${state.rows.length} registros`;
    const summary=$('rl-search-summary');
    if(summary){summary.hidden=!searching;summary.textContent=searching?(visibleCount?`${visibleCount} registro${visibleCount===1?'':'s'} localizado${visibleCount===1?'':'s'}.`:'No se encontraron registros con ese texto.'):'';}
    if(!visible.length){$('rl-stack').innerHTML='<div class="rl-empty">No se encontraron registros con ese texto.</div>';return;}
    let autoOpen='';
    if(state.requestedStatus&&visible.some(item=>norm(item.status)===norm(state.requestedStatus)))autoOpen=state.requestedStatus;
    else if(searching)autoOpen=visible[0].status;
    $('rl-stack').innerHTML=visible.map(item=>{
      const open=autoOpen&&norm(autoOpen)===norm(item.status);
      const outside=!RL_PIPELINE.some(status=>norm(status)===norm(item.status));
      const label=`${item.status}${norm(item.status)==='ENTREGADO'?' (año en curso)':''}${outside?' (fuera del pipeline)':''}`;
      return `<article class="rl-accordion ${open?'open':''}" data-status="${esc(item.status)}"><button class="rl-accordion-head" type="button" aria-expanded="${open?'true':'false'}"><span class="rl-chevron">›</span><span class="rl-title">${esc(label)}</span><span class="rl-count">${item.rows.length}</span></button><div class="rl-accordion-body">${tableHtml(item.rows,item.status)}</div></article>`;
    }).join('');
    document.querySelectorAll('.rl-accordion-head').forEach(button=>button.onclick=()=>{
      const accordion=button.closest('.rl-accordion');const shouldOpen=!accordion.classList.contains('open');
      closeAllAccordions(shouldOpen?accordion:null);accordion.classList.toggle('open',shouldOpen);button.setAttribute('aria-expanded',shouldOpen?'true':'false');
    });
    document.querySelectorAll('.rl-table [data-id]').forEach(row=>row.onclick=()=>openDetail(row.dataset.id));
    if(autoOpen)window.setTimeout(()=>{const accordion=[...document.querySelectorAll('.rl-accordion')].find(item=>norm(item.dataset.status)===norm(autoOpen));if(accordion)accordion.scrollIntoView({behavior:'smooth',block:'start'});},0);
    state.requestedStatus='';
  }

  function coords(value){return value?RL_GEO[norm(value)]||null:null;}
  function factoryCoords(value){return value?RL_PROVIDER_GEO[norm(value)]||null:null;}
  function adjustLon(lon,vb){let value=lon;while(value<vb.lonMin)value+=360;while(value>vb.lonMax)value-=360;return value;}
  function pctView(lat,lon,vb){const adjusted=adjustLon(lon,vb);return [((adjusted-vb.lonMin)/(vb.lonMax-vb.lonMin))*100,((vb.latMax-lat)/(vb.latMax-vb.latMin))*100];}
  function pinHtml(lat,lon,vb,color,label){const [left,top]=pctView(lat,lon,vb);return `<div class="rl-map-pin" style="left:${left}%;top:${top}%;background:${color}"></div><div class="rl-map-pin-label" style="left:${left}%;top:${top}%">${rawEsc(label)}</div>`;}
  function backgroundHtml(vb){
    const width=vb.lonMax-vb.lonMin,height=vb.latMax-vb.latMin,scaleW=360/width*100,scaleH=180/height*100,left1=-((vb.lonMin+180)/width)*100,left2=left1+scaleW,top=-((90-vb.latMax)/height)*100;
    const style=`position:absolute;top:${top}%;width:${scaleW}%;height:${scaleH}%;max-width:none;`;
    return `<img src="${RL_WORLD_MAP}" alt="Mapa mundial" style="${style}left:${left1}%"><img src="${RL_WORLD_MAP}" alt="" aria-hidden="true" style="${style}left:${left2}%">`;
  }
  function shipPosition(pol,pod,etd,eta,vb){
    if(!etd||!eta)return null;const start=new Date(etd),end=new Date(eta),now=new Date();
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)return null;
    const progress=Math.max(0,Math.min(1,(now-start)/(end-start)));const lonStart=adjustLon(pol[1],vb);let lonEnd=adjustLon(pod[1],vb);if(lonEnd<lonStart)lonEnd+=360;
    return [pol[0]+progress*(pod[0]-pol[0]),lonStart+progress*(lonEnd-lonStart)];
  }
  function isEuropeanOrigin(row){return ['HIDRAL','ORONA'].includes(norm(row.proveedor))||['ALGECIRA','ALGECIRAS','BARCELONA','VALENCIA','ESPANA'].includes(norm(row.puerto_origen));}
  function pctMexico(lat,lon){return [((lon-RL_MEXICO_BBOX.lonMin)/(RL_MEXICO_BBOX.lonMax-RL_MEXICO_BBOX.lonMin))*100,((RL_MEXICO_BBOX.latMax-lat)/(RL_MEXICO_BBOX.latMax-RL_MEXICO_BBOX.latMin))*100+2.5];}
  function mexicoPin(lat,lon,color,label){const [left,top]=pctMexico(lat,lon);return `<div class="rl-map-pin" style="left:${left}%;top:${top}%;background:${color}"></div><div class="rl-map-pin-label" style="left:${left}%;top:${top}%">${rawEsc(label)}</div>`;}
  function mexicoPinByName(name,color,label){const point=coords(name);return point?mexicoPin(point[0],point[1],color,label):'';}

  function mapHtml(row){
    const meta=RL_MAP_STATUS[norm(row.estatus)];if(!meta)return '';
    const pol=coords(row.puerto_origen),pod=coords(row.puerto_destino),destination=coords(row.lugar_entrega),factory=factoryCoords(row.proveedor);
    let pins='',ship='',note='',extra='',hasPin=false,useMexico=false,vb=RL_VB_WORLD;
    if(meta.category==='origin'){
      if(factory){pins+=pinHtml(factory[0],factory[1],vb,meta.color,`Fábrica (${row.proveedor||''})`);hasPin=true;}else note=`Sin ubicación de fábrica conocida para el proveedor “${row.proveedor||'sin dato'}”.`;
    }else if(meta.category==='transit'){
      vb=isEuropeanOrigin(row)?RL_VB_ATLANTIC:RL_VB_TRANSIT;
      if(pol){pins+=pinHtml(pol[0],pol[1],vb,'#9ca3af',`Salida: ${row.puerto_origen}`);hasPin=true;}
      if(pod){pins+=pinHtml(pod[0],pod[1],vb,meta.color,`Puerto de llegada: ${row.puerto_destino}`);hasPin=true;}
      if(destination){pins+=pinHtml(destination[0],destination[1],vb,'#16a34a',`Destino final: ${row.lugar_entrega}`);hasPin=true;}
      if(pol&&pod){const point=shipPosition(pol,pod,row.fecha_salida_estimada,row.fecha_llegada_estimada,vb);if(point){const [left,top]=pctView(point[0],point[1],vb);ship=`<div class="rl-map-ship" style="left:${left}%;top:${top}%">🚢</div>`;}}
      if(!hasPin)note='Sin coordenadas conocidas de POL, POD o PLoD para graficar la ruta.';
    }else if(meta.category==='warehouse'){
      useMexico=true;pins+=mexicoPin(19.43,-99.13,meta.color,'En bodega (CDMX)');hasPin=true;
      if(row.puerto_destino)pins+=mexicoPinByName(row.puerto_destino,'#9ca3af',`Puerto de llegada: ${row.puerto_destino}`);
      if(row.lugar_entrega)pins+=mexicoPinByName(row.lugar_entrega,'#16a34a',`Destino final: ${row.lugar_entrega}`);
      extra=[row.puerto_destino&&`Puerto de llegada: ${row.puerto_destino}`,row.lugar_entrega&&`Entrega prevista en: ${row.lugar_entrega}`].filter(Boolean).join(' · ');
    }else if(meta.category==='destination'){
      useMexico=true;if(row.puerto_destino)pins+=mexicoPinByName(row.puerto_destino,'#9ca3af',`Puerto: ${row.puerto_destino}`);if(row.lugar_entrega)pins+=mexicoPinByName(row.lugar_entrega,meta.color,`Destino final: ${row.lugar_entrega}`);hasPin=Boolean((row.puerto_destino&&coords(row.puerto_destino))||(row.lugar_entrega&&coords(row.lugar_entrega)));if(!hasPin)note='Sin coordenadas conocidas de POD o PLoD.';
    }else if(meta.category==='delivered'){
      useMexico=true;const name=row.lugar_entrega||row.puerto_destino;const point=coords(name);if(point){pins+=mexicoPin(point[0],point[1],meta.color,`Entregado en: ${name}`);hasPin=true;}else note='Sin coordenadas conocidas de PLoD o POD.';
    }
    if(!hasPin)return `<section class="rl-detail-block"><h3>Ubicación del material</h3><div class="rl-map-note">${esc(note||'Sin datos de ubicación para graficar.')}</div></section>`;
    if(useMexico)return `<section class="rl-detail-block"><h3>Ubicación del material</h3><div class="rl-map-wrap rl-map-mexico"><img src="${RL_MEXICO_MAP}" alt="Mapa de México">${pins}</div>${extra?`<div class="rl-map-legend">${esc(extra)}</div>`:''}<div class="rl-map-legend">Ubicación aproximada según el estatus <b style="color:${meta.color}">●</b> ${esc(row.estatus)}.</div></section>`;
    const aspect=`${vb.lonMax-vb.lonMin} / ${vb.latMax-vb.latMin}`;
    return `<section class="rl-detail-block"><h3>Ubicación del material</h3><div class="rl-map-wrap" style="aspect-ratio:${aspect}">${backgroundHtml(vb)}${pins}${ship}</div>${extra?`<div class="rl-map-legend">${esc(extra)}</div>`:''}<div class="rl-map-legend">Ubicación aproximada; mapa público de Wikimedia Commons. El barco se calcula con ETD y ETA.</div></section>`;
  }

  function detailFieldsHtml(row){
    const defined=statusColumns(row.estatus);
    if(defined){
      return `<div class="rl-detail-table-wrap"><table class="rl-field-table"><tbody>${defined.map(key=>`<tr><th>${esc(RL_FIELDS[key]||key)}</th><td>${esc(displayValue(row,key))}</td></tr>`).join('')}</tbody></table></div>`;
    }
    return `<div class="rl-map-note">Esta etapa no tiene columnas específicas; se muestra el detalle completo agrupado.</div>${RL_GROUPS.map(([title,keys])=>{
      const rows=keys.filter(key=>hasValue(row[key])).map(key=>`<tr><th>${esc(RL_FIELDS[key]||key)}</th><td>${esc(displayValue(row,key))}</td></tr>`).join('');
      return rows?`<section class="rl-detail-block"><h3>${esc(title)}</h3><div class="rl-detail-table-wrap"><table class="rl-field-table"><tbody>${rows}</tbody></table></div></section>`:'';
    }).join('')}`;
  }

  function openDetail(id){
    const row=state.rows.find(item=>String(item.id_log_ops)===String(id));if(!row)return;
    state.detailId=String(id);document.querySelectorAll('.rl-list-view').forEach(element=>element.hidden=true);$('rl-detail-view').hidden=false;
    $('rl-detail-title').textContent=row.proyecto||'Detalle de Logística';$('rl-detail-subtitle').textContent=`No. control: ${row.no_control||'—'} · Marca: ${row.marca||'—'} · Cantidad: ${row.cantidad??'—'}`;
    $('rl-detail-chip').textContent=row.estatus||'Sin estatus';$('rl-detail-description').textContent=statusColumns(row.estatus)?'Campos definidos para la etapa seleccionada.':'Detalle completo agrupado para una etapa sin definición específica.';
    $('rl-detail-body').innerHTML=detailFieldsHtml(row)+mapHtml(row);
    const main=document.querySelector('.main-content');if(main)main.scrollTop=0;window.scrollTo?.({top:0,behavior:'auto'});
  }
  function closeDetail(){state.detailId='';$('rl-detail-view').hidden=true;document.querySelectorAll('.rl-list-view').forEach(element=>element.hidden=false);render();}
  async function load(){setStatus('','Cargando Aiven...');try{state.rows=await fetchRows();state.loaded=true;render();setStatus('ok',`Aiven conectado · ${state.rows.length} registros`);if(state.detailId)openDetail(state.detailId);}catch(error){setStatus('error',error.message);$('rl-stack').innerHTML='<div class="rl-empty">No se pudo cargar Reporte de Logística.</div>';}}
  function init(payload){
    const view=$('view-logistica-reporte');if(!view)return;if(!view.querySelector('#rl-refresh')||!view.querySelector('#rl-stack'))view.innerHTML=HTML;
    state.requestedStatus=payload&&payload.estatus?payload.estatus:'';state.detailId=payload&&payload.detailId?String(payload.detailId):'';if(payload&&(payload.search||payload.id_ppns))state.search=String(payload.search||payload.id_ppns||'');
    const refresh=$('rl-refresh'),back=$('rl-detail-back'),search=$('rl-search'),clear=$('rl-search-clear');
    if(search){search.value=state.search;search.oninput=()=>{state.search=search.value;clear.hidden=!state.search;render();};}
    if(clear){clear.hidden=!state.search;clear.onclick=()=>{state.search='';if(search){search.value='';search.focus();}clear.hidden=true;render();};}
    if(refresh)refresh.onclick=()=>{window.ManttoLogisticaStore=null;load();};if(back)back.onclick=closeDetail;
    if(state.loaded){render();if(state.detailId)openDetail(state.detailId);}else load();
  }

  window.ManttoReporteLogistica={init,reload:load};
})();
