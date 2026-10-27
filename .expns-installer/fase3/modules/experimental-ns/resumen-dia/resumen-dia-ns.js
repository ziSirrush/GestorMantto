/* BLT NOW | Experimental NS | F3 | Resumen del Dia
 * Copia visual del DOM original; lecturas EXCLUSIVAS /api/experimental-ns/resumen-dia/inicial.
 * La vista original y su modulo JS NO son inicializados ni modificados.
 */
(function(){
  'use strict';
  if (window.ManttoResumenDiaNS) return;

  const ROUTE = 'experimental-ns-resumen-dia';
  const ENDPOINT = '/api/experimental-ns/resumen-dia/inicial';
  const COLORS = ['#1B4FD8','#16A34A','#D97706','#DC2626','#0891B2','#7C3AED','#64748B','#E87722'];
  const ATRAP = ['atrapado','atrapada','encerrado','encerrada','rescate'];
  const AGUA = ['agua','filtracion','filtración','inundacion','inundación','goteras','humedad'];
  const VOLTAJE = ['voltaje','sobre voltaje','bajo voltaje','falla electrica','falla eléctrica','corte de luz','sin energia','sin energía','apagón'];
  const HEADERS = ['No. Ticket','Proyecto','Equipo','Estado','Fecha Reporte','Hora Reporte','Asunto','Estatus inicial','Fecha Llegada','Hora Llegada','T. llegada','Fecha Solución','Hora Solución','Estatus final','Causa','Acción cierre','Responsabilidad','Causa de falla'];
  const PAGE_SIZE = 30;

  const state = {
    initialized: false, loading: false, tickets: [], portafolio: [],
    dates: [], dayIndex: 0, current: [], filtered: [], page: 0,
    details: {}, truncated: false, modal: null
  };
  function view(){ return document.getElementById('view-' + ROUTE); }
  function id(name){ return document.getElementById('rdns-' + name); }
  function text(name, value){ const el = id(name); if(el) el.textContent = value == null ? '—' : String(value); }
  function trim(value){ return value == null ? '' : String(value).trim(); }
  function escapeHtml(value){ return String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function numeric(value){
    if(value === null || value === undefined || value === '') return null;
    const result = Number(String(value).replace(',','.'));
    return Number.isFinite(result) ? result : null;
  }
  function day(value){
    if(value == null || value === '') return '';
    const raw = String(value).trim();
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if(match) return match[1]+'-'+match[2]+'-'+match[3];
    match = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:$|[T\s])/);
    if(match) return match[3]+'-'+match[2]+'-'+match[1];
    return '';
  }
  function hour(value){
    if(value == null || value === '') return '';
    const raw = String(value).trim();
    const ap = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if(!ap){
      const m = raw.match(/^(\d{1,2}):(\d{2})/);
      return m ? m[1].padStart(2,'0')+':'+m[2] : '';
    }
    let h = Number(ap[1]);
    if(ap[3].toUpperCase() === 'PM' && h < 12) h += 12;
    if(ap[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return String(h).padStart(2,'0')+':'+ap[2];
  }
  function hoursBetween(d1,h1,d2,h2){
    if(!d1 || !d2) return null;
    const start = new Date(d1+'T'+(h1||'00:00')+':00');
    const finish = new Date(d2+'T'+(h2||'00:00')+':00');
    const hours = (finish.getTime() - start.getTime()) / 3600000;
    return Number.isFinite(hours) && hours > 0 && hours < 744 ? hours : null;
  }
  function duration(value){
    const n = numeric(value);
    if(n !== null) return n;
    const match = trim(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return match ? Number(match[1]) + Number(match[2])/60 : null;
  }
  function prettyDuration(value){
    const n = duration(value);
    if(n === null) return '—';
    const minutes = Math.round(n*60);
    if(minutes < 60) return minutes+' min';
    const days = Math.floor(minutes / 1440);
    const h = Math.floor(minutes%1440/60);
    const m = minutes%60;
    return (days?days+' d ':'') + (h?h+' h ':'') + (m?m+' min':'') || '0 min';
  }
  function dateLabel(key){
    if(!key) return '—';
    const parts = key.split('-');
    return parts[2]+'/'+parts[1]+'/'+parts[0];
  }
  function fullDate(key){
    if(!key) return '—';
    const parts = key.split('-').map(Number);
    return new Date(parts[0],parts[1]-1,parts[2]).toLocaleDateString('es-MX',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  }
  function status(raw){
    const lower = trim(raw).toLowerCase();
    if(lower.includes('cerr')) return 'Cerrado';
    if(lower.includes('curso') || lower.includes('proceso')) return 'En curso';
    if(lower.includes('abier') || lower.includes('pend')) return 'Abierto';
    return trim(raw) || 'Sin estado';
  }
  function responsibility(value, fallback){
    const lower = trim(value).toLowerCase();
    if(lower.includes('blt')) return 'BLT';
    if(lower.includes('client')) return 'CLIENTE';
    const cause = trim(fallback).toLowerCase();
    if(cause.includes('inherente') || cause.includes('equipo') || cause.includes('blt')) return 'BLT';
    if(cause.includes('client') || cause.includes('operacion') || cause.includes('usuario')) return 'CLIENTE';
    return trim(value);
  }
  function ticket(row){
    const fr=day(row.fecha_reporte), hr=hour(row.h_reporte), fl=day(row.fecha_llegada), hl=hour(row.h_llegada);
    const fs=day(row.fecha_cierre), hs=hour(row.h_solucion);
    const arrival=hoursBetween(fr,hr,fl,hl), solution=hoursBetween(fl,hl,fs,hs);
    return {
      n:trim(row.ticket), et:status(row.estado_ticket), edo:trim(row.estado), ciu:trim(row.ciudad),
      pro:trim(row.proyecto), cod:trim(row.codigo_equipo), ref:trim(row.referencia_en_zona_operativa),
      zon:trim(row.zona_oficial), asu:trim(row.descripcion), fr,hr,fl,hl,fs,hs,
      eqi:trim(row.estatus_equipo_ir),eqf:trim(row.estatus_equipo_final),
      tec:trim(row.tecnico),sup:trim(row.supervisor),cau:trim(row.causa),acc:trim(row.accion_en_cierre),
      caf:trim(row.causa_falla),res:responsibility(row.responsabilidad,row.causa_falla),
      tll:arrival === null ? duration(row.tiempo_llegada) : arrival,
      tso:solution === null ? duration(row.tiempo_solucion) : solution,
      prd:trim(row.tipo_equipo), pri:trim(row.prioridad), xat:trim(row.ticket_excede),
      detalle:trim(row.custeventblt_mot_det), blt:trim(row.blt_empleado), ejecutivo:trim(row.ejecutivo_call),
      persona:trim(row.persona_que_atiende), id_interno:trim(row.id_interno)
    };
  }
  function percent(n,all){return all ? Math.round(n/all*100)+'%' : '—';}
  function group(rows,field){
    const map=new Map();
    rows.forEach(r=>{const key=trim(r[field])||'Sin dato';if(!map.has(key))map.set(key,[]);map.get(key).push(r);});
    return [...map].map(([label,items])=>({label,items,count:items.length})).sort((a,b)=>b.count-a.count);
  }
  function matchesTerms(t,terms){return terms.some(k=>(t.asu+' '+t.cau+' '+t.acc).toLowerCase().includes(k));}
  function avgMin(rows,key){
    const values=rows.map(r=>r[key]).filter(n=>Number.isFinite(n)&&n>0&&n<744);
    return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*60) : null;
  }
  function setStatus(kind,message){
    const el=id('api-status');
    if(!el)return;
    el.className='rd-status '+kind;
    el.innerHTML='<span class="dot"></span><span>'+escapeHtml(message)+'</span>';
  }
  function copyLayout(){
    const target=view();
    const production=document.getElementById('view-resumen');
    if(!target)return false;
    // Fuente estrictamente VISUAL: jamás invocar ManttoResumenDia ni consultar su API.
    if(!production || !production.querySelector('#rd-total') || !production.querySelector('#rd-tbody')){
      target.innerHTML='<div class="expns-page"><section class="expns-card"><h1>Resumen del Día · Experimental NS</h1><p>No se encontró la plantilla visual original. No se usarán datos de producción.</p></section></div>';
      return false;
    }
    const copy=production.cloneNode(true);
    copy.querySelectorAll('[id]').forEach(node=>{
      if(node.id.startsWith('rd-')) node.id='rdns-'+node.id.slice(3);
    });
    copy.querySelectorAll('[for]').forEach(node=>{
      const value=node.getAttribute('for');
      if(value && value.startsWith('rd-'))node.setAttribute('for','rdns-'+value.slice(3));
    });
    // Evita que el modulo PRODUCTIVO, que enlaza [data-rd-detail] globalmente,
    // registre clics en la copia experimental al entrar a Produccion despues.
    copy.querySelectorAll('[data-rd-detail]').forEach(node=>{
      node.dataset.nsnsDetail=node.getAttribute('data-rd-detail');
      node.removeAttribute('data-rd-detail');
    });
    target.replaceChildren(...Array.from(copy.childNodes));
    target.classList.add('resumen-page','expns-resumen-page');
    const head=target.querySelector('.rd-title');
    if(head){
      const h1=head.querySelector('h1'); if(h1)h1.textContent='Resumen del Día · Experimental NS';
      const p=head.querySelector('p');if(p)p.textContent='Copia visual independiente · datos exclusivos de las tablas NS de pruebas.';
    }
    const banner=document.createElement('p');
    banner.className='rdns-banner';
    banner.setAttribute('role','status');
    banner.textContent='🧪 Experimental NS · solo lectura · ns_tickets_pruebas + ns_portafolio_pruebas · Vo.Bo. y cruces con Producción deshabilitados.';
    target.insertBefore(banner,target.firstChild);
    const critical=target.querySelector('[data-nsns-detail="criticos"]');
    if(critical){critical.setAttribute('aria-disabled','true');critical.classList.add('rdns-pending');critical.title='Cálculo de Equipos Críticos pendiente de Fase 4';}
    const note=document.createElement('small');
    note.className='rdns-critical-note';
    note.textContent='El indicador “En críticos” se conectará exclusivamente a NS en Fase 4.';
    critical?.appendChild(note);
    return true;
  }
  function headers(){return '<tr>'+HEADERS.map(x=>'<th>'+escapeHtml(x)+'</th>').join('')+'</tr>';}
  function table(rows){
    return rows.map(t=>`<tr>
      <td><button type="button" class="rd-link" data-nsns-ticket="${escapeHtml(t.n)}">${escapeHtml(t.n)}</button></td>
      <td><button type="button" class="rd-link" data-nsns-proyecto="${escapeHtml(t.pro)}">${escapeHtml(t.pro||'—')}</button></td>
      <td><button type="button" class="rd-link" data-nsns-equipo="${escapeHtml(t.cod)}">${escapeHtml(t.cod||'—')}</button></td>
      <td>${escapeHtml(t.edo||'—')}</td><td>${dateLabel(t.fr)}</td><td>${escapeHtml(t.hr||'—')}</td>
      <td title="${escapeHtml(t.asu)}">${escapeHtml(t.asu||'—')}</td><td>${escapeHtml(t.eqi||'—')}</td>
      <td>${dateLabel(t.fl)}</td><td>${escapeHtml(t.hl||'—')}</td><td>${escapeHtml(prettyDuration(t.tll))}</td>
      <td>${dateLabel(t.fs)}</td><td>${escapeHtml(t.hs||'—')}</td><td>${escapeHtml(t.eqf||'—')}</td>
      <td title="${escapeHtml(t.cau)}">${escapeHtml(t.cau||'—')}</td>
      <td title="${escapeHtml(t.acc)}">${escapeHtml(t.acc||'—')}</td><td>${escapeHtml(t.res||'—')}</td>
      <td title="${escapeHtml(t.caf)}">${escapeHtml(t.caf||'—')}</td></tr>`).join('');
  }
  function renderTable(){
    const search=trim(id('search')?.value).toLowerCase();
    const et=trim(id('filter-et')?.value);
    state.filtered=state.current.filter(t=>(!et||t.et===et) && (!search ||
      [t.n,t.pro,t.cod,t.edo,t.asu,t.eqi,t.eqf,t.cau,t.acc,t.res,t.caf,t.detalle].join(' ').toLowerCase().includes(search)));
    const pages=Math.max(1,Math.ceil(state.filtered.length/PAGE_SIZE));
    state.page=Math.max(0,Math.min(state.page,pages-1));
    const slice=state.filtered.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE);
    const thead=id('thead'),tbody=id('tbody');
    if(thead)thead.innerHTML=headers();
    if(tbody)tbody.innerHTML=slice.length?table(slice):'<tr><td colspan="18" class="rdns-empty">Sin tickets para estos filtros.</td></tr>';
    text('count',state.filtered.length+' tickets');
    text('page-info','Página '+(state.page+1)+' de '+pages+' · '+state.filtered.length+' tickets');
    const prev=id('page-prev'),next=id('page-next');
    if(prev)prev.disabled=state.page===0;
    if(next)next.disabled=state.page>=pages-1;
  }
  function detailsModal(){
    if(state.modal)return state.modal;
    const modal=document.createElement('section');
    modal.className='rdns-overlay';
    modal.hidden=true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Detalle exclusivo Experimental NS');
    modal.innerHTML='<div class="rdns-dialog"><header><div><h2 data-nsns-title>Detalle · Experimental NS</h2><p data-nsns-sub>Solo lectura · sin cruces productivos</p></div><button type="button" data-nsns-close aria-label="Cerrar">×</button></header><div class="rdns-dialog-body" data-nsns-body></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{
      if(e.target===modal||e.target.closest('[data-nsns-close]')){hideDetails();return;}
      const b=e.target.closest('[data-nsns-ticket],[data-nsns-equipo],[data-nsns-proyecto]');
      if(!b || !modal.contains(b))return;
      if(b.hasAttribute('data-nsns-ticket'))showTicket(b.dataset.nsnsTicket);
      else if(b.hasAttribute('data-nsns-equipo'))showEquipo(b.dataset.nsnsEquipo);
      else showProyecto(b.dataset.nsnsProyecto);
    });
    state.modal=modal;
    return modal;
  }
  function hideDetails(){if(state.modal)state.modal.hidden=true;}
  function showDetails(title,rows){
    const modal=detailsModal();
    const ttl=modal.querySelector('[data-nsns-title]'),sub=modal.querySelector('[data-nsns-sub]');
    const body=modal.querySelector('[data-nsns-body]');
    if(ttl)ttl.textContent=title||'Detalle';
    if(sub)sub.textContent=(rows?.length||0)+' registros · Experimental NS · solo lectura';
    if(body)body.innerHTML=rows?.length?'<div class="rd-table-wrap"><table class="rd-table"><thead>'+headers()+'</thead><tbody>'+table(rows)+'</tbody></table></div>':'<p>Sin datos experimentales para mostrar.</p>';
    modal.hidden=false;
  }
  function showTicket(number){
    const t=state.tickets.find(r=>r.n===trim(number));
    if(!t)return showDetails('Ticket no disponible en la muestra NS',[]);
    const modal=detailsModal(), body=modal.querySelector('[data-nsns-body]');
    modal.querySelector('[data-nsns-title]').textContent='Ticket '+t.n+' · Experimental NS';
    modal.querySelector('[data-nsns-sub]').textContent='Detalle local de prueba · sin cambios de Vo.Bo. ni consultas de Producción';
    const fields=[['Proyecto',t.pro],['Equipo',t.cod],['Estado ticket',t.et],['Estado',t.edo],['Ciudad',t.ciu],['Zona informativa',t.zon],['Referencia en sitio',t.ref],['Asunto',t.asu],['Fecha reporte',t.fr],['Hora reporte',t.hr],['Estatus inicial',t.eqi],['Fecha llegada',t.fl],['Hora llegada',t.hl],['Fecha solución',t.fs],['Hora solución',t.hs],['Técnico',t.tec],['Supervisor',t.sup],['Estatus final',t.eqf],['Responsabilidad',t.res],['Causa',t.cau],['Acción cierre',t.acc],['Causa falla',t.caf],['Tiempo llegada',prettyDuration(t.tll)],['Tiempo solución',prettyDuration(t.tso)],['Motivo / detalle NS',t.detalle],['Ejecutivo Call Center',t.ejecutivo],['Persona que atiende',t.persona]];
    body.innerHTML='<div class="rdns-fields">'+fields.map(([name,value])=>'<div><small>'+escapeHtml(name)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('')+'</div>';
    modal.hidden=false;
  }
  function showEquipo(code){
    const p=state.portafolio.find(p=>trim(p.numero_equipo)===trim(code));
    const related=state.tickets.filter(t=>t.cod===trim(code));
    const modal=detailsModal(),body=modal.querySelector('[data-nsns-body]');
    modal.querySelector('[data-nsns-title]').textContent='Equipo '+trim(code)+' · Experimental NS';
    modal.querySelector('[data-nsns-sub]').textContent='Solo datos de ns_portafolio_pruebas y ns_tickets_pruebas';
    const info=p?'<p><b>Proyecto:</b> '+escapeHtml(p.proyecto||'—')+' · <b>Referencia:</b> '+escapeHtml(p.identificacion_sitio||'—')+'</p>':'<p>Equipo sin correspondencia en Portafolio NS.</p>';
    body.innerHTML=info+'<p>'+related.length+' tickets relacionados en la muestra.</p>'+(related.length?'<div class="rd-table-wrap"><table class="rd-table"><thead>'+headers()+'</thead><tbody>'+table(related)+'</tbody></table></div>':'');
    modal.hidden=false;
  }
  function showProyecto(project){
    const value=trim(project).toLowerCase();
    showDetails('Proyecto '+trim(project)+' · Experimental NS',state.tickets.filter(t=>t.pro.toLowerCase()===value));
  }
  function drawDonut(svgName,legendName,parts){
    const svg=id(svgName),legend=id(legendName);if(!svg||!legend)return;
    svg.innerHTML='';legend.innerHTML='';
    const total=parts.reduce((sum,p)=>sum+p.rows.length,0);
    if(!total){svg.innerHTML='<circle cx="65" cy="65" r="50" fill="#F1F5F9"/><text x="65" y="70" text-anchor="middle" fill="#667085">Sin datos</text>';return;}
    let angle=0;
    parts.forEach((part,i)=>{
      const count=part.rows.length;
      if(count===total){
        const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
        circle.setAttribute('cx','65');circle.setAttribute('cy','65');circle.setAttribute('r','54');
        circle.setAttribute('fill',COLORS[i%COLORS.length]);circle.style.cursor='pointer';
        circle.addEventListener('click',()=>showDetails(part.label,part.rows));svg.appendChild(circle);
      }else if(count){
        const start=angle-90,end=angle+(count/total*360)-90;
        const xy=rad=>({x:65+54*Math.cos(rad*Math.PI/180),y:65+54*Math.sin(rad*Math.PI/180)});
        const s=xy(start),e=xy(end);
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d',`M 65 65 L ${s.x} ${s.y} A 54 54 0 ${end-start>180?1:0} 1 ${e.x} ${e.y} Z`);
        path.setAttribute('fill',COLORS[i%COLORS.length]);
        path.style.cursor='pointer';path.addEventListener('click',()=>showDetails(part.label,part.rows));svg.appendChild(path);
        angle+=count/total*360;
      }
      const b=document.createElement('button');b.type='button';b.className='rd-legend-item';
      b.innerHTML='<span class="rd-legend-left"><span class="rd-color" style="background:'+COLORS[i%COLORS.length]+'"></span><span class="rd-legend-label">'+escapeHtml(part.label)+'</span></span><span class="rd-legend-val">'+count+'</span>';
      b.addEventListener('click',()=>showDetails(part.label,part.rows));legend.appendChild(b);
    });
    const center=document.createElementNS('http://www.w3.org/2000/svg','circle');center.setAttribute('cx','65');center.setAttribute('cy','65');center.setAttribute('r','30');center.setAttribute('fill','#fff');svg.appendChild(center);
    const value=document.createElementNS('http://www.w3.org/2000/svg','text');value.setAttribute('x','65');value.setAttribute('y','70');value.setAttribute('text-anchor','middle');value.setAttribute('fill','#0D2E6E');value.textContent=String(total);svg.appendChild(value);
  }
  function drawBars(name,groups,all){
    const el=id(name);if(!el)return;
    if(!groups.length){el.innerHTML='<div class="rdns-empty">Sin datos experimentales</div>';return;}
    el.innerHTML=groups.slice(0,12).map((g,i)=>{
      const pct=all?Math.round(g.count/all*100):0;
      return '<button type="button" class="rdns-bar" data-nsns-group="'+i+'"><span class="rd-bar-top"><span class="rd-bar-label">'+escapeHtml(g.label)+'</span><b>'+g.count+' · '+pct+'%</b></span><span class="rd-bar-track"><span class="rd-bar-fill" style="width:'+pct+'%;background:'+COLORS[i%COLORS.length]+'"></span></span></button>';
    }).join('');
    el.querySelectorAll('[data-nsns-group]').forEach(button=>button.addEventListener('click',()=>{
      const g=groups[Number(button.dataset.nsnsGroup)];if(g)showDetails(g.label,g.items);
    }));
  }
  function renderDay(){
    const key=state.dates[state.dayIndex];
    if(!key){
      text('day-label','Sin registros experimentales');text('day-sub','Verifica las cargas NetSuite y el alcance autorizado');
      for(const name of ['total','cerrados','encurso','abiertos','blt','cli','atrap','agua','voltaje','nofunc','sla'])text(name,'0');
      for(const name of ['cerrados-pct','encurso-pct','abiertos-pct','blt-pct','cli-pct','sla-pct','avg-llegada','avg-cierre'])text(name,'—');
      text('criticos-dia','—');state.current=[];state.details={};
      for(const name of ['svg-estado','svg-resp','svg-caf-blt','svg-caf-cli','leg-estado','leg-resp','leg-caf-blt','leg-caf-cli','bar-zona','bar-tipo','bar-edo']){const el=id(name);if(el)el.innerHTML='';}
      renderTable();return;
    }
    state.current=state.tickets.filter(t=>t.fr===key);
    text('day-label',fullDate(key));text('day-sub',state.dayIndex===0?'Día más reciente disponible en la muestra NS':'Día '+(state.dayIndex+1)+' de '+state.dates.length);
    const prev=id('prev-day'),next=id('next-day');if(prev)prev.disabled=state.dayIndex>=state.dates.length-1;if(next)next.disabled=state.dayIndex===0;
    const rows=state.current, total=rows.length;
    const closed=rows.filter(t=>t.et==='Cerrado'),inProgress=rows.filter(t=>t.et==='En curso'),open=rows.filter(t=>t.et==='Abierto');
    const blt=closed.filter(t=>t.res==='BLT'),client=closed.filter(t=>t.res==='CLIENTE');
    state.details={
      cerrados:closed,encurso:inProgress,abiertos:open,blt,cliente:client,
      atrap:rows.filter(t=>matchesTerms(t,ATRAP)),agua:rows.filter(t=>matchesTerms(t,AGUA)),
      voltaje:rows.filter(t=>matchesTerms(t,VOLTAJE)),nofunc:rows.filter(t=>t.eqf.toLowerCase()==='no funcionando'),
      sla:rows.filter(t=>Boolean(t.xat)),criticos:[]
    };
    text('total',total);text('cerrados',closed.length);text('cerrados-pct',percent(closed.length,total));
    text('encurso',inProgress.length);text('encurso-pct',percent(inProgress.length,total));
    text('abiertos',open.length);text('abiertos-pct',percent(open.length,total));
    text('blt',blt.length);text('blt-pct',percent(blt.length,closed.length));
    text('cli',client.length);text('cli-pct',percent(client.length,closed.length));
    text('atrap',state.details.atrap.length);text('agua',state.details.agua.length);
    text('voltaje',state.details.voltaje.length);text('criticos-dia','—');
    text('nofunc',state.details.nofunc.length);text('sla',state.details.sla.length);text('sla-pct',percent(state.details.sla.length,total));
    const avgArrival=avgMin(closed,'tll');const avgSolution=avgMin(closed.filter(t=>t.eqf.toLowerCase()==='funcionando'),'tso');
    text('avg-llegada',avgArrival===null?'—':avgArrival+' min');text('avg-cierre',avgSolution===null?'—':avgSolution+' min');
    drawDonut('svg-estado','leg-estado',[
      {label:'Cerrados',rows:closed},{label:'En curso',rows:inProgress},{label:'Abiertos',rows:open}
    ]);
    drawDonut('svg-resp','leg-resp',[
      {label:'BLT',rows:blt},{label:'Cliente',rows:client},
      {label:'Sin dato',rows:closed.filter(t=>!['BLT','CLIENTE'].includes(t.res))}
    ]);
    const bltRows=rows.filter(t=>t.res==='BLT'),clientRows=rows.filter(t=>t.res==='CLIENTE');
    drawDonut('svg-caf-blt','leg-caf-blt',group(bltRows,'caf').map(g=>({label:g.label,rows:g.items})));
    drawDonut('svg-caf-cli','leg-caf-cli',group(clientRows,'caf').map(g=>({label:g.label,rows:g.items})));
    drawBars('bar-zona',group(rows,'zon'),total);drawBars('bar-tipo',group(rows,'prd'),total);drawBars('bar-edo',group(rows,'edo'),total);
    state.page=0;renderTable();
  }
  function bind(){
    const root=view();if(!root)return;
    id('prev-day')?.addEventListener('click',()=>{if(state.dayIndex<state.dates.length-1){state.dayIndex++;renderDay();}});
    id('next-day')?.addEventListener('click',()=>{if(state.dayIndex>0){state.dayIndex--;renderDay();}});
    id('refresh')?.addEventListener('click',()=>load());
    id('search')?.addEventListener('input',()=>{state.page=0;renderTable();});
    id('filter-et')?.addEventListener('change',()=>{state.page=0;renderTable();});
    id('page-prev')?.addEventListener('click',()=>{state.page--;renderTable();});
    id('page-next')?.addEventListener('click',()=>{state.page++;renderTable();});
    root.querySelectorAll('[data-nsns-detail]').forEach(el=>el.addEventListener('click',()=>{
      const type=el.dataset.nsnsDetail;if(type==='criticos')return;
      showDetails(el.querySelector('.lbl')?.textContent||type,state.details[type]||[]);
    }));
    root.addEventListener('click',e=>{
      const b=e.target.closest('[data-nsns-ticket],[data-nsns-equipo],[data-nsns-proyecto]');
      if(!b || !root.contains(b))return;
      if(b.hasAttribute('data-nsns-ticket'))showTicket(b.dataset.nsnsTicket);
      else if(b.hasAttribute('data-nsns-equipo'))showEquipo(b.dataset.nsnsEquipo);
      else if(b.hasAttribute('data-nsns-proyecto'))showProyecto(b.dataset.nsnsProyecto);
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')hideDetails();});
  }
  async function load(){
    if(state.loading)return;
    if(!window.ManttoAuth || typeof window.ManttoAuth.apiGet!=='function'){
      setStatus('error','Sesión necesaria para consultar Experimental NS');return;
    }
    state.loading=true;const refresh=id('refresh');if(refresh)refresh.disabled=true;
    setStatus('loading','Consultando únicamente tablas NS...');
    try{
      const result=await window.ManttoAuth.apiGet(ENDPOINT);
      if(result.ok!==true || result.source!=='experimental-ns' || !Array.isArray(result.data?.tickets) || !Array.isArray(result.data?.portafolio)){
        throw new Error('Contrato Experimental NS no válido.');
      }
      state.tickets=result.data.tickets.map(ticket).filter(t=>t.n&&t.fr);
      state.portafolio=result.data.portafolio;
      state.truncated=result.truncado===true;
      state.dates=[...new Set(state.tickets.map(t=>t.fr))].sort().reverse();
      state.dayIndex=0;
      setStatus('ok','Experimental NS · '+state.tickets.length.toLocaleString('es-MX')+' tickets'+(state.truncated?' · MUESTRA TRUNCADA':''));
      renderDay();
    }catch(error){
      // Nunca utilizar endpoints productivos ante errores, permisos faltantes o tablas vacías.
      state.tickets=[];state.portafolio=[];state.dates=[];state.dayIndex=0;
      setStatus('error','Sin acceso a datos NS ('+String(error?.code||error?.message||'error de lectura').slice(0,90)+')');
      renderDay();
    }finally{state.loading=false;if(refresh)refresh.disabled=false;}
  }
  function init(){
    if(!view())return false;
    if(!state.initialized){
      if(!copyLayout())return false;
      bind();state.initialized=true;
    }
    load();return true;
  }
  window.ManttoResumenDiaNS=Object.freeze({init,load});
})();
