(function(){
  'use strict';
  if(window.ManttoCobranzaCorDashboard) return;

  // DS: utiliza el motor publico de Estados de Cuenta; no define formulas de cartera.
  const ROUTE='cobranza-dashboard';
  const ENDPOINT='/api/cobranza-cor/dashboard';
  const PAGE_SIZE=8;
  const CURRENCY_ORDER=['USD','MXN','EUR','SIN_MONEDA'];
  const state={
    root:null,loading:false,sequence:0,total:0,items:[],
    years:[],advisors:[],
    filters:{q:'',anio:'',asesor:'',moneda:''},
    error:'',initialized:false
  };

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
  function cleanAdvisor_cor(value){
    const text=String(value||'').trim();
    if(!text)return 'Sin asesor';
    return text.split('-').filter(Boolean).length>1?'Varios asesores (revisar)':text;
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
    const requestedYear=filters?.anio?Number(filters.anio):null;
    const requestedCurrency=normalize_cor(filters?.moneda);
    const analyzed=[];

    for(const detail of Array.isArray(details)?details:[]){
      const project=detail?.proyecto||{};
      const ppns=String(project.ppns||'').trim();
      if(!ppns||byPPNS.has(ppns.toUpperCase()))continue;
      byPPNS.add(ppns.toUpperCase());
      const asesor=cleanAdvisor_cor(project.asesor);
      if(asesor==='Varios asesores (revisar)')problems.variosAsesores++;
      if(asesor==='Sin asesor')problems.sinAsesor++;
      const allRows=motor.calcularFilas(detail);
      const rows=(Array.isArray(allRows)?allRows:[]).filter(row=>
        (!requestedYear||Number(row?.anio_proyecto)===requestedYear)
        &&(!requestedCurrency||normalize_cor(row?.moneda||'SIN_MONEDA')===requestedCurrency)
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
        const advisorBucket=bucket_cor(byAdvisor,asesor+'|'+currency);
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
        const advisorBucket=bucket_cor(byAdvisor,asesor+'|'+moneda);
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
        const advisorBucket=bucket_cor(byAdvisor,asesor+'|'+moneda);
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
  function orderedCurrencies_cor(map){
    return [...map.values()].sort((a,b)=>currencyRank_cor(a.key)-currencyRank_cor(b.key));
  }
  function summarizeCard_cor(bucket){
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
    const entries=[['corriente','Corriente (hasta 30 d)'],['31-60','31–60 d'],['61-90','61–90 d'],['91-180','91–180 d'],['181+','Más de 180 d'],['indeterminado','Sin días verificables']];
    const max=Math.max(0,...entries.map(x=>bucket.antiguedad[x[0]]||0));
    return '<article class="ccor-ds-panel"><h3>Antigüedad · '+escape_cor(bucket.key)+'</h3>'
      +entries.map(([key,label])=>'<div class="ccor-ds-barrow"><span>'+label+'</span><div class="ccor-ds-bar"><i style="width:'
        +(max?Math.round(((bucket.antiguedad[key]||0)/max)*100):0)+'%"></i></div><b>'
        +escape_cor(money_cor(bucket.antiguedad[key]||0,bucket.key))+'</b></div>').join('')+'</article>';
  }
  function trend_cor(bucket){
    const months=[...new Set([...bucket.fechasFuente.keys(),...bucket.fechasComplemento.keys()])].sort().slice(-12);
    return '<article class="ccor-ds-panel"><h3>Fechas de cobro · '+escape_cor(bucket.key)+'</h3>'
      +'<p>Dos criterios independientes; no se suman entre sí.</p>'
      +(!months.length?'<p class="ccor-ds-muted">Sin fechas vinculables a cobros.</p>':
      '<div class="ccor-ds-table-scroll"><table><thead><tr><th>Mes</th><th>Fecha Fuente (hitos)</th><th>Complementos aplicados</th></tr></thead><tbody>'
      +months.map(month=>'<tr><td>'+escape_cor(month)+'</td><td>'+escape_cor(money_cor(bucket.fechasFuente.get(month)||0,bucket.key))
        +'</td><td>'+escape_cor(money_cor(bucket.fechasComplemento.get(month)||0,bucket.key))+'</td></tr>').join('')
      +'</tbody></table></div>')+'</article>';
  }
  function advisors_cor(stats){
    const groups=orderedCurrencies_cor(stats.byCurrency);
    if(!groups.length)return '';
    return '<section class="ccor-ds-panel"><h3>Desempeño por asesor</h3><p>Un PPNS se atribuye una sola vez. Casos con varios asesores se muestran aparte.</p>'
      +groups.map(group=>{
        const currency=group.key;
        const advisors=[...stats.byAdvisor.values()].filter(x=>x.key.endsWith('|'+currency))
          .sort((a,b)=>b.pendiente-a.pendiente);
        return '<h4>'+escape_cor(currency)+'</h4><div class="ccor-ds-table-scroll"><table><thead><tr><th>Asesor</th><th>PPNS</th><th>Cobrado</th><th>Pendiente</th><th>Vencido</th><th>% cobrado</th></tr></thead><tbody>'
          +advisors.map(a=>'<tr><td>'+escape_cor(a.key.slice(0,-currency.length-1))+'</td><td>'+integer_cor(a.proyectos.size)
            +'</td><td>'+escape_cor(money_cor(a.cobrado,currency))+'</td><td>'+escape_cor(money_cor(a.pendiente,currency))
            +'</td><td>'+escape_cor(money_cor(a.vencido,currency))+'</td><td>'+pct_cor(a.total>0?a.cobrado/a.total:null)+'</td></tr>').join('')
          +'</tbody></table></div>';
      }).join('')+'</section>';
  }
  function risks_cor(stats){
    return '<section class="ccor-ds-panel"><h3>Proyectos vencidos</h3><p>Saldo vencido por PPNS, sin multiplicar importes por equipos.</p>'
      +(!stats.riesgos.length?'<p class="ccor-ds-muted">No hay saldos vencidos en los proyectos evaluados.</p>':
      '<div class="ccor-ds-table-scroll"><table><thead><tr><th>PPNS</th><th>Proyecto</th><th>Asesor</th><th>Moneda</th><th>Saldo vencido</th><th>Hitos</th></tr></thead><tbody>'
      +stats.riesgos.slice(0,40).map(r=>'<tr><td><button type="button" class="ccor-ds-link" data-ppns="'+escape_cor(r.ppns)+'">'+escape_cor(r.ppns)+'</button></td>'
        +'<td>'+escape_cor(r.proyecto)+'</td><td>'+escape_cor(r.asesor)+'</td><td>'+escape_cor(r.moneda)+'</td><td>'
        +escape_cor(money_cor(r.vencido,r.moneda))+'</td><td>'+integer_cor(r.hitos)+'</td></tr>').join('')
      +'</tbody></table></div>')+'</section>';
  }
  function render_cor(){
    if(!state.root||!active_cor())return;
    const motor=window.ManttoCobranzaCorEstadosCuenta?.motor;
    let stats=null;
    try{stats=aggregate_cor(state.items,state.filters,motor);}catch(error){
      state.error=error.message||'Motor no disponible.';
    }
    const total=state.total;
    const count=state.items.length;
    const complete=!state.loading&&!state.error&&count>=total&&total>0;
    const currencyRows=stats?orderedCurrencies_cor(stats.byCurrency):[];
    const f=state.filters;
    const selected=(value,target)=>String(value)===String(target)?' selected':'';
    state.root.innerHTML=
      '<div class="ccor-ds-page"><header class="ccor-ds-hero"><div><p class="ccor-ds-eyebrow">Cobranza · CORELLIAN</p>'
      +'<h1>Dashboard de Seguimiento</h1><p>Importes conciliados por Estados de Cuenta. Monedas independientes.</p></div>'
      +'<button type="button" class="ccor-ds-button" data-action="refresh">Actualizar</button></header>'
      +'<section class="ccor-ds-panel ccor-ds-filters">'
      +'<label>Buscar PPNS, proyecto o cliente<input id="ccor-ds-q" type="search" maxlength="200" value="'+escape_cor(f.q)+'" placeholder="Proyecto, cliente, PPNS"></label>'
      +'<label>Año del proyecto<select id="ccor-ds-anio"><option value="">Todos</option>'
      +state.years.map(y=>'<option value="'+y+'"'+selected(y,f.anio)+'>'+y+'</option>').join('')+'</select></label>'
      +'<label>Asesor<select id="ccor-ds-asesor"><option value="">Todos</option>'
      +state.advisors.map(a=>'<option value="'+escape_cor(a)+'"'+selected(a,f.asesor)+'>'+escape_cor(a)+'</option>').join('')+'</select></label>'
      +'<label>Moneda<select id="ccor-ds-moneda"><option value="">Todas (independientes)</option>'
      +CURRENCY_ORDER.map(c=>'<option value="'+c+'"'+selected(c,f.moneda)+'>'+escape_cor(c)+'</option>').join('')+'</select></label>'
      +'<button type="button" class="ccor-ds-button is-primary" data-action="apply">Aplicar</button>'
      +'<button type="button" class="ccor-ds-button" data-action="clear">Limpiar</button></section>'
      +'<div class="ccor-ds-status" role="status">'
      +(state.error?'<strong class="is-error">'+escape_cor(state.error)+'</strong>':
        state.loading?'<strong>Consultando Estados de Cuenta...</strong>':
        complete?'<strong>Todos los PPNS del filtro evaluados.</strong>':
        '<strong>Muestra parcial: '+integer_cor(count)+' de '+integer_cor(total)+' PPNS.</strong>')
      +'<span>Las cifras monetarias corresponden exclusivamente a los '+integer_cor(count)+' proyectos evaluados.</span></div>'
      +(currencyRows.length?'<section class="ccor-ds-currencies">'+currencyRows.map(summarizeCard_cor).join('')+'</section>':
        '<section class="ccor-ds-panel"><p>'+(state.loading?'Cargando resultados...':'Sin datos calculados para estos filtros.')+'</p></section>')
      +(currencyRows.length?'<section class="ccor-ds-analytics">'+currencyRows.map(aging_cor).join('')+currencyRows.map(trend_cor).join('')+'</section>':'')
      +(stats&&stats.byAdvisor.size?advisors_cor(stats):'')
      +(stats?risks_cor(stats):'')
      +(stats?'<section class="ccor-ds-panel ccor-ds-quality"><h3>Cobertura y calidad</h3><p>'
        +integer_cor(stats.problems.sinAsesor)+' PPNS sin asesor · '+integer_cor(stats.problems.variosAsesores)
        +' PPNS con varios asesores · '+integer_cor(stats.problems.sinFechaVencimiento)
        +' hitos pendientes sin días de vencimiento · '+integer_cor(stats.problems.fechaFacturaDisponible)
        +' facturas con fecha de emisión</p>'
        +'<p>Promedio por comprobante: solo aplicaciones explícitas con fecha; de lo contrario N/D. Las fechas de Fuente y Complementos no se suman.</p>'
        +'</section>':'')
      +(!state.loading&&!state.error&&count<total?
        '<div class="ccor-ds-more"><button type="button" class="ccor-ds-button is-primary" data-action="more">Cargar siguientes '+PAGE_SIZE+' PPNS</button></div>':'')
      +'<footer class="ccor-ds-footnote">Lectura por lotes de '+PAGE_SIZE+' proyectos; sin mutaciones. '
      +'El vencimiento usa la misma regla visible de Estados de Cuenta: VENCIDO desde 31 días. '
      +'No se combinan MXN, USD y EUR, ni se consideran los resultados de un lote como totales de toda la cartera.</footer></div>';
  }

  async function load_cor(reset){
    if(!active_cor()||state.loading)return;
    if(reset){state.sequence++;state.items=[];state.total=0;state.error='';}
    const seq=state.sequence;
    const page=Math.floor(state.items.length/PAGE_SIZE)+1;
    const params=new URLSearchParams({pagina:String(page),tamano:String(PAGE_SIZE)});
    for(const key of ['q','anio','asesor','moneda'])if(state.filters[key])params.set(key,String(state.filters[key]));
    state.loading=true;render_cor();
    try{
      const client=window.ManttoHttp;
      if(!client||typeof client.get!=='function')throw new Error('No esta disponible el cliente HTTP.');
      const response=await client.get(ENDPOINT+'?'+params.toString(),{force:true,cacheTtlMs:0});
      if(seq!==state.sequence||!active_cor())return;
      if(!response||response.ok===false||!Array.isArray(response.data))throw new Error(response?.message||'Respuesta del DS no valida.');
      const pageInfo=response.paginacion||{};
      const seen=new Set(state.items.map(x=>normalize_cor(x?.proyecto?.ppns)));
      for(const item of response.data){
        const key=normalize_cor(item?.proyecto?.ppns);
        if(key&&!seen.has(key)){state.items.push(item);seen.add(key);}
      }
      state.total=Number(pageInfo.total_proyectos)||0;
      state.years=[...new Set([...(response.catalogos?.anios||[]),...state.years])].sort((a,b)=>b-a);
      state.advisors=[...new Set([...(response.catalogos?.asesores||[]),...state.advisors])].sort((a,b)=>String(a).localeCompare(String(b),'es'));
      state.error='';
    }catch(error){
      if(seq!==state.sequence||!active_cor())return;
      state.error=error?.message||'No fue posible consultar el Dashboard.';
      console.error('[Cobranza COR · DS]',error);
    }finally{
      if(seq===state.sequence){state.loading=false;render_cor();}
    }
  }
  function apply_cor(clear){
    if(!state.root||!active_cor())return;
    state.filters=clear?{q:'',anio:'',asesor:'',moneda:''}:{
      q:String(state.root.querySelector('#ccor-ds-q')?.value||'').trim(),
      anio:String(state.root.querySelector('#ccor-ds-anio')?.value||''),
      asesor:String(state.root.querySelector('#ccor-ds-asesor')?.value||''),
      moneda:String(state.root.querySelector('#ccor-ds-moneda')?.value||'')
    };
    if(!state.loading)load_cor(true);
  }
  function click_cor(event){
    if(!active_cor())return;
    const button=event.target.closest('[data-action],[data-ppns]');
    if(!button)return;
    if(button.dataset.ppns){
      if(window.ManttoPermissions?.canNavigate?.('cobranza-estados-cuenta')===true){
        window.ManttoRouter?.go?.('cobranza-estados-cuenta',{ppns:button.dataset.ppns},{navigationType:'open'});
      }else{
        state.error='No tienes permiso para abrir Estados de Cuenta desde este modulo.';render_cor();
      }
      return;
    }
    const action=button.dataset.action;
    if(action==='more')load_cor(false);
    if(action==='refresh')load_cor(true);
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
        if(event.key==='Enter'&&event.target?.id==='ccor-ds-q'){event.preventDefault();apply_cor(false);}
      });
    }
    state.initialized=true;state.loading=false;state.sequence++;
    state.filters={q:'',anio:'',asesor:'',moneda:''};
    state.items=[];state.total=0;state.error='';
    render_cor();
    load_cor(true);
    return true;
  }
  window.ManttoCobranzaCorDashboard=Object.freeze({init:init_cor,refresh:()=>load_cor(true),aggregate:aggregate_cor});
})();