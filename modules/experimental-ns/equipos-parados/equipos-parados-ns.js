/* BLT NOW | Experimental NS | Equipos Parados V001
 * Adaptacion del tablero EP: Aiven ns_tickets_pruebas + ns_portafolio_pruebas.
 * Sin NetSuite directo ni fallback local/productivo.
 */
(function(){
  'use strict';
  if(window.ManttoEquiposParadosNS) return;

  const ROUTE='experimental-ns-equipos-parados';
  const ENDPOINT='/api/experimental-ns/equipos-parados/inicial';
  const RESP=[['BLT','#2a78d6'],['Cliente','#eda100'],['Sin asignar','#94a3b8']];
  const EDADES=[['< 1 día',0,1],['1-3 días',1,4],['4-7 días',4,8],['8-30 días',8,31],['31-90 días',31,91],['> 90 días',91,1e9]];
  const COLOR_EDAD=['#86b6ef','#5598e7','#2a78d6','#eda100','#eb6834','#d03b3b'];
  const TIPOS={ELE:'Elevador',ESC:'Escalera',MON:'Montacargas',RAM:'Rampa',PLA:'Plataforma',MOC:'Montacoches'};
  const MARCAS={BLT:'BLT',XIZ:'Xizi',OTI:'Otis',ORO:'Orona',KON:'Kone',HID:'Hidral',SCH:'Schindler',MIT:'Mitsubishi',THY:'Thyssenkrupp',TAI:'Taishan'};
  const nf=new Intl.NumberFormat('es-MX');
  const state={rows:[],filters:{sup:'',resp:'',zona:'',pri:'',edad:-1,txt:''},open:new Set(),payload:null,bound:false,request:0};

  const view=()=>document.getElementById('view-'+ROUTE);
  const $=(s)=>view()?.querySelector(s);
  const esc=(v)=>String(v==null?'':v).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=(v)=>String(v==null?'':v).trim();
  const resp=(v)=>/^blt$/i.test(norm(v))?'BLT':/^cliente$/i.test(norm(v))?'Cliente':'Sin asignar';
  const supFallback=(z)=>/^(NOR|OCC)/.test(z||'')?'Jorge':/^CN/.test(z||'')?'Cristopher':'Sin asignar';
  const dateText=(v)=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(norm(v));return m?`${m[3]}/${m[2]}/${m[1]}`:'—';};
  const parseDate=(v)=>{const m=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(norm(v));return m?new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]||'00'}:${m[5]||'00'}:${m[6]||'00'}-06:00`):null;};
  const duration=(d)=>d<1?`${Math.round(d*24)} h`:`${nf.format(Math.round(d))} d`;
  const pct=(a,b)=>(b?Math.round((a/b)*100):0)+'%';
  const classDays=(d)=>d<4?'d0':d<8?'d1':d<31?'d2':'d3';
  const count=(rows,key)=>rows.reduce((m,r)=>(m.set(r[key],(m.get(r[key])||0)+1),m),new Map());

  function notes(html){
    if(!html) return [];
    const doc=new DOMParser().parseFromString(String(html),'text/html');
    const blocks=[...doc.body.querySelectorAll('div')].filter((d)=>!d.querySelector('div'));
    return (blocks.length?blocks:[doc.body]).map((d)=>{
      const t=d.textContent.replace(/\s+/g,' ').trim();
      const m=/^\W*\[([^\]]+)\]\s*:?\s*/.exec(t);
      return {fecha:m?m[1]:'',texto:m?t.slice(m[0].length):t};
    }).filter((x)=>x.texto);
  }

  function mapRow(row){
    const report=parseDate(row.fecha_reporte);
    const hours=report?Math.max(0,(Date.now()-report.getTime())/36e5):0;
    const code=norm(row.codigo_equipo);
    const parts=code.split('-');
    return {
      id:Number(row.id)||0,
      idInterno:norm(row.id_interno),
      ticket:norm(row.ticket),
      zona:norm(row.zona)||'Sin zona',
      proyecto:norm(row.proyecto)||'Sin proyecto',
      equipo:code||'Sin equipo',
      referencia:norm(row.referencia),
      prioridad:norm(row.prioridad).toUpperCase()||'SIN PRIORIDAD',
      responsable:resp(row.responsabilidad),
      reporte:norm(row.fecha_reporte),
      horas:hours,
      dias:hours/24,
      observaciones:norm(row.descripcion),
      seguimiento:notes(row.custeventblt_mot_det),
      sup:norm(row.superintendente)||supFallback(norm(row.zona)),
      tipo:norm(row.tipo_equipo)||parts[2]||'?',
      marca:norm(row.marca)||parts[3]||'?'
    };
  }

  function markup(){
    return `<div class="epns-page">
      <header class="ep-titulo">
        <div><p class="ep-eyebrow">🧪 Experimental NS · Solo lectura</p><h1>Equipos parados</h1><p class="sub" id="sub">Preparando consulta...</p></div>
        <div class="ep-act" id="act"></div>
      </header>
      <div id="ep-warning"></div>
      <section class="ep-kpis" id="kpis"></section>
      <section class="ep-filtros no-print">
        <div class="fila"><span class="rot">Superint.</span><div class="pastillas" id="fSup"></div></div>
        <div class="fila"><span class="rot">Resp.</span><div class="pastillas" id="fResp"></div><span class="rot">Prioridad</span><div class="pastillas" id="fPri"></div><input id="fTxt" type="search" placeholder="Buscar proyecto, equipo, ticket…" aria-label="Buscar"></div>
        <div class="fila"><span class="rot">Zona</span><div class="pastillas" id="fZona"></div></div>
      </section>
      <section class="ep-graficas">
        <figure class="tarjeta"><figcaption>Responsabilidad <small>· equipos parados por responsable · clic para filtrar</small></figcaption><div id="gZona"></div></figure>
        <figure class="tarjeta"><figcaption>Tiempo abierto <small>· equipos por rango de tiempo · clic para filtrar</small></figcaption><div id="gEdad"></div></figure>
      </section>
      <section class="ep-negocio"><h2>Análisis</h2>
        <div class="ep-g2"><figure class="tarjeta"><figcaption>Días-equipo por zona <small>· tiempo acumulado sin servicio, por responsable</small></figcaption><div id="gDias"></div></figure><figure class="tarjeta"><figcaption>Equipos parados por semana de reporte <small>· últimas 12 semanas</small></figcaption><div id="gSemana"></div></figure></div>
        <div class="ep-g2"><figure class="tarjeta"><figcaption>Responsable por tiempo abierto <small>· clic en una celda para filtrar</small></figcaption><div id="gMatriz"></div></figure><figure class="tarjeta"><figcaption>Proyectos con mayor afectación <small>· días-equipo acumulados</small></figcaption><div id="gProy"></div></figure></div>
        <div class="ep-g2"><figure class="tarjeta"><figcaption>Tipo de equipo</figcaption><div id="gTipo"></div></figure><figure class="tarjeta"><figcaption>Marca</figcaption><div id="gMarca"></div></figure></div>
      </section>
      <section class="tarjeta ep-lista"><div class="ep-lista-cab"><h2 id="nLista">Equipos</h2><span class="sub">Orden: mayor tiempo abierto primero. Seleccione un renglón para consultar observaciones y motivo.</span></div><div id="lista"></div></section>
      <p class="ep-pie" id="pie"></p>
      <div id="tip" class="ep-tip" hidden></div>
    </div>`;
  }

  async function apiGet(path){
    if(!window.ManttoAuth || typeof window.ManttoAuth.apiGet!=='function') throw new Error('No se encuentra disponible la sesión de BLT NOW.');
    const get=()=>window.ManttoAuth.apiGet(path);
    const perf=window.ManttoExperimentalNsPerformance;
    return perf?.measureGet?perf.measureGet(ROUTE,'equipos-parados',get):get();
  }

  function pass(row,except){
    const f=state.filters;
    return (except==='sup'||!f.sup||row.sup===f.sup) && (except==='resp'||!f.resp||row.responsable===f.resp) &&
      (except==='zona'||!f.zona||row.zona===f.zona) && (except==='pri'||!f.pri||row.prioridad===f.pri) &&
      (except==='edad'||f.edad<0||(row.dias>=EDADES[f.edad][1]&&row.dias<EDADES[f.edad][2])) &&
      (!f.txt||[row.proyecto,row.equipo,row.referencia,row.ticket,row.observaciones].join(' ').toLowerCase().includes(f.txt));
  }

  function pills(id,key,order){
    const base=state.rows.filter((r)=>pass(r,key));
    const prop=key==='resp'?'responsable':key==='pri'?'prioridad':key==='sup'?'sup':'zona';
    const c=count(base,prop);
    const vals=order||[...c.keys()].sort();
    $(id).innerHTML=`<button class="pas${state.filters[key]?'':' activo'}" data-f="${key}" data-v="">Todos<small>${base.length}</small></button>`+
      vals.filter((v)=>c.get(v)).map((v)=>`<button class="pas${state.filters[key]===v?' activo':''}" data-f="${key}" data-v="${esc(v)}">${esc(v)}<small>${c.get(v)}</small></button>`).join('');
  }

  function kpis(rows){
    const n=rows.length,r=count(rows,'responsable'),days=rows.map((x)=>x.dias).sort((a,b)=>a-b);
    const med=n?days[Math.floor((n-1)/2)]:0;
    const over=rows.filter((x)=>x.dias>30).length;
    const high=rows.filter((x)=>x.prioridad==='ALTA'||x.prioridad==='PLUS').length;
    $('#kpis').innerHTML=`<div class="kpi"><div class="n">${n}</div><div class="t">equipos parados ahora</div><div class="barra-resp">${RESP.map(([k,c])=>r.get(k)?`<i style="flex:${r.get(k)};background:${c}"></i>`:'').join('')}</div><div class="ley">${RESP.map(([k,c])=>`<span><i class="pt" style="background:${c}"></i>${k} ${r.get(k)||0}</span>`).join('')}</div></div>`+
      `<div class="kpi"><div class="n">${duration(med)}</div><div class="t">mediana de tiempo abierto</div></div>`+
      `<div class="kpi"><div class="n">${over}<small> de ${n}</small></div><div class="t">con más de 30 días abiertos</div></div>`+
      `<div class="kpi"><div class="n">${high}</div><div class="t">en proyectos de prioridad ALTA o PLUS</div></div>`;
  }

  function responsibility(){
    const base=state.rows.filter((r)=>pass(r,'resp')),n=base.length;
    const seg=RESP.map(([k,c])=>[k,c,base.filter((r)=>r.responsable===k).length]).filter((x)=>x[2]);
    if(!n){$('#gZona').innerHTML='<p class="vacio">Sin equipos con este filtro.</p>';return;}
    $('#gZona').innerHTML='<div class="resp-cards">'+seg.map(([k,c,v])=>`<button data-f="resp" data-v="${state.filters.resp===k?'':esc(k)}"><i style="background:${c}"></i><b>${v}</b><span>${esc(k)}</span><small>${Math.round(v/n*100)}% · ${nf.format(Math.round(base.filter((r)=>r.responsable===k).reduce((s,r)=>s+r.dias,0)))} días-equipo</small></button>`).join('')+'</div>';
  }

  function age(){
    const base=state.rows.filter((r)=>pass(r,'edad'));
    const nums=EDADES.map(([,a,b])=>base.filter((r)=>r.dias>=a&&r.dias<b).length),max=Math.max(1,...nums);
    $('#gEdad').innerHTML='<div class="edad">'+EDADES.map(([t],i)=>`<div class="col${state.filters.edad===i?' sel':''}" data-e="${i}" data-tip="${esc(t)}|${nums[i]} equipos"><b>${nums[i]}</b><i style="height:${Math.max(2,nums[i]/max*120)}px;background:${COLOR_EDAD[i]}"></i><span>${esc(t)}</span></div>`).join('')+'</div>';
  }

  function daysByZone(rows){
    const map=new Map();
    rows.forEach((r)=>{const e=map.get(r.zona)||{t:0,r:{}};e.t+=r.dias;e.r[r.responsable]=(e.r[r.responsable]||0)+r.dias;map.set(r.zona,e);});
    const ordered=[...map.entries()].sort((a,b)=>b[1].t-a[1].t),max=Math.max(1,...ordered.map((x)=>x[1].t));
    $('#gDias').innerHTML=ordered.length?'<div class="barras">'+ordered.map(([zona,e])=>`<span class="n" data-z="${esc(zona)}">${esc(zona)}</span><span class="pista" style="width:${e.t/max*100}%">${RESP.map(([k,c])=>e.r[k]?`<i style="flex:${e.r[k]};background:${c}"></i>`:'').join('')}</span><span class="v">${nf.format(Math.round(e.t))}</span>`).join('')+'</div>':'<p class="vacio">Sin datos.</p>';
  }

  function weeks(rows){
    const now=new Date(),monday=(d)=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;};
    const base=monday(now),N=12,buckets=Array(N).fill(0);let before=0;
    rows.forEach((r)=>{const d=parseDate(r.reporte);if(!d)return;const k=Math.floor((base-monday(d))/(7*864e5));if(k>=0&&k<N)buckets[N-1-k]++;else if(k>=N)before++;});
    const max=Math.max(1,before,...buckets),label=(i)=>{const d=new Date(base);d.setDate(d.getDate()-(N-1-i)*7);return d.toLocaleDateString('es-MX',{day:'numeric',month:'short'});};
    $('#gSemana').innerHTML='<div class="semanas">'+`<div class="s antes"><b>${before||''}</b><i style="height:${before/max*140}px"></i><span>antes</span></div>`+buckets.map((n,i)=>`<div class="s"><b>${n||''}</b><i style="height:${Math.max(n?3:0,n/max*140)}px"></i><span>${i%2?'':label(i)}</span></div>`).join('')+'</div>';
  }

  function matrix(){
    const f=state.filters,oldResp=f.resp,oldAge=f.edad;f.resp='';f.edad=-1;const base=state.rows.filter((r)=>pass(r));f.resp=oldResp;f.edad=oldAge;
    const n=(k,a,b)=>base.filter((r)=>r.responsable===k&&r.dias>=a&&r.dias<b).length;
    const max=Math.max(1,...RESP.flatMap(([k])=>EDADES.map(([,a,b])=>n(k,a,b))));
    $('#gMatriz').innerHTML='<table class="matriz"><tr><th></th>'+EDADES.map(([t])=>`<th>${esc(t.replace(' días',' d').replace(' día',' d'))}</th>`).join('')+'</tr>'+RESP.map(([k])=>`<tr><th>${k}</th>`+EDADES.map(([t,a,b],i)=>{const v=n(k,a,b),alpha=v?0.12+0.88*(v/max):0,same=f.resp===k&&f.edad===i;return v?`<td class="${same?'sel':''}" data-mr="${k}" data-me="${i}" style="background:rgba(42,120,214,${alpha.toFixed(2)});color:${alpha>.55?'#fff':'#24324a'}">${v}</td>`:'<td class="cero">·</td>';}).join('')+'</tr>').join('')+'</table>';
  }

  function smallBars(id,rows,key,names,limit){
    const m=new Map();rows.forEach((r)=>m.set(r[key],(m.get(r[key])||0)+1));const data=[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit||99),max=Math.max(1,...data.map((x)=>x[1]));
    $(id).innerHTML=data.length?'<div class="marcas">'+data.map(([k,v])=>`<span>${esc((names&&names[k])||k||'?')}</span><span class="pista" style="width:${v/max*100}%"><i style="flex:1;background:#2a78d6"></i></span><span class="v">${v} · ${pct(v,rows.length)}</span>`).join('')+'</div>':'<p class="vacio">Sin datos.</p>';
  }

  function projects(rows){
    const m=new Map();rows.forEach((r)=>{const e=m.get(r.proyecto)||{n:0,d:0};e.n++;e.d+=r.dias;m.set(r.proyecto,e);});const data=[...m.entries()].sort((a,b)=>b[1].d-a[1].d).slice(0,8),max=Math.max(1,...data.map((x)=>x[1].d));
    $('#gProy').innerHTML=data.length?'<div class="lista-mini">'+data.map(([k,e])=>`<span class="n" data-q="${esc(k)}" title="${esc(k)}">${esc(k)}</span><span class="b" style="width:${Math.max(4,e.d/max*90)}px"></span><span class="v"><b>${nf.format(Math.round(e.d))}</b> d · ${e.n} eq.</span>`).join('')+'</div>':'<p class="vacio">Sin datos.</p>';
  }

  function list(rows){
    const ordered=rows.slice().sort((a,b)=>b.dias-a.dias);
    $('#nLista').textContent=`${ordered.length} equipo${ordered.length===1?'':'s'}`;
    $('#lista').innerHTML=ordered.length?ordered.map((r)=>{
      const latest=r.seguimiento.length?r.seguimiento[0]:null;
      const nsLink=r.idInterno?`<a class="ns" href="https://5602799.app.netsuite.com/app/crm/support/supportcase.nl?id=${encodeURIComponent(r.idInterno)}" target="_blank" rel="noopener">${esc(r.ticket)} ↗</a>`:esc(r.ticket);
      return `<div class="reng${state.open.has(r.ticket)?' abierto':''}" data-t="${esc(r.ticket)}"><button type="button" aria-expanded="${state.open.has(r.ticket)}"><span class="dias ${classDays(r.dias)}">${duration(r.dias).split(' ')[0]}<small>${r.dias<1?'horas':'días'}</small></span><span class="proy"><b>${esc(r.proyecto)}</b><span>${esc(r.referencia)} · ${esc(r.equipo)}</span></span><span class="zona"><b>${esc(r.zona)} · ${esc(r.sup)}</b><span>Reporte ${dateText(r.reporte)}</span></span><span><span class="chip">${esc(r.prioridad)}</span></span><span><span class="chip">${esc(r.responsable)}</span></span><span class="ult">${latest?`<b>${esc(latest.fecha)}</b> ${esc(latest.texto)}`:`<b>Obs.:</b> ${esc(r.observaciones||'—')}`}</span><span class="flecha">›</span></button><div class="detalle"><div class="dos"><div><h4>Observaciones</h4><p>${esc(r.observaciones||'—')}</p><div class="datos"><div><span>No. Ticket</span> ${nsLink}</div><div><span>ID interno NS</span> ${esc(r.idInterno||'—')}</div><div><span>Fecha de reporte</span> ${dateText(r.reporte)}</div><div><span>Tiempo abierto</span> ${nf.format(r.horas)} h</div></div></div><div><h4>Motivo equipo detenido</h4>${r.seguimiento.length?'<ul class="seg">'+r.seguimiento.map((s)=>`<li><b>${esc(s.fecha)}</b>${esc(s.texto)}</li>`).join('')+'</ul>':'<p class="muted">Sin motivo capturado.</p>'}</div></div></div></div>`;
    }).join(''):'<p class="vacio">Ningún equipo cumple con estos filtros.</p>';
  }

  function render(){
    const rows=state.rows.filter((r)=>pass(r));
    pills('#fSup','sup');pills('#fResp','resp',RESP.map((r)=>r[0]));pills('#fZona','zona');pills('#fPri','pri',['ALTA','PLUS','MEDIA','BAJA']);
    kpis(rows);responsibility();age();daysByZone(rows);weeks(rows);matrix();projects(rows);smallBars('#gTipo',rows,'tipo',TIPOS);smallBars('#gMarca',rows,'marca',MARCAS,8);list(rows);
  }

  function bind(){
    if(state.bound||!view()) return;state.bound=true;
    view().addEventListener('click',(ev)=>{
      const t=ev.target.closest('[data-f]');if(t){state.filters[t.dataset.f]=t.dataset.v;return render();}
      const z=ev.target.closest('[data-z]');if(z){state.filters.zona=state.filters.zona===z.dataset.z?'':z.dataset.z;return render();}
      const a=ev.target.closest('[data-e]');if(a){const i=Number(a.dataset.e);state.filters.edad=state.filters.edad===i?-1:i;return render();}
      const m=ev.target.closest('[data-mr]');if(m){const i=Number(m.dataset.me),same=state.filters.resp===m.dataset.mr&&state.filters.edad===i;state.filters.resp=same?'':m.dataset.mr;state.filters.edad=same?-1:i;return render();}
      const p=ev.target.closest('[data-q]');if(p){state.filters.txt=p.dataset.q.toLowerCase();$('#fTxt').value=p.dataset.q;return render();}
      const row=ev.target.closest('.reng > button');if(row&&!ev.target.closest('a')){const key=row.parentNode.dataset.t;state.open.has(key)?state.open.delete(key):state.open.add(key);row.parentNode.classList.toggle('abierto');row.setAttribute('aria-expanded',state.open.has(key));}
      if(ev.target.closest('[data-epns="reload"]')) load();
      if(ev.target.closest('[data-epns="print"]')) window.print();
    });
    $('#fTxt').addEventListener('input',(ev)=>{state.filters.txt=ev.target.value.trim().toLowerCase();render();});
    view().addEventListener('mousemove',(ev)=>{const tip=$('#tip'),t=ev.target.closest('[data-tip]');if(!tip)return;if(!t){tip.hidden=true;return;}const parts=t.dataset.tip.split('|');tip.innerHTML=`<b>${esc(parts[0])}</b><br>${esc(parts[1]||'')}`;tip.hidden=false;tip.style.left=Math.min(window.innerWidth-tip.offsetWidth-8,ev.clientX+14)+'px';tip.style.top=Math.max(8,ev.clientY-tip.offsetHeight-10)+'px';});
  }

  async function load(){
    const seq=++state.request;
    $('#sub').textContent='Consultando Aiven · ns_tickets_pruebas + ns_portafolio_pruebas...';
    $('#act').innerHTML='<span class="foto">● Consultando</span>';
    try{
      const result=await apiGet(ENDPOINT);
      if(seq!==state.request||window.ManttoRouter?.getCurrent?.()?.route!==ROUTE) return false;
      if(!result||result.ok!==true||result.source!=='experimental-ns'||!Array.isArray(result.data)) throw new Error('Respuesta inesperada del backend.');
      state.payload=result;state.rows=result.data.map(mapRow);
      $('#sub').textContent='Tickets abiertos con equipo no funcionando · Aiven experimental';
      const generated=new Date(result.generadoIso||Date.now());
      $('#act').innerHTML=`<span class="vivo">● Aiven</span> Última lectura<br><b>${generated.toLocaleDateString('es-MX',{day:'numeric',month:'long'})}, ${generated.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</b><br><button class="actualizar no-print" type="button" data-epns="reload">Actualizar</button><button class="actualizar no-print" type="button" data-epns="print">Imprimir / PDF</button>`;
      const missing=result.criterios?.no_disponibles||[];
      $('#ep-warning').innerHTML=missing.length?`<p class="ep-warning"><b>Criterio no reproducible:</b> ${esc(missing.join(' · '))}</p>`:'';
      $('#pie').textContent='Criterios aplicados: '+(result.criterios?.aplicados||[]).join(' · ')+'. Tiempo detenido calculado desde fecha_reporte.';
      render();return true;
    }catch(error){
      console.error('[EXPERIMENTAL_NS_EQUIPOS_PARADOS]',error);
      state.rows=[];
      $('#sub').textContent='No fue posible consultar Equipos Parados Experimental NS.';
      $('#act').innerHTML='<span class="foto">● Sin datos</span>';
      $('#ep-warning').innerHTML='<p class="ep-warning"><b>Fail-closed:</b> '+esc(error.message||'Error de consulta')+'. No se consultaron tablas productivas ni archivos de respaldo.</p>';
      $('#pie').textContent='Sin datos disponibles.';render();return false;
    }
  }

  function init(){
    const root=view();if(!root)return false;
    state.filters={sup:'',resp:'',zona:'',pri:'',edad:-1,txt:''};state.open.clear();state.rows=[];
    root.innerHTML=markup();bind();load();return true;
  }

  window.ManttoEquiposParadosNS=Object.freeze({init,load});
})();