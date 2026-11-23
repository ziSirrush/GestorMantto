(function(){
  'use strict';
  if(window.ManttoCobranzaCorDashboard) return;

  // DS: utiliza el motor publico de Estados de Cuenta; no define formulas de cartera.
  const ROUTE='cobranza-dashboard';
  const ENDPOINT='/api/cobranza-cor/dashboard';
  const PAGE_SIZE=8;
  const SUMMARY_PAGE_SIZE=24;
  const CURRENCY_ORDER=['USD','EUR','MXN'];
  const state={
    root:null,loading:false,sequence:0,total:0,items:[],complete:false,riskPage:1,
    years:[],advisors:[],
    filters:{q:'',anio_cobro:String(new Date().getFullYear()),asesor:'',moneda:''},
    error:'',initialized:false
  };


  // La revision de datos/contrato es distinta de la version de API/Frontend:
  // un cambio de conexion o deploy no descarta un resultado compatible.
  // Solo sessionStorage (pestana), nunca localStorage ni almacenamiento del servidor.
  const COR_CACHE_CONTRACT='COR_FINANCIAL_SUMMARY_V1';
  const COR_CACHE_PREFIX='blt:cor:dashboard:session:v1:';
  const COR_CACHE_MAX_AGE_MS=2*60*60*1000;
  const COR_CACHE_MAX_BYTES=3*1024*1024;
  function cacheKey_cor(){
    const identity=window.ManttoHttp?.scopeKey?.();
    if(typeof identity!=='string'||!identity||identity==='anon:anon:anon')return null;
    return COR_CACHE_PREFIX+encodeURIComponent(identity);
  }
  function cacheFilters_cor(){
    return JSON.stringify(['q','asesor','moneda'].map(key=>String(state.filters[key]||'')));
  }
  function cacheRead_cor(){
    try{
      const key=cacheKey_cor();
      if(!key||!window.sessionStorage)return null;
      const content=window.sessionStorage.getItem(key);
      if(!content)return null;
      const value=JSON.parse(content);
      if(value?.contract!==COR_CACHE_CONTRACT ||
        value?.filters!==cacheFilters_cor() ||
        !Number.isFinite(value.savedAt) ||
        Date.now()-value.savedAt<0 ||
        Date.now()-value.savedAt>COR_CACHE_MAX_AGE_MS ||
        !Array.isArray(value.pages))return null;
      return value;
    }catch(_error){return null;}
  }
  function cacheSave_cor(pages,scope){
    try{
      const key=cacheKey_cor();
      if(!key||!window.sessionStorage||pages.length>1000)return;
      const text=JSON.stringify({contract:COR_CACHE_CONTRACT,
        filters:cacheFilters_cor(),savedAt:Date.now(),scope,pages});
      if(text.length>COR_CACHE_MAX_BYTES)return;
      window.sessionStorage.setItem(key,text);
    }catch(_error){
      // Espacio insuficiente o almacenamiento deshabilitado: leer desde API.
    }
  }
  function cacheInvalidate_cor(ppns){
    try{
      const key=cacheKey_cor();
      if(!key||!window.sessionStorage)return;
      const previous=cacheRead_cor();
      if(!previous||!ppns){window.sessionStorage.removeItem(key);return;}
      const normalized=normalize_cor(ppns);
      for(const page of previous.pages){
        page.revisions=(page.revisions||[]).filter(row=>normalize_cor(row.ppns)!==normalized);
      }
      cacheSave_cor(previous.pages,previous.scope);
    }catch(_error){}
  }
  function cacheInvalidateAll_cor(){
    try{
      if(!window.sessionStorage)return;
      for(let i=window.sessionStorage.length-1;i>=0;i--){
        const key=window.sessionStorage.key(i);
        if(key&&key.startsWith(COR_CACHE_PREFIX))window.sessionStorage.removeItem(key);
      }
    }catch(_error){}
  }
  function checkedPageRows_cor(response,cachedPage,allowedToReuse){
    if(response?.cache?.contract!==COR_CACHE_CONTRACT)return null;
    const revisions=response.cache.revisions;
    if(!Array.isArray(revisions)||revisions.length>SUMMARY_PAGE_SIZE)
      throw new Error('Revision financiera incompleta.');
    const previous=new Map();
    const prevTokens=new Map();
    if(allowedToReuse&&cachedPage){
      for(const row of cachedPage.items||[]){
        const key=normalize_cor(row?.proyecto?.ppns);
        if(key)previous.set(key,row);
      }
      for(const rev of cachedPage.revisions||[]){
        const key=normalize_cor(rev.ppns);
        if(key)prevTokens.set(key,rev.revision);
      }
    }
    const fresh=new Map((response.data||[]).map(row=>[normalize_cor(row?.proyecto?.ppns),row]));
    const seen=new Set();
    const rows=revisions.map(rev=>{
      const key=normalize_cor(rev?.ppns);
      if(!key||seen.has(key)||!/^[a-f0-9]{64}$/i.test(String(rev?.revision||'')))
        throw new Error('Identificador de revision COR invalido.');
      seen.add(key);
      if(fresh.has(key))return fresh.get(key);
      if(prevTokens.get(key)===rev.revision && previous.has(key))return previous.get(key);
      throw new Error('La cache de Cobranza no coincide con el servidor.');
    });
    if(fresh.size>seen.size || [...fresh.keys()].some(key=>!seen.has(key)))
      throw new Error('La respuesta financiera contiene un proyecto fuera de pagina.');
    return {items:rows,revisions};
  }

  function active_cor(){
    return window.ManttoRouter?.getCurrent?.()?.route===ROUTE;
  }
  function escape_cor(value){
    return String(value===null||value===undefined?'':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function num_cor(value){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  }
  function normalize_cor(value){
    return String(value||'').trim().toUpperCase();
  }
  function round_cor(value){return Math.round(((num_cor(value)||0)+Number.EPSILON)*100)/100;}
  function money_cor(value,currency){
    if(!Number.isFinite(value))return 'N/D';
    const code=normalize_cor(currency);
    if(/^[A-Z]{3}$/.test(code)&&code!=='SIN_MONEDA'){
      try{return new Intl.NumberFormat('es-MX',{style:'currency',currency:code,minimumFractionDigits:2,maximumFractionDigits:2}).format(value);}
      catch(_error){}
    }
    return new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+(code==='SIN_MONEDA'?' (sin moneda)':'');
  }
  function pct_cor(value){
    return Number.isFinite(value)?new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(value*100)+'%':'N/D';
  }
  function integer_cor(value){return new Intl.NumberFormat('es-MX',{maximumFractionDigits:0}).format(value||0);}
  function dateStamp_cor(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match)return null;
    const stamp=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));
    const check=new Date(stamp);
    return check.getUTCFullYear()===Number(match[1])&&check.getUTCMonth()===Number(match[2])-1
      &&check.getUTCDate()===Number(match[3])?stamp:null;
  }
  function month_cor(value){return dateStamp_cor(value)===null?null:String(value).slice(0,7);}
  function advisorInfo_cor(project){
    const count=Number(project?.asesores_distintos)||0;
    if(count>1)return {key:'MULTIPLE',label:'Varios asesores (revisar)'};
    const id=Number(project?.id_asesor);
    if(Number.isSafeInteger(id)&&id>0)return {key:'ID:'+id,label:String(project?.asesor||'ID '+id).trim()};
    return {key:'SIN_ASESOR',label:'Sin asesor'};
  }
  function bucket_cor(map,key){
    if(!map.has(key))map.set(key,{
      key,proyectos:new Set(),total:0,cobrado:0,pendiente:0,vencido:0,hitos:0,
      hitosVencidos:0,diasVencidosSum:0,diasVencidosN:0,
      antiguedad:{corriente:0,'31-60':0,'61-90':0,'91-180':0,'181+':0,indeterminado:0},
      fechasFuente:new Map(),fechasComplemento:new Map(),
      pagosAplicados:0,comprobantes:0,diasCobroSum:0,diasCobroN:0
    });
    return map.get(key);
  }
  function addMonth_cor(target,month,amount){
    if(month&&amount>0)target.set(month,round_cor((target.get(month)||0)+amount));
  }
  function ageKey_cor(days){
    if(days===null)return 'indeterminado';
    if(days<31)return 'corriente';
    if(days<=60)return '31-60';
    if(days<=90)return '61-90';
    if(days<=180)return '91-180';
    return '181+';
  }

  // Reagrupar exclusivamente filas calculadas por el motor existente.
  function aggregate_cor(details,filters,motor){
    if(!motor||typeof motor.calcularFilas!=='function'||typeof motor.resumirFilas!=='function'){
      throw new Error('No esta disponible el motor de Estados de Cuenta.');
    }
    const byCurrency=new Map();
    const byAdvisor=new Map();
    const projectRisk=new Map();
    const byPPNS=new Set();
    const problems={variosAsesores:0,sinAsesor:0,hitosSinMoneda:0,sinFechaVencimiento:0,fechaFacturaDisponible:0};
    const requestedCurrency=normalize_cor(filters?.moneda);
    const analyzed=[];

    for(const detail of Array.isArray(details)?details:[]){
      const project=detail?.proyecto||{};
      const ppns=String(project.ppns||'').trim();
      if(!ppns||byPPNS.has(ppns.toUpperCase()))continue;
      byPPNS.add(ppns.toUpperCase());
      const advisor=advisorInfo_cor(project);
      const asesor=advisor.label;
      if(asesor==='Varios asesores (revisar)')problems.variosAsesores++;
      if(asesor==='Sin asesor')problems.sinAsesor++;
      const allRows=motor.calcularFilas(detail);
      const rows=(Array.isArray(allRows)?allRows:[]).filter(row=>
        !requestedCurrency||normalize_cor(row?.moneda||'SIN_MONEDA')===requestedCurrency
      );
      const summaries=motor.resumirFilas(rows);
      const matched=new Set(rows.map(r=>Number(r?.id_fuente_cor)).filter(Number.isInteger));
      const invoiceMap=new Map();
      for(const invoice of Array.isArray(detail.facturas)?detail.facturas:[]){
        if(normalize_cor(invoice.tipo_concepto)!=='HITO'||!matched.has(Number(invoice.id_fuente_cor)))continue;
        if(requestedCurrency&&normalize_cor(invoice.moneda||'SIN_MONEDA')!==requestedCurrency)continue;
        const ids=Array.isArray(invoice.ids_factura_cor)&&invoice.ids_factura_cor.length
          ?invoice.ids_factura_cor:[invoice.id_factura_cor];
        for(const id of ids){
          if(Number.isInteger(Number(id)))invoiceMap.set(Number(id),invoice);
        }
        if(dateStamp_cor(invoice.fecha_factura)!==null)problems.fechaFacturaDisponible++;
      }
      const pagos=new Map((Array.isArray(detail.pagos)?detail.pagos:[])
        .map(p=>[Number(p.id_pago_cor),p]));
      const pagoByCurrency=new Map();
      const seenRelations=new Set();
      const complementEvents=new Map();
      for(const relation of Array.isArray(detail.relaciones_pagos)?detail.relaciones_pagos:[]){
        const facturaId=Number(relation.id_factura_cor);
        const pagoId=Number(relation.id_pago_cor);
        const pair=facturaId+'|'+pagoId;
        if(seenRelations.has(pair))continue;
        seenRelations.add(pair);
        const invoice=invoiceMap.get(facturaId);
        const pago=pagos.get(pagoId);
        const applied=num_cor(relation.importe_aplicado);
        if(!invoice||!pago||applied===null||applied<=0)continue;
        const moneda=normalize_cor(invoice.moneda||'SIN_MONEDA')||'SIN_MONEDA';
        const key=pagoId+'|'+moneda;
        pagoByCurrency.set(key,{moneda,amount:round_cor((pagoByCurrency.get(key)?.amount||0)+applied)});
        const mes=month_cor(pago.fecha_pago);
        if(mes){
          const eventKey=moneda+'|'+mes;
          complementEvents.set(eventKey,round_cor((complementEvents.get(eventKey)||0)+applied));
          const invoiceDate=dateStamp_cor(invoice.fecha_factura),paidDate=dateStamp_cor(pago.fecha_pago);
          if(invoiceDate!==null&&paidDate!==null&&paidDate>=invoiceDate){
            const bucket=bucket_cor(byCurrency,moneda);
            bucket.diasCobroSum+=(paidDate-invoiceDate)/86400000;
            bucket.diasCobroN++;
          }
        }
      }
      for(const summary of Array.isArray(summaries)?summaries:[]){
        const currency=normalize_cor(summary.moneda)||'SIN_MONEDA';
        const main=bucket_cor(byCurrency,currency);
        const advisorBucket=bucket_cor(byAdvisor,advisor.key+'|'+currency);
        advisorBucket.asesor=asesor;
        for(const b of [main,advisorBucket]){
          b.proyectos.add(ppns);
          b.total+=num_cor(summary.total)||0;
          b.cobrado+=num_cor(summary.cobrado)||0;
          b.pendiente+=num_cor(summary.pendiente)||0;
          b.hitos+=Number(summary.registros||0);
        }
      }
      const risks=new Map();
      for(const row of rows){
        const moneda=normalize_cor(row.moneda)||'SIN_MONEDA';
        const main=bucket_cor(byCurrency,moneda);
        const advisorBucket=bucket_cor(byAdvisor,advisor.key+'|'+moneda);
        advisorBucket.asesor=asesor;
        const pending=Math.max(num_cor(row.pendiente_calculado)||0,0);
        const days=num_cor(row.dias_vencimiento);
        const overdue=pending>0.005&&normalize_cor(row.estatus_vencimiento)==='VENCIDO';
        const date=month_cor(row.fecha_pago);
        const direct=Math.max(num_cor(row.pago_contabilizado)||0,0);
        for(const bucket of [main,advisorBucket]){
          addMonth_cor(bucket.fechasFuente,date,direct);
          if(overdue){
            bucket.vencido+=pending;
            bucket.hitosVencidos++;
            if(days!==null){bucket.diasVencidosSum+=Math.max(days,0);bucket.diasVencidosN++;}
          }
          if(pending>0.005)bucket.antiguedad[ageKey_cor(days)]+=pending;
        }
        if(!row.moneda)problems.hitosSinMoneda++;
        if(pending>0.005&&days===null)problems.sinFechaVencimiento++;
        if(overdue){
          const risk=bucket_cor(risks,moneda);
          risk.vencido+=pending;
          risk.hitosVencidos++;
        }
      }
      for(const [key,amount] of complementEvents){
        const [moneda,mes]=key.split('|');
        const main=bucket_cor(byCurrency,moneda);
        const advisorBucket=bucket_cor(byAdvisor,advisor.key+'|'+moneda);
        advisorBucket.asesor=asesor;
        addMonth_cor(main.fechasComplemento,mes,amount);
        addMonth_cor(advisorBucket.fechasComplemento,mes,amount);
      }
      for(const payment of pagoByCurrency.values()){
        const main=bucket_cor(byCurrency,payment.moneda);
        const advisorBucket=bucket_cor(byAdvisor,asesor+'|'+payment.moneda);
        for(const b of [main,advisorBucket]){
          b.pagosAplicados+=payment.amount;b.comprobantes++;
        }
      }
      for(const [currency,risk] of risks){
        projectRisk.set(ppns+'|'+currency,{
          ppns,proyecto:project.proyecto||ppns,asesor,moneda:currency,
          vencido:round_cor(risk.vencido),hitos: risk.hitosVencidos
        });
      }
      analyzed.push({ppns,project,rows,summaries});
    }
    for(const bucket of [...byCurrency.values(),...byAdvisor.values()]){
      for(const key of ['total','cobrado','pendiente','vencido','pagosAplicados'])bucket[key]=round_cor(bucket[key]);
      for(const key of Object.keys(bucket.antiguedad))bucket.antiguedad[key]=round_cor(bucket.antiguedad[key]);
    }
    return {byCurrency,byAdvisor,riesgos:[...projectRisk.values()].sort((a,b)=>currencyRank_cor(a.moneda)-currencyRank_cor(b.moneda)||b.vencido-a.vencido),proyectos:byPPNS.size,problems,analyzed};
  }

  function currencyRank_cor(key){const n=CURRENCY_ORDER.indexOf(key);return n<0?99:n;}
  function fixedCurrencies_cor(stats){return CURRENCY_ORDER.map(currency=>stats.byCurrency.get(currency)||bucket_cor(new Map(),currency));}
  function orderedCurrencies_cor(map){
    return [...map.values()].sort((a,b)=>currencyRank_cor(a.key)-currencyRank_cor(b.key));
  }
  function summarizeCard_cor(bucket){
    if(!bucket.proyectos.size)return '<article class="ccor-ds-currency"><header><h3>'+escape_cor(bucket.key)+'</h3></header><p class="ccor-ds-muted">Sin proyectos para esta moneda.</p></article>';
    const rate=bucket.total>0?bucket.cobrado/bucket.total:null;
    const risk=bucket.pendiente>0?bucket.vencido/bucket.pendiente:null;
    return '<article class="ccor-ds-currency"><header><h3>'+escape_cor(bucket.key)+'</h3><span>'+integer_cor(bucket.proyectos.size)+' PPNS</span></header>'
      +'<div class="ccor-ds-cardgrid">'
      +'<div><small>Monto inicial</small><strong>'+escape_cor(money_cor(bucket.total,bucket.key))+'</strong></div>'
      +'<div><small>Cobrado</small><strong>'+escape_cor(money_cor(bucket.cobrado,bucket.key))+'</strong></div>'
      +'<div><small>Pendiente</small><strong>'+escape_cor(money_cor(bucket.pendiente,bucket.key))+'</strong></div>'
      +'<div><small>Saldo vencido</small><strong>'+escape_cor(money_cor(bucket.vencido,bucket.key))+'</strong></div>'
      +'<div><small>% cobrado</small><strong>'+pct_cor(rate)+'</strong></div>'
      +'<div><small>Riesgo del pendiente</small><strong>'+pct_cor(risk)+'</strong></div>'
      +'<div><small>Prom. comprobante aplicado</small><strong>'+escape_cor(bucket.comprobantes?money_cor(bucket.pagosAplicados/bucket.comprobantes,bucket.key):'N/D')+'</strong></div>'
      +'<div><small>Prom. días desde factura</small><strong>'+escape_cor(bucket.diasCobroN?String(Math.round(bucket.diasCobroSum/bucket.diasCobroN))+' d':'N/D')+'</strong></div>'
      +'</div></article>';
  }
  function aging_cor(bucket){
    if(!bucket.proyectos.size)return '<article class="ccor-ds-panel"><h3>Antigüedad · '+escape_cor(bucket.key)+'</h3><p class="ccor-ds-muted">Sin datos en esta moneda.</p></article>';
    const entries=[['corriente','Corriente (hasta 30 d)'],['31-60','31–60 d'],['61-90','61–90 d'],['91-180','91–180 d'],['181+','Más de 180 d'],['indeterminado','Sin días verificables']];
    const max=Math.max(0,...entries.map(x=>bucket.antiguedad[x[0]]||0));
    return '<article class="ccor-ds-panel"><h3>Antigüedad · '+escape_cor(bucket.key)+'</h3>'
      +entries.map(([key,label])=>'<div class="ccor-ds-barrow"><span>'+label+'</span><div class="ccor-ds-bar"><i style="width:'
        +(max?Math.round(((bucket.antiguedad[key]||0)/max)*100):0)+'%"></i></div><b>'
        +escape_cor(money_cor(bucket.antiguedad[key]||0,bucket.key))+'</b></div>').join('')+'</article>';
  }
  function trend_cor(bucket,yearValue){
    const year=Number(yearValue)||new Date().getFullYear();
    const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const months=monthNames.map((name,index)=>({
      name,key:String(year)+'-'+String(index+1).padStart(2,'0')
    }));
    return '<article class="ccor-ds-panel"><h3>Fechas de cobro · '+escape_cor(bucket.key)+'</h3>'
      +'<p>'+year+' · Fuente y complementos separados; nunca se suman entre sí.</p>'
      +(!bucket.proyectos.size?'<p class="ccor-ds-muted">Sin datos en esta moneda.</p>':
      '<div class="ccor-ds-table-scroll"><table><thead><tr><th>Mes</th><th>Fuente (hitos)</th><th>Complementos aplicados</th></tr></thead><tbody>'
      +months.map(month=>'<tr><td>'+month.name+'</td><td>'+escape_cor(money_cor(bucket.fechasFuente.get(month.key)||0,bucket.key))
        +'</td><td>'+escape_cor(money_cor(bucket.fechasComplemento.get(month.key)||0,bucket.key))+'</td></tr>').join('')
      +'</tbody></table></div>')+'</article>';
  }
  function advisors_cor(stats){
    const groups=orderedCurrencies_cor(stats.byCurrency);
    if(!groups.length)return '';
    return '<section class="ccor-ds-panel"><h3>Desempeño por asesor</h3><p>Acumulado por ID de asesor y PPNS, sin duplicar equipos.</p>'
      +groups.map(group=>{
        const currency=group.key;
        const advisors=[...stats.byAdvisor.values()].filter(x=>x.key.endsWith('|'+currency))
          .sort((a,b)=>b.pendiente-a.pendiente);
        if(!advisors.length)return '';
        return '<h4>'+escape_cor(currency)+'</h4><div class="ccor-ds-table-scroll"><table><thead><tr><th>Asesor</th><th>PPNS</th><th>Cobrado</th><th>Pendiente</th><th>Vencido</th><th>% cobrado</th></tr></thead><tbody>'
          +advisors.map(a=>'<tr><td>'+escape_cor(a.asesor||'Sin asesor')+'</td><td>'+integer_cor(a.proyectos.size)
            +'</td><td>'+escape_cor(money_cor(a.cobrado,currency))+'</td><td>'+escape_cor(money_cor(a.pendiente,currency))
            +'</td><td>'+escape_cor(money_cor(a.vencido,currency))+'</td><td>'+pct_cor(a.total>0?a.cobrado/a.total:null)+'</td></tr>').join('')
          +'</tbody></table></div>';
      }).join('')+'</section>';
  }
  function risks_cor(stats){
    const total=stats.riesgos.length;
    const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
    const page=Math.min(Math.max(1,state.riskPage),pages);
    const selected=stats.riesgos.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
    return '<section class="ccor-ds-panel"><h3>Proyectos vencidos</h3><p>'+integer_cor(total)
      +' PPNS-moneda vencidos en toda la cartera autorizada. Tabla paginada por '+PAGE_SIZE+'.</p>'
      +(!total?'<p class="ccor-ds-muted">Sin saldos vencidos identificados por Estados de Cuenta.</p>':
      '<div class="ccor-ds-table-scroll"><table><thead><tr><th>PPNS</th><th>Proyecto</th><th>Asesor</th><th>Moneda</th><th>Saldo vencido</th><th>Hitos</th></tr></thead><tbody>'
      +selected.map(r=>'<tr><td><button type="button" class="ccor-ds-link" data-ppns="'+escape_cor(r.ppns)+'">'+escape_cor(r.ppns)+'</button></td>'
        +'<td>'+escape_cor(r.proyecto)+'</td><td>'+escape_cor(r.asesor)+'</td><td>'+escape_cor(r.moneda)+'</td><td>'
        +escape_cor(money_cor(r.vencido,r.moneda))+'</td><td>'+integer_cor(r.hitos)+'</td></tr>').join('')
      +'</tbody></table></div>'
      +'<div class="ccor-ds-pagination"><button type="button" class="ccor-ds-button" data-action="risk-prev"'+(page===1?' disabled':'')+'>Anterior</button>'
      +'<span>Página '+page+' de '+pages+'</span>'
      +'<button type="button" class="ccor-ds-button" data-action="risk-next"'+(page===pages?' disabled':'')+'>Siguiente</button></div>')
      +'</section>';
  }
  function render_cor(){
    if(!state.root||!active_cor())return;
    const ready=state.complete&&!state.loading&&!state.error;
    const motor=window.ManttoCobranzaCorEstadosCuenta?.motor;
    let stats=null;
    if(ready){
      try{stats=aggregate_cor(state.items,state.filters,motor);}
      catch(error){state.error=error?.message||'Motor de Estados de Cuenta no disponible.';}
    }
    const fixed=stats?fixedCurrencies_cor(stats):[];
    const f=state.filters;
    const year=Number(f.anio_cobro)||new Date().getFullYear();
    const years=[...new Set([year,new Date().getFullYear(),...state.years.map(Number).filter(Number.isInteger)])].sort((a,b)=>b-a);
    const selected=(value,target)=>String(value)===String(target)?' selected':'';
    state.root.innerHTML=
      '<div class="ccor-ds-page"><header class="ccor-ds-hero"><div><p class="ccor-ds-eyebrow">Cobranza · CORELLIAN</p>'
      +'<h1>Dashboard de Seguimiento</h1><p>Motor financiero de Estados de Cuenta. Monedas independientes.</p></div>'
      +'<button type="button" class="ccor-ds-button" data-action="refresh">Actualizar</button></header>'
      +'<section class="ccor-ds-panel ccor-ds-filters">'
      +'<label>Buscar PPNS, proyecto o cliente<input id="ccor-ds-q" type="search" maxlength="200" value="'+escape_cor(f.q)+'" placeholder="Proyecto, cliente, PPNS"></label>'
      +'<label>Año de cobro<select id="ccor-ds-anio">'
      +years.map(y=>'<option value="'+y+'"'+selected(y,year)+'>'+y+'</option>').join('')+'</select></label>'
      +'<label>Asesor<select id="ccor-ds-asesor"><option value="">Todos</option>'
      +state.advisors.map(a=>'<option value="'+Number(a.id)+'"'+selected(a.id,f.asesor)+'>'+escape_cor(a.iniciales)+'</option>').join('')+'</select></label>'
      +'<label>Moneda<select id="ccor-ds-moneda"><option value="">Todas (independientes)</option>'
      +CURRENCY_ORDER.map(c=>'<option value="'+c+'"'+selected(c,f.moneda)+'>'+escape_cor(c)+'</option>').join('')+'</select></label>'
      +'<button type="button" class="ccor-ds-button is-primary" data-action="apply">Aplicar</button>'
      +'<button type="button" class="ccor-ds-button" data-action="clear">Limpiar</button></section>'
      +'<div class="ccor-ds-status" role="status">'
      +(state.error?'<strong class="is-error">'+escape_cor(state.error)+'</strong>':
        state.loading?'<strong>Consolidando cartera: '+integer_cor(state.items.length)
          +(state.total?' de '+integer_cor(state.total):'')+' PPNS autorizados...</strong>':
        ready?'<strong>Indicadores completos para '+integer_cor(state.total)+' PPNS autorizados.</strong>':
        '<strong>Preparando indicadores globales...</strong>')
      +'<span>Los importes se muestran solo al concluir la consolidación; las fechas se filtran por '+year+'.</span></div>'
      +(stats?'<section class="ccor-ds-matrix">'
         +'<div class="ccor-ds-currencies">'+fixed.map(summarizeCard_cor).join('')+'</div>'
         +'<div class="ccor-ds-dates">'+fixed.map(x=>trend_cor(x,year)).join('')+'</div>'
         +'<div class="ccor-ds-ages">'+fixed.map(aging_cor).join('')+'</div>'
         +'</section>':
         '<section class="ccor-ds-panel"><p>'+(state.error?'No fue posible consolidar la cartera; no se presentan cifras incompletas.':
             'Evaluando todos los proyectos autorizados. No se presentan acumulados parciales.')+'</p></section>')
      +(stats&&stats.byAdvisor.size?advisors_cor(stats):'')
      +(stats?risks_cor(stats):'')
      +'<footer class="ccor-ds-footnote">Monedas en orden fijo USD · EUR · MXN. '
      +'Importes y antigüedad: acumulados del Estado de Cuenta, con todos los PPNS autorizados y sin duplicar equipos. '
      +'Fechas de cobro: meses enero–diciembre del año seleccionado, sin sumar Fuente con Complementos. '
      +'Los hitos sin fecha verificable no se clasifican arbitrariamente como vencidos.</footer></div>';
  }
  async function load_cor(reset=true,options={}){
    if(!active_cor())return false;
    if(reset){
      state.sequence++;
      state.items=[];state.total=0;state.complete=false;
      state.riskPage=1;state.error='';
      state.advisors=[];state.years=[];
    }
    const seq=state.sequence;
    const force=options?.force===true;
    const originalCache=force?null:cacheRead_cor();
    const pagesToSave=[];
    let mayPersist=true;
    state.loading=true;
    render_cor();
    try{
      const client=window.ManttoHttp;
      if(!client||typeof client.get!=='function')
        throw new Error('No esta disponible el cliente HTTP.');
      const seen=new Set();
      const advisors=new Map();
      const years=new Set([new Date().getFullYear()]);
      let initialScope=null;
      let expectedTotal=null;
      for(let page=1;page<=100000;page++){
        const params=new URLSearchParams({tipo:'resumen',pagina:String(page),
          tamano:String(SUMMARY_PAGE_SIZE)});
        for(const key of ['q','asesor','moneda']){
          if(state.filters[key])params.set(key,String(state.filters[key]));
        }
        const cachedPage=originalCache?.pages?.[page-1]||null;
        const reusable=Boolean(cachedPage&&originalCache?.scope);
        const known=(!force&&reusable)?(cachedPage.revisions||[]).filter(rev=>
          /^[a-f0-9]{64}$/i.test(String(rev?.revision||''))&&
          (cachedPage.items||[]).some(row=>
            normalize_cor(row?.proyecto?.ppns)===normalize_cor(rev?.ppns))
        ):[];
        let response;
        if(typeof client.request==='function'){
          try{
            response=await client.request(ENDPOINT+'/sync',{
              method:'POST',dedupe:false,
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({query:Object.fromEntries(params.entries()),known})
            });
          }catch(error){
            // Compatible con API anterior durante despliegues desacoplados.
            if(error?.status!==404&&error?.status!==405)throw error;
            response=await client.get(ENDPOINT+'?'+params.toString(),
              {force:true,cacheTtlMs:0});
          }
        }else{
          response=await client.get(ENDPOINT+'?'+params.toString(),
            {force:true,cacheTtlMs:0});
        }
        if(seq!==state.sequence||!active_cor())return false;
        if(!response||response.ok===false||!Array.isArray(response.data)||
          response.tipo!=='resumen'){
          throw new Error(response?.message||'Respuesta de consolidacion no valida.');
        }
        const pageInfo=response.paginacion||{};
        const total=Number(pageInfo.total_proyectos);
        const totalPages=Number(pageInfo.total_paginas);
        if(!Number.isSafeInteger(total)||total<0||
          !Number.isSafeInteger(totalPages)||totalPages<0){
          throw new Error('Paginacion invalida del Dashboard.');
        }
        if(initialScope===null)initialScope=response.scope_aplicado;
        else if(initialScope!==response.scope_aplicado)
          throw new Error('El alcance de acceso cambio durante la consolidacion.');
        if(expectedTotal===null)expectedTotal=total;
        else if(total!==expectedTotal)
          throw new Error('La cartera cambio durante la consolidacion. Actualiza el Dashboard.');
        if(total>0&&page>totalPages)
          throw new Error('La consolidacion se interrumpio antes de completar la cartera.');

        // Si el alcance de permisos cambio, no reutilizar datos de la sesion anterior.
        if(originalCache&&originalCache.scope!==response.scope_aplicado&&known.length){
          cacheInvalidate_cor();
          throw new Error('El alcance de permisos cambio. Vuelve a actualizar el Dashboard.');
        }
        const checked=checkedPageRows_cor(response,cachedPage,reusable&&!force);
        const rows=checked?checked.items:response.data;
        if(!checked)mayPersist=false;
        if(checked)pagesToSave.push(checked);
        if(checked&&rows.length!==Number(pageInfo.proyectos_pagina))
          throw new Error('El lote validado no coincide con la paginacion.');
        for(const item of rows){
          const ppns=normalize_cor(item?.proyecto?.ppns);
          if(!ppns||seen.has(ppns))continue;
          seen.add(ppns);
          state.items.push(item);
          for(const row of Array.isArray(item.estado_cuenta)?item.estado_cuenta:[]){
            const month=month_cor(row.fecha_pago);
            if(month)years.add(Number(month.slice(0,4)));
          }
          for(const pago of Array.isArray(item.pagos)?item.pagos:[]){
            const month=month_cor(pago.fecha_pago);
            if(month)years.add(Number(month.slice(0,4)));
          }
        }
        for(const entry of Array.isArray(response.catalogos?.asesores)?response.catalogos.asesores:[]){
          const id=Number(entry?.id);
          if(Number.isSafeInteger(id)&&id>0)
            advisors.set(id,{id,iniciales:String(entry.iniciales||'ID '+id)});
        }
        state.total=total;
        state.years=[...years].filter(Number.isInteger).sort((a,b)=>b-a);
        state.advisors=[...advisors.values()].sort((a,b)=>
          a.iniciales.localeCompare(b.iniciales,'es'));
        render_cor();
        if(total===0||page===totalPages){
          if(seen.size!==total)
            throw new Error('No se pudo verificar el total de PPNS. Recarga para reintentar.');
          break;
        }
        if(!rows.length)throw new Error('Se recibio un lote vacio antes de terminar.');
      }
      if(seq!==state.sequence||!active_cor())return false;
      state.complete=true;state.error='';
      if(mayPersist)cacheSave_cor(pagesToSave,initialScope);
      else cacheInvalidate_cor();
      return true;
    }catch(error){
      if(seq!==state.sequence||!active_cor())return false;
      state.complete=false;
      state.error=error?.message||'No fue posible consultar el Dashboard.';
      console.error('[Cobranza COR · DS]',error);
      return false;
    }finally{
      if(seq===state.sequence){
        state.loading=false;
        render_cor();
      }
    }
  }
  function apply_cor(clear){
    if(!state.root||!active_cor())return;
    const year=String(new Date().getFullYear());
    const previous=state.filters;
    const next=clear?{q:'',anio_cobro:year,asesor:'',moneda:''}:{
      q:String(state.root.querySelector('#ccor-ds-q')?.value||'').trim(),
      anio_cobro:String(state.root.querySelector('#ccor-ds-anio')?.value||year),
      asesor:String(state.root.querySelector('#ccor-ds-asesor')?.value||''),
      moneda:String(state.root.querySelector('#ccor-ds-moneda')?.value||'')
    };
    state.filters=next;
    state.riskPage=1;
    // El año de cobro filtra únicamente meses: no repetir lecturas financieras.
    if(state.complete&&['q','asesor','moneda'].every(k=>previous[k]===next[k])){
      render_cor();
    }else{
      load_cor(true);
    }
  }
  function click_cor(event){
    if(!active_cor())return;
    const button=event.target.closest('[data-action],[data-ppns]');
    if(!button)return;
    if(button.dataset.ppns){
      if(window.ManttoPermissions?.canNavigate?.('cobranza-estados-cuenta')===true){
        window.ManttoRouter?.go?.('cobranza-estados-cuenta',{ppns:button.dataset.ppns},{navigationType:'open'});
      }else{
        state.error='No tienes permiso para abrir Estados de Cuenta desde este módulo.';
        render_cor();
      }
      return;
    }
    const action=button.dataset.action;
    if(action==='risk-prev'){state.riskPage=Math.max(1,state.riskPage-1);render_cor();}
    if(action==='risk-next'){state.riskPage++;render_cor();}
    if(action==='refresh')load_cor(true,{force:true});
    if(action==='apply')apply_cor(false);
    if(action==='clear')apply_cor(true);
  }
  function init_cor(){
    if(!active_cor())return false;
    const root=document.getElementById('view-placeholder');
    if(!root)return false;
    state.root=root;
    if(root.dataset.ccorDsBound!=='1'){
      root.dataset.ccorDsBound='1';
      root.addEventListener('click',click_cor);
      root.addEventListener('keydown',event=>{
        if(event.key==='Enter'&&event.target?.id==='ccor-ds-q'){
          event.preventDefault();apply_cor(false);
        }
      });
    }
    state.filters={q:'',anio_cobro:String(new Date().getFullYear()),asesor:'',moneda:''};
    state.items=[];state.total=0;state.complete=false;
    state.riskPage=1;state.error='';
    render_cor();
    load_cor(true);
    return true;
  }
  if(typeof document!=='undefined'&&typeof document.addEventListener==='function'){
    document.addEventListener('mantto:data-mutated',event=>{
      const detail=event?.detail;
      const ppns=detail?.ppns||detail?.id_proyecto_origen||detail?.proyecto?.ppns;
      cacheInvalidate_cor(ppns);
    });
    document.addEventListener('mantto:view-user-changed',cacheInvalidateAll_cor);
  }
  window.ManttoCobranzaCorDashboard=Object.freeze({
    init:init_cor,refresh:()=>load_cor(true,{force:true}),
    aggregate:aggregate_cor
  });
})();