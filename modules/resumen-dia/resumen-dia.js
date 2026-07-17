(function(){
  const COLORS = ['#1B4FD8','#16A34A','#D97706','#DC2626','#0891B2','#7C3AED','#64748B','#E87722'];
  const ATRAP_KW = ['atrapado','atrapada','encerrado','encerrada','persona atrapada','personas atrapadas','rescate'];
  const AGUA_KW = ['agua','filtracion','filtración','inundacion','inundación','goteras','humedad'];
  const VOLTAJE_KW = ['voltaje','variacion de voltaje','variación de voltaje','sobre voltaje','bajo voltaje','pico de voltaje','falla electrica','falla eléctrica','corte de luz','falla de energia','falla de energía','sin energia','sin energía','apagon','apagón'];
  let allTickets = [], portafolioItems = [], dates = [], currentDayIdx = 0, currentDayTickets = [], tableFiltered = [], page = 0;
  let criticalEquipmentCodes = new Set();
  let criticalCriteria = { fallas: 3, periodo: 35 };
  const pageSize = 30;

  function byId(id){ return document.getElementById(id); }
  function txt(id, value){ const el = byId(id); if(el) el.textContent = value; }
  function apiUrl(path){
    const base = (window.MANTTO_API_BASE || '').replace(/\/$/, '');
    if(!base) return path;
    return base + path;
  }
  function nrm(v){ return (v==null?'':String(v)).trim(); }
  function upper(v){ return nrm(v).toUpperCase(); }
  function ymd(v){
    if(v === null || v === undefined || v === '') return null;

    // Las fechas operativas de MySQL (DATE) representan un dia de calendario,
    // no un instante UTC. Por eso nunca se convierten con toISOString().
    if(v instanceof Date && !isNaN(v.getTime())){
      return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
    }

    const s = String(v).trim();
    if(!s || s.toLowerCase() === 'null') return null;

    // MySQL DATE, DATETIME o cadena ISO: conservar literalmente YYYY-MM-DD.
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if(m) return m[1]+'-'+m[2]+'-'+m[3];

    // Variantes sin conversion de zona horaria.
    m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:$|[T\s])/);
    if(m) return m[1]+'-'+m[2]+'-'+m[3];

    m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:$|[T\s])/);
    if(m) return m[3]+'-'+m[2]+'-'+m[1];

    console.warn('[Resumen del Dia] Fecha operativa no reconocida; no se transforma:', v);
    return null;
  }
  function hm(v){
    if(!v) return null;
    let s = String(v).trim();
    if(!s || s.toLowerCase()==='null') return null;
    s = s.replace(/^1899-12-3[01]T/,'').replace(/\.\d+Z?$/,'').trim();
    const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if(ampm){
      let h = parseInt(ampm[1],10), m = ampm[2];
      const ap = ampm[3].toUpperCase();
      if(ap==='PM' && h < 12) h += 12;
      if(ap==='AM' && h === 12) h = 0;
      return String(h).padStart(2,'0') + ':' + m;
    }
    const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
    if(m24) return String(parseInt(m24[1],10)).padStart(2,'0') + ':' + m24[2];
    return null;
  }
  function num(v){ const n = parseFloat(v); return isNaN(n) ? null : n; }
  function durHours(v){
    if(v==null || v==='') return null;
    if(typeof v === 'number') return isNaN(v) ? null : v;
    const s = String(v).trim().toLowerCase();
    if(!s || s === 'null' || s === '—') return null;
    const clean = s.replace(',', '.');
    if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean) || /^\d{4}-\d{2}-\d{2}/.test(clean)) return null;
    if(/^\d+(\.\d+)?$/.test(clean)) return parseFloat(clean);
    const hmMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if(hmMatch) return parseInt(hmMatch[1],10) + parseInt(hmMatch[2],10)/60;
    const hMatch = clean.match(/(\d+(?:\.\d+)?)\s*h/);
    const mMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:m|min)/);
    if(hMatch || mMatch){
      const h = hMatch ? parseFloat(hMatch[1]) : 0;
      const m = mMatch ? parseFloat(mMatch[1]) : 0;
      const out = h + (m/60);
      return out > 0 ? out : null;
    }
    const any = parseFloat(clean);
    return isNaN(any) ? null : any;
  }
  function diffHours(d1, h1, d2, h2){
    if(!d1 || !d2) return null;
    const a = new Date(d1 + 'T' + (h1 || '00:00') + ':00');
    const b = new Date(d2 + 'T' + (h2 || '00:00') + ':00');
    if(isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    const hrs = (b - a) / 3600000;
    return hrs > 0 && hrs < 24*30 ? hrs : null;
  }
  function fmtDate(v){
    const value = ymd(v);
    if(!value) return '—';
    const parts = value.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : '—';
  }
  function tableText(value){
    const text = nrm(value) || '—';
    return `<span title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
  }
  function fmtDuration(v){
    const h = durHours(v);
    if(h == null) return '—';
    const totalMin = Math.round(h * 60);
    if(totalMin < 60) return totalMin + ' min';
    const days = Math.floor(totalMin / 1440);
    const rem = totalMin % 1440;
    const hh = Math.floor(rem / 60);
    const mm = rem % 60;
    if(days > 0){
      const parts = [days + ' d'];
      if(hh) parts.push(hh + ' h');
      if(mm) parts.push(mm + ' min');
      return parts.join(' ');
    }
    return mm ? (hh + ' h ' + mm + ' min') : (hh + ' h');
  }
  function estadoTicket(row){
    const raw = nrm(row.estado_ticket || row.estado || row.et);
    const low = raw.toLowerCase();
    if(low.includes('cerr')) return 'Cerrado';
    if(low.includes('curso') || low.includes('proceso')) return 'En curso';
    if(low.includes('abier') || low.includes('pend')) return 'Abierto';
    return raw || 'Abierto';
  }
  function pick(row, names){
    for(const name of names){
      if(row && Object.prototype.hasOwnProperty.call(row, name) && row[name] !== null && row[name] !== undefined && String(row[name]).trim() !== '') return row[name];
    }
    return '';
  }
  function mapTicket(row){
    const caf = nrm(pick(row,['causa_falla','Causa_de_Falla','caf']));
    const fr = ymd(pick(row,['fecha_reporte','F_Reporte','fr']));
    const hr = hm(pick(row,['h_reporte','H_Reporte','hr']));
    const fl = ymd(pick(row,['fecha_llegada','F_Llegada','fl']));
    const hl = hm(pick(row,['h_llegada','H_Llegada','hl']));
    const fs = ymd(pick(row,['fecha_cierre','fecha_solucion','F_Solucion','fs']));
    const hs = hm(pick(row,['h_solucion','H_Solucion','hs']));
    let tll = durHours(pick(row,['tiempo_llegada','Tiempo_Llegada','tll']));
    let tso = durHours(pick(row,['tiempo_solucion','Tiempo_Solucion','tso']));
    const tll2 = durHours(pick(row,['tiempo_llegada_ii','Tiempo_Llegada_II','xat']));
    const tso2 = durHours(pick(row,['tiempo_solucion_ii','Tiempo_Solucion_II','xso']));

    // Fuente principal para detalle: fechas + horas reales del ticket.
    // Las columnas Tiempo_Llegada/Tiempo_Solucion pueden venir como decimal,
    // vacias o con valores tipo fecha de Excel; por eso se recalculan cuando hay
    // F/H de reporte, llegada y solucion disponibles.
    const tllCalc = diffHours(fr, hr, fl, hl);
    const tsoCalc = diffHours(fl, hl, fs, hs);
    const tsoCalcFromReport = diffHours(fr, hr, fs, hs);
    if(tllCalc != null) tll = tllCalc;
    else if(tll == null) tll = tll2;
    if(tsoCalc != null) tso = tsoCalc;
    else if(tso == null) tso = tso2 ?? tsoCalcFromReport;
    return {
      n: nrm(pick(row,['ticket','No_Ticket','folio','n','id_interno','ID_Interno','id'])),
      et: estadoTicket({estado_ticket:pick(row,['estado_ticket','Estado_Ticket']), estado:pick(row,['estado','Estado','et'])}),
      edo: nrm(pick(row,['estado','Estado','edo'])), ciu: nrm(pick(row,['ciudad','Ciudad','ciu'])), pro: nrm(pick(row,['proyecto','Proyecto','pro'])),
      cod: nrm(pick(row,['codigo_equipo','Codigo_Equipo','equipo','cod'])), ref: nrm(pick(row,['referencia_en_zona_operativa','Referencia_en_Zona_Operativa','identificacion_sitio','Identificacion_en_Sitio','ref'])),
      zon: nrm(pick(row,['zona','zona_operativa','Zona_Operativa','zon'])), asu: nrm(pick(row,['descripcion','asunto_ticket','Asunto','asu'])),
      fr, hr,
      eqi: nrm(pick(row,['estatus_equipo_ir','Estatus_Equipo_Ir','eqi'])), fl, hl,
      fs, hs, tec: nrm(pick(row,['tecnico','Tecnico_de_Solucion','tec'])),
      sup: nrm(pick(row,['supervisor','Supervisor','sup'])), eqf: nrm(pick(row,['estatus_equipo_final','Estatus_Equipo_Final','eqf'])), cau: nrm(pick(row,['causa','Causa','cau'])), acc: nrm(pick(row,['accion_en_cierre','Accion_en_Cierre','acc'])),
      res: normalizeResp(pick(row,['responsabilidad','RESPONSABILID','res']), caf), caf,
      tll, tso,
      prd: nrm(pick(row,['tipo_equipo','Producto','prd'])), pri: nrm(pick(row,['prioridad','Prioridad_Proyecto','pri'])), xat: nrm(pick(row,['ticket_excede','Ticket_excede','xat'])),
      vobo_estado: nrm(pick(row,['vobo_estado','validacion_estado'])), vobo_comentario: nrm(pick(row,['vobo_comentario','comentario_validacion'])),
      ejecutivo_call: nrm(pick(row,['ejecutivo_call','Ejecutivo_Call'])), blt_empleado: nrm(pick(row,['blt_empleado','BLT_Empleado'])), persona_atiende: nrm(pick(row,['persona_que_atiende','Persona_que_atiende']))
    };
  }
  function normalizeResp(v, caf){
    const u = upper(v);
    if(u.includes('BLT')) return 'BLT';
    if(u.includes('CLIENT')) return 'CLIENTE';
    const c = upper(caf);
    if(c.includes('INHERENTE') || c.includes('EQUIPO') || c.includes('BLT')) return 'BLT';
    if(c.includes('CLIENT') || c.includes('OPERACION') || c.includes('OPERACIÓN') || c.includes('USUARIO')) return 'CLIENTE';
    return nrm(v);
  }
  function mapPortafolio(row){
    return {
      cod: nrm(row.numero_equipo || row.codigo_equipo || row.cod || row.equipo),
      pro: nrm(row.proyecto || row.pro),
      zon: nrm(row.zona_operativa || row.zona || row.zon),
      ref: nrm(row.identificacion_sitio || row.referencia_en_zona_operativa || row.ref),
      inactivo: nrm(row.inactivo).toLowerCase(),
      estatus: nrm(row.estatus_servicio || row.estatus || row.estado_servicio),
      estadoRegistro: row.estado_registro
    };
  }
  function isActiveEquipo(pf){
    if(!pf) return false;
    const inactive = ['1','si','sí','true','inactivo','x'].includes(String(pf.inactivo||'').toLowerCase());
    const estadoReg = pf.estadoRegistro == null ? true : String(pf.estadoRegistro) !== '0';
    return !inactive && estadoReg;
  }
  async function fetchTickets(){
    setStatus('loading','Cargando Aiven...');
    const urls = [apiUrl('/api/tickets?limit=5000'), apiUrl('/api/tickets')];
    for(const url of urls){
      try{
        const res = await fetch(url,{cache:'no-store', headers:Object.assign({'Accept':'application/json'}, window.ManttoAuth ? window.ManttoAuth.authHeaders() : {})});
        if(!res.ok) continue;
        const json = await res.json();
        const rows = Array.isArray(json) ? json : (json.data || json.tickets || []);
        if(rows.length){ setStatus('ok','Aiven · '+rows.length.toLocaleString('es-MX')+' tickets'); return rows.map(mapTicket).filter(t=>t.n && t.fr); }
      }catch(e){}
    }
    setStatus('error','Sin datos reales desde Aiven');
    return [];
  }
  async function fetchPortafolio(){
    const urls = [apiUrl('/api/portafolio?limit=5000'), apiUrl('/api/portafolio')];
    for(const url of urls){
      try{
        const res = await fetch(url,{cache:'no-store', headers:Object.assign({'Accept':'application/json'}, window.ManttoAuth ? window.ManttoAuth.authHeaders() : {})});
        if(!res.ok) continue;
        const json = await res.json();
        const rows = Array.isArray(json) ? json : (json.data || json.portafolio || []);
        if(rows.length) return rows.map(mapPortafolio).filter(p=>p.cod || p.pro);
      }catch(e){}
    }
    return [];
  }
  async function fetchCriticidadUsuario(){
    const authHeaders = Object.assign({'Accept':'application/json'}, window.ManttoAuth ? window.ManttoAuth.authHeaders() : {});

    try{
      const prefResponse = await fetch(apiUrl('/api/usuarios/me/criticos-preferencias'), {cache:'no-store', headers:authHeaders});
      if(prefResponse.ok){
        const prefPayload = await prefResponse.json().catch(()=>({}));
        const pref = prefPayload.data || prefPayload.preferencias || prefPayload.user || prefPayload || {};
        const fallas = parseInt(pref.criticos_fallas, 10);
        const periodo = parseInt(pref.criticos_periodo, 10);
        criticalCriteria = {
          fallas: Number.isFinite(fallas) && fallas > 0 ? fallas : 3,
          periodo: Number.isFinite(periodo) && periodo > 0 ? periodo : 35
        };
      }
    }catch(error){
      criticalCriteria = { fallas: 3, periodo: 35 };
    }

    try{
      // No enviamos min_fallas ni dias: el backend usa las preferencias
      // específicas del usuario autenticado y sus defaults 3/35.
      const response = await fetch(apiUrl('/api/equipos-criticos?page=1&page_size=5000'), {cache:'no-store', headers:authHeaders});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : (payload.data || payload.rows || []);
      criticalEquipmentCodes = new Set(rows.map(row=>nrm(row.codigo_equipo || row.numero_equipo || row.equipo || row.cod)).filter(Boolean));
      return criticalEquipmentCodes;
    }catch(error){
      console.warn('[Resumen del Día] No se pudo cargar la criticidad del usuario:', error.message);
      criticalEquipmentCodes = new Set();
      return criticalEquipmentCodes;
    }
  }
  function pfByCod(cod){ return portafolioItems.find(p=>p.cod===cod); }
  function openEquipo(cod){
    if(!cod) return;
    if(window.ManttoDetails && window.ManttoDetails.openEquipo) return window.ManttoDetails.openEquipo(cod);
    if(window.ManttoRouter && window.ManttoRouter.openTarget) window.ManttoRouter.openTarget({module:'portafolio', id:cod, source:'resumen-dia'});
  }
  function openProyecto(pro){
    if(!pro) return;
    if(window.ManttoDetails && window.ManttoDetails.openProyecto) return window.ManttoDetails.openProyecto(pro);
    if(window.ManttoRouter && window.ManttoRouter.openTarget) window.ManttoRouter.openTarget({module:'proyectos', id:pro, source:'resumen-dia'});
  }
  function formatProyectoName(value){
    const raw=String(value || '').trim();
    const m=raw.match(/^(\d+)-(\d{2})-(\d{2})$/);
    if(!m) return raw || '—';
    const meses={'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    const numero=String(Number(m[1]) || m[1].replace(/^0+/, '') || m[1]);
    const dia=String(Number(m[3]) || m[3]);
    return dia + ' de ' + (meses[m[2]] || m[2]) + ' #' + numero;
  }
  function setStatus(type,msg){ const el=byId('rd-api-status'); if(!el) return; el.className='rd-status '+type; el.innerHTML='<span class="dot"></span><span>'+msg+'</span>'; }
  function formatDay(key){
    const [y,m,d] = key.split('-').map(Number); const dt = new Date(y,m-1,d);
    const label = dt.toLocaleDateString('es-MX',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    return label.charAt(0).toUpperCase()+label.slice(1);
  }
  function initData(){
    dates = [...new Set(allTickets.map(t=>t.fr).filter(Boolean))].sort().reverse();
    if(currentDayIdx >= dates.length) currentDayIdx = 0;
  }
  function hasTxt(t,kws){ const s = (t.asu+' '+t.cau+' '+t.acc).toLowerCase(); return kws.some(k=>s.includes(k)); }
  function visualCodesForRows(rows, isCritical){
    const list = Array.isArray(rows) ? rows : [];
    const codes = [];
    if(isCritical) codes.push('CRITICO');
    if(list.some(t=>hasTxt(t,ATRAP_KW))) codes.push('ATRAPADO');
    if(list.some(t=>hasTxt(t,AGUA_KW))) codes.push('FILTRACION');
    if(list.some(t=>hasTxt(t,VOLTAJE_KW))) codes.push('VOLTAJE');
    if(list.some(t=>String(t.eqf||'').toLowerCase()==='no funcionando')) codes.push('NO_FUNCIONANDO');
    if(list.some(t=>!!t.xat)) codes.push('FUERA_SLA');
    return codes;
  }
  function renderVisuales(codes, empty){
    return window.EstadosVisuales_gnral ? window.EstadosVisuales_gnral.renderMany(codes,{empty:empty||''}) : (empty||'');
  }
  function renderIdentificador(codes, text){
    return window.EstadosVisuales_gnral ? window.EstadosVisuales_gnral.renderIdentifier(codes,text) : escapeHtml(text||'—');
  }
  function pct(v,total){ return total ? Math.round(v/total*100)+'%' : '—'; }
  function critSet(){
    return new Set(criticalEquipmentCodes);
  }
  function avgMin(arr){ const nums = arr.map(num).filter(n=>n!=null && n>0 && n<744); return nums.length ? Math.round(nums.reduce((a,b)=>a+b,0)/nums.length*60) : null; }
  function cafCount(rows){ const map={}; rows.forEach(t=>{ const k=(t.caf||'SIN DATO').replace(/^\d+ - /,'').trim() || 'SIN DATO'; map[k]=(map[k]||0)+1; }); return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({l,v})); }
  function renderEmptyState(){
    txt('rd-day-label','Sin datos reales');
    txt('rd-day-sub','Verifica que el backend local esté activo y conectado a Aiven');
    ['rd-total','rd-cerrados','rd-encurso','rd-abiertos','rd-blt','rd-cli','rd-atrap','rd-agua','rd-voltaje','rd-criticos-dia','rd-nofunc','rd-avg-llegada','rd-avg-cierre','rd-sla'].forEach(id=>txt(id,'0'));
    ['rd-cerrados-pct','rd-encurso-pct','rd-abiertos-pct','rd-blt-pct','rd-cli-pct','rd-sla-pct','rd-count'].forEach(id=>txt(id,'—'));
    ['rd-leg-estado','rd-leg-resp','rd-leg-caf-blt','rd-leg-caf-cli','rd-bar-zona','rd-bar-tipo','rd-bar-edo'].forEach(id=>{ const el=byId(id); if(el) el.innerHTML = '<div class="rd-empty">Sin datos reales para mostrar.</div>'; });
    ['rd-tbody'].forEach(id=>{ const el=byId(id); if(el) el.innerHTML = '<tr><td colspan="18" class="rd-empty">Sin datos reales para mostrar.</td></tr>'; });
    ['rd-svg-estado','rd-svg-resp','rd-svg-caf-blt','rd-svg-caf-cli'].forEach(id=>{ const el=byId(id); if(el) el.innerHTML=''; });
    hideDetail();
    const pageInfo = byId('rd-page-info'); if(pageInfo) pageInfo.textContent='Página 0 de 0';
  }

  function render(){
    if(!dates.length){ renderEmptyState(); return; }
    const key = dates[currentDayIdx]; currentDayTickets = allTickets.filter(t=>t.fr===key);
    txt('rd-day-label', formatDay(key)); txt('rd-day-sub', currentDayIdx===0?'Día más reciente':'Día '+(currentDayIdx+1)+' de '+dates.length);
    const prev=byId('rd-prev-day'), next=byId('rd-next-day'); if(prev) prev.disabled=currentDayIdx>=dates.length-1; if(next) next.disabled=currentDayIdx===0;
    const tks=currentDayTickets, total=tks.length, closed=tks.filter(t=>t.et==='Cerrado'), cerr=closed.length, curso=tks.filter(t=>t.et==='En curso').length, abiertos=tks.filter(t=>t.et==='Abierto').length;
    const blt=closed.filter(t=>t.res==='BLT').length, cli=closed.filter(t=>t.res==='CLIENTE').length, crit=critSet();
    const data = {
      atrap:tks.filter(t=>hasTxt(t,ATRAP_KW)), agua:tks.filter(t=>hasTxt(t,AGUA_KW)), voltaje:tks.filter(t=>hasTxt(t,VOLTAJE_KW)), criticos:tks.filter(t=>crit.has(t.cod)), nofunc:tks.filter(t=>String(t.eqf||'').toLowerCase()==='no funcionando'), sla:tks.filter(t=>t.xat),
      cerrados:closed, encurso:tks.filter(t=>t.et==='En curso'), abiertos:tks.filter(t=>t.et==='Abierto'), blt:closed.filter(t=>t.res==='BLT'), cliente:closed.filter(t=>t.res==='CLIENTE')
    };
    window.ManttoResumenDia._detailData = data;
    txt('rd-total', total||'—'); txt('rd-cerrados', cerr); txt('rd-cerrados-pct', pct(cerr,total)); txt('rd-encurso', curso); txt('rd-encurso-pct', pct(curso,total)); txt('rd-abiertos', abiertos); txt('rd-abiertos-pct', pct(abiertos,total));
    txt('rd-blt', blt); txt('rd-blt-pct', pct(blt,closed.length)); txt('rd-cli', cli); txt('rd-cli-pct', pct(cli,closed.length));
    txt('rd-atrap', data.atrap.length); txt('rd-agua', data.agua.length); txt('rd-voltaje', data.voltaje.length); txt('rd-criticos-dia', new Set(data.criticos.map(t=>t.cod).filter(Boolean)).size); txt('rd-nofunc', data.nofunc.length); txt('rd-sla', data.sla.length); txt('rd-sla-pct', total?pct(data.sla.length,total)+' del total':'—');
    const avgLlegVal = avgMin(closed.map(t=>t.tll)); const avgCierreVal = avgMin(closed.filter(t=>String(t.eqf||'').toLowerCase().includes('funcion')).map(t=>t.tso)); txt('rd-avg-llegada', avgLlegVal!=null ? avgLlegVal+' min' : '—'); txt('rd-avg-cierre', avgCierreVal!=null ? avgCierreVal+' min' : '—');
    drawDonut('rd-svg-estado','rd-leg-estado',[{l:'Cerrados',v:cerr,rows:data.cerrados},{l:'En curso',v:curso,rows:data.encurso},{l:'Abiertos',v:abiertos,rows:data.abiertos}], total);
    drawDonut('rd-svg-resp','rd-leg-resp',[{l:'BLT',v:blt,rows:data.blt},{l:'Cliente',v:cli,rows:data.cliente},{l:'Sin dato',v:closed.filter(t=>!t.res).length,rows:closed.filter(t=>!t.res)}], closed.length||1);
    const bltRows=tks.filter(t=>t.res==='BLT'), cliRows=tks.filter(t=>t.res==='CLIENTE'); drawDonut('rd-svg-caf-blt','rd-leg-caf-blt', cafCount(bltRows).map(x=>({...x,rows:bltRows.filter(t=>((t.caf||'SIN DATO').replace(/^\d+ - /,'').trim()||'SIN DATO')===x.l)})), bltRows.length||1); drawDonut('rd-svg-caf-cli','rd-leg-caf-cli', cafCount(cliRows).map(x=>({...x,rows:cliRows.filter(t=>((t.caf||'SIN DATO').replace(/^\d+ - /,'').trim()||'SIN DATO')===x.l)})), cliRows.length||1);
    drawBars('rd-bar-zona', groupRows(tks,'zon'), total); drawBars('rd-bar-tipo', groupRows(tks,'prd'), total); drawBars('rd-bar-edo', groupRows(tks,'edo'), total);
    page=0; renderTable(); hideDetail();
  }
  function groupRows(rows,key){ const map={}; rows.forEach(t=>{ const k=t[key]||'Sin dato'; if(!map[k]) map[k]=[]; map[k].push(t); }); return Object.keys(map).sort().map(l=>({l,v:map[l].length,rows:map[l]})).sort((a,b)=>b.v-a.v); }
  function donutPath(cx,cy,r,start,end){ const a0=(start-90)*Math.PI/180, a1=(end-90)*Math.PI/180; const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1); const large=(end-start)>180?1:0; return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`; }
  function drawDonut(svgId,legId,items,total){
    const svg=byId(svgId), leg=byId(legId); if(!svg||!leg) return; svg.innerHTML=''; leg.innerHTML=''; const sum=items.reduce((a,b)=>a+b.v,0)||0; let angle=0;
    if(!sum){ svg.innerHTML='<circle cx="65" cy="65" r="48" fill="#F1F5F9"></circle><text x="65" y="70" text-anchor="middle" fill="#667085" font-size="11" font-weight="800">Sin datos</text>'; return; }
    const positive = items.filter(it=>it.v>0);
    if(positive.length === 1){
      const it = positive[0];
      const colorIndex = Math.max(0, items.indexOf(it));
      const full = document.createElementNS('http://www.w3.org/2000/svg','circle');
      full.setAttribute('cx','65'); full.setAttribute('cy','65'); full.setAttribute('r','54');
      full.setAttribute('fill', COLORS[colorIndex%COLORS.length]); full.style.cursor='pointer';
      full.addEventListener('click',()=>showDetail(it.l,it.rows||[]));
      svg.appendChild(full);
    } else {
      items.forEach((it,i)=>{ if(!it.v) return; const deg=(it.v/sum)*360; const p=document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d',donutPath(65,65,54,angle,angle+deg)); p.setAttribute('fill',COLORS[i%COLORS.length]); p.style.cursor='pointer'; p.addEventListener('click',()=>showDetail(it.l,it.rows||[])); svg.appendChild(p); angle+=deg; });
    }
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx','65'); c.setAttribute('cy','65'); c.setAttribute('r','31'); c.setAttribute('fill','#fff'); svg.appendChild(c); const tx=document.createElementNS('http://www.w3.org/2000/svg','text'); tx.setAttribute('x','65'); tx.setAttribute('y','70'); tx.setAttribute('text-anchor','middle'); tx.setAttribute('fill','#0D2E6E'); tx.setAttribute('font-size','18'); tx.setAttribute('font-weight','900'); tx.textContent=sum; svg.appendChild(tx);
    items.forEach((it,i)=>{ const row=document.createElement('button'); row.type='button'; row.className='rd-legend-item'; row.innerHTML=`<span class="rd-legend-left"><span class="rd-color" style="background:${COLORS[i%COLORS.length]}"></span><span class="rd-legend-label">${it.l}</span></span><span class="rd-legend-val">${it.v}</span>`; row.addEventListener('click',()=>showDetail(it.l,it.rows||[])); leg.appendChild(row); });
  }
  function drawBars(id,items,total){ const el=byId(id); if(!el) return; el.innerHTML=''; if(!items.length){ el.innerHTML='<div class="empty-state">Sin datos</div>'; return; } items.slice(0,12).forEach((it,i)=>{ const pct=total?Math.round(it.v/total*100):0; const row=document.createElement('div'); row.className='rd-bar-row'; row.innerHTML=`<div class="rd-bar-top"><span class="rd-bar-label" title="${it.l}">${it.l}</span><span class="rd-bar-value">${it.v} · ${pct}%</span></div><div class="rd-bar-track"><div class="rd-bar-fill" style="width:${pct}%;background:${COLORS[i%COLORS.length]}"></div></div>`; row.addEventListener('click',()=>showDetail(it.l,it.rows||[])); el.appendChild(row); }); }
  function topEquiposData(rows){
    const crit = critSet();
    const map = {};
    rows.forEach(t=>{
      if(!t.cod) return;
      const pf = pfByCod(t.cod);
      if(!map[t.cod]) map[t.cod] = {cod:t.cod, zon:t.zon || (pf&&pf.zon) || '—', pro:t.pro || (pf&&pf.pro) || '—', ref:t.ref || (pf&&pf.ref) || '—', total:0, blt:0, cli:0, critico:crit.has(t.cod), rows:[]};
      map[t.cod].total++; map[t.cod].rows.push(t);
      if(t.res==='BLT') map[t.cod].blt++;
      if(t.res==='CLIENTE') map[t.cod].cli++;
    });
    return Object.values(map).sort((a,b)=>b.total-a.total || a.cod.localeCompare(b.cod)).slice(0,20);
  }
  function topProyectosData(rows){
    const crit = critSet();
    const map = {};
    rows.forEach(t=>{
      const pro = t.pro || 'Sin proyecto';
      if(!map[pro]) map[pro] = {pro, zon:t.zon || '—', total:0, blt:0, cli:0, cods:new Set(), critCods:new Set(), rows:[]};
      map[pro].total++; map[pro].rows.push(t);
      if(t.zon && map[pro].zon==='—') map[pro].zon=t.zon;
      if(t.res==='BLT') map[pro].blt++;
      if(t.res==='CLIENTE') map[pro].cli++;
      if(t.cod){ map[pro].cods.add(t.cod); if(crit.has(t.cod)) map[pro].critCods.add(t.cod); }
    });
    return Object.values(map).map(p=>{
      const activosPf = portafolioItems.filter(x=>x.pro===p.pro && isActiveEquipo(x));
      return {...p, activos: activosPf.length || p.cods.size, criticos: p.critCods.size};
    }).sort((a,b)=>b.total-a.total || a.pro.localeCompare(b.pro)).slice(0,20);
  }
  function renderTopEquipos(rows){
    const body=byId('rd-top-eq-body'); if(!body) return;
    const data=topEquiposData(rows); txt('rd-top-eq-count', data.length ? data.length+' equipos' : '');
    body.innerHTML = data.length ? data.map(e=>`<tr class="rd-click-row" data-equipo="${escapeHtml(e.cod)}"><td>${escapeHtml(e.zon)}</td><td><button class="rd-link" data-proyecto-link="${escapeHtml(e.pro)}">${renderIdentificador(visualCodesForRows(e.rows,e.critico),formatProyectoName(e.pro))}</button></td><td title="${escapeHtml(e.ref)}">${renderIdentificador(visualCodesForRows(e.rows,e.critico),e.ref)}</td><td><b>${e.total}</b></td><td>${e.blt}</td><td>${e.cli}</td><td>${renderVisuales(visualCodesForRows(e.rows,e.critico),'')}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#667085;padding:20px">Sin equipos para este periodo</td></tr>';
    body.querySelectorAll('[data-proyecto-link]').forEach(btn=>btn.addEventListener('click',ev=>{ev.stopPropagation();openProyecto(btn.dataset.proyectoLink);}));
    body.querySelectorAll('tr[data-equipo]').forEach(tr=>tr.addEventListener('click',()=>openEquipo(tr.dataset.equipo)));
  }
  function renderTopProyectos(rows){
    const body=byId('rd-top-proy-body'); if(!body) return;
    const data=topProyectosData(rows); txt('rd-top-proy-count', data.length ? data.length+' proyectos' : '');
    body.innerHTML = data.length ? data.map(p=>`<tr class="rd-click-row" data-proyecto="${escapeHtml(p.pro)}"><td>${escapeHtml(p.zon)}</td><td>${renderIdentificador([],formatProyectoName(p.pro))}<br><small>${escapeHtml(p.pro)}</small></td><td>${p.activos}</td><td><b>${p.total}</b></td><td>${p.blt}</td><td>${p.cli}</td><td>${p.criticos||0}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#667085;padding:20px">Sin proyectos para este periodo</td></tr>';
    body.querySelectorAll('[data-proyecto]').forEach(tr=>tr.addEventListener('click',()=>openProyecto(tr.dataset.proyecto)));
  }
  function badge(et){ const cls=et==='Cerrado'?'cerrado':et==='En curso'?'curso':'abierto'; return `<span class="rd-badge ${cls}">${et||'—'}</span>`; }
  function ticketBtn(t){ return `<button class="rd-link" data-ticket="${escapeHtml(t.n)}">${escapeHtml(t.n||'—')}</button>`; }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
  const TICKETS_CONTEXTUAL_UNI_HEADERS = ['No. Ticket','Proyecto','Equipo','Estado','Fecha Reporte','Hora Reporte','Asunto','Estatus inicial','Fecha Llegada','Hora Llegada','T. llegada','Fecha Solución','Hora Solución','Estatus final','Causa','Acción cierre','Responsabilidad','Causa de falla'];
  function ticketsContextualUniHead(){
    return '<tr>' + TICKETS_CONTEXTUAL_UNI_HEADERS.map(label=>`<th>${escapeHtml(label)}</th>`).join('') + '</tr>';
  }
  function renderRows(rows, tbody){
    const criticalCodes=critSet();
    tbody.innerHTML = rows.length ? rows.map(t=>{
      const ticketCodes=visualCodesForRows([t],false);
      const equipmentCodes=criticalCodes.has(t.cod)?['CRITICO']:[];
      return `<tr>
        <td><button class="rd-link" data-ticket="${escapeHtml(t.n)}">${renderIdentificador(ticketCodes,t.n)}</button></td>
        <td title="${escapeHtml(t.pro)}"><button class="rd-link" data-proyecto="${escapeHtml(t.pro)}">${renderIdentificador([],formatProyectoName(t.pro))}</button></td>
        <td><button class="rd-link" data-equipo="${escapeHtml(t.cod)}">${renderIdentificador(equipmentCodes,t.cod||'—')}</button></td>
        <td>${tableText(t.edo)}</td>
        <td>${fmtDate(t.fr)}</td>
        <td>${escapeHtml(t.hr||'—')}</td>
        <td class="rd-cell-wide">${tableText(t.asu)}</td>
        <td>${tableText(t.eqi)}</td>
        <td>${fmtDate(t.fl)}</td>
        <td>${escapeHtml(t.hl||'—')}</td>
        <td>${escapeHtml(fmtDuration(t.tll))}</td>
        <td>${fmtDate(t.fs)}</td>
        <td>${escapeHtml(t.hs||'—')}</td>
        <td>${tableText(t.eqf)}</td>
        <td class="rd-cell-wide">${tableText(t.cau)}</td>
        <td class="rd-cell-wide">${tableText(t.acc)}</td>
        <td>${tableText(t.res)}</td>
        <td class="rd-cell-wide">${tableText(t.caf)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="18" style="text-align:center;color:#667085;padding:20px">Sin tickets</td></tr>';
    tbody.querySelectorAll('[data-ticket]').forEach(btn=>btn.addEventListener('click',()=>{ hideDetail(); openTicket(btn.dataset.ticket); }));
    tbody.querySelectorAll('[data-proyecto]').forEach(btn=>btn.addEventListener('click',ev=>{ ev.stopPropagation(); openProyecto(btn.dataset.proyecto); }));
    tbody.querySelectorAll('[data-equipo]').forEach(btn=>btn.addEventListener('click',ev=>{ ev.stopPropagation(); openEquipo(btn.dataset.equipo); }));
  }
  function renderTable(){
    const search=nrm(byId('rd-search')&&byId('rd-search').value).toLowerCase();
    const et=nrm(byId('rd-filter-et')&&byId('rd-filter-et').value);
    tableFiltered=currentDayTickets.filter(t=>(!et||t.et===et)&&(!search||[
      t.n,t.pro,t.cod,t.edo,t.asu,t.eqi,t.eqf,t.cau,t.acc,t.res,t.caf
    ].join(' ').toLowerCase().includes(search))).sort((a,b)=>((b.fr||'')+(b.hr||'')).localeCompare((a.fr||'')+(a.hr||'')) || String(b.n||'').localeCompare(String(a.n||'')));
    const totalPages=Math.max(1,Math.ceil(tableFiltered.length/pageSize));
    if(page>=totalPages) page=totalPages-1;
    const slice=tableFiltered.slice(page*pageSize,page*pageSize+pageSize);
    const th=byId('rd-thead'), tb=byId('rd-tbody');
    if(th) th.innerHTML=ticketsContextualUniHead();
    if(tb) renderRows(slice,tb);
    txt('rd-count', tableFiltered.length+' tickets');
    txt('rd-page-info','Página '+(page+1)+' de '+totalPages+' · '+tableFiltered.length+' tickets');
    const p=byId('rd-page-prev'), n=byId('rd-page-next');
    if(p)p.disabled=page===0;
    if(n)n.disabled=page>=totalPages-1;
  }
  function ensureDetailModal(){
    let modal = byId('rd-detail-modal');
    if(modal) return modal;
    modal = document.createElement('section');
    modal.id = 'rd-detail-modal';
    modal.className = 'rd-detail-modal';
    modal.setAttribute('aria-label','Detalle de Resumen del día');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('role','dialog');
    modal.hidden = true;
    modal.innerHTML = `
      <div class="rd-detail-modal-panel">
        <div class="rd-detail-modal-head">
          <div>
            <h2 id="rd-detail-modal-title">Detalle</h2>
            <p id="rd-detail-modal-subtitle">Resumen del día</p>
          </div>
          <button class="rd-detail-modal-close" id="rd-detail-modal-close" type="button" aria-label="Cerrar detalle" title="Cerrar">×</button>
        </div>
        <div class="rd-detail-modal-body" id="rd-detail-modal-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(ev){ if(ev.target === modal) hideDetail(); });
    byId('rd-detail-modal-close')?.addEventListener('click', hideDetail);
    return modal;
  }
  function showDetail(title, rows){
    const modal = ensureDetailModal();
    const body = byId('rd-detail-modal-body');
    const titleEl = byId('rd-detail-modal-title');
    const subEl = byId('rd-detail-modal-subtitle');
    const safeTitle = title || 'Detalle';
    if(titleEl) titleEl.textContent = safeTitle;
    if(subEl) subEl.textContent = (rows && rows.length ? rows.length : 0) + ' registros encontrados';
    modal.dataset.activeDetail = safeTitle;
    modal.hidden = false;
    modal.classList.add('open');
    document.body.classList.add('rd-modal-open');
    if(!body) return;
    if(!rows.length){
      body.innerHTML = '<div class="rd-empty rd-detail-empty">Sin datos para ' + escapeHtml(safeTitle) + '</div>';
      return;
    }
    body.innerHTML = `<div class="rd-table-wrap rd-detail-table-wrap"><table class="rd-table rd-tickets-contextual-uni"><thead>${ticketsContextualUniHead()}</thead><tbody id="rd-detail-body"></tbody></table></div>`;
    renderRows(rows, byId('rd-detail-body'));
  }
  function hideDetail(){
    const modal = byId('rd-detail-modal');
    if(modal){
      modal.classList.remove('open');
      modal.hidden = true;
      modal.dataset.activeDetail = '';
      const body = byId('rd-detail-modal-body');
      if(body) body.innerHTML = '';
    }
    document.body.classList.remove('rd-modal-open');
    const box=byId('rd-detail');
    if(box){ box.className='rd-detail rd-card'; box.innerHTML=''; box.dataset.activeDetail=''; box.style.display='none'; }
  }
  function ticketField(label, value, cls){
    const safe = escapeHtml(value || '—');
    return `<div class="rd-ticket-field"><label>${escapeHtml(label)}</label><span class="${cls||''}">${safe}</span></div>`;
  }
  function ticketSection(title, fields){
    return `<section class="rd-ticket-section"><h3>${escapeHtml(title)}</h3><div class="rd-ticket-fields">${fields.join('')}</div></section>`;
  }
  function currentUser(){ return window.ManttoAuth && window.ManttoAuth.getUser ? (window.ManttoAuth.getUser() || {}) : {}; }
  function currentUserName(){ const u = currentUser(); return u.nombre || u.correo || 'Usuario'; }
  function canEditVobo(){
    const u = currentUser();
    const roles = Array.isArray(u.roles) ? u.roles : [];
    const rol = u.rol || u.role || '';
    const txtRoles = [rol].concat(roles).join(' ').toLowerCase();
    return !!(u.is_programador || txtRoles.includes('programador') || txtRoles.includes('director') || txtRoles.includes('superintendente') || txtRoles.includes('supervisor'));
  }
  function renderVoboSection(t){
    const estado = t.vobo_estado || 'Pendiente';
    const comentario = t.vobo_comentario || '';
    const validadoPor = t.vobo_por || t.vobo_guardado_por || '—';
    const validadoEn = t.vobo_en || t.vobo_guardado_en || t.actualizado_en || '—';
    const opts = ['Pendiente','Validado','Rechazado con observaciones','Requiere información adicional','Escalado a superior'];
    if(!canEditVobo()){
      return `<section class="rd-ticket-section"><h3>Validación / Vo.Bo.</h3><div class="rd-ticket-vobo-readonly">
        ${ticketField('Estado validación', estado)}
        <div class="rd-ticket-field rd-ticket-long"><label>Comentario validación</label><span>${escapeHtml(comentario || '—')}</span></div>
        ${ticketField('Validado por', validadoPor)}${ticketField('Fecha validación', validadoEn)}
      </div></section>`;
    }
    return `<section class="rd-ticket-section"><h3>Validación / Vo.Bo.</h3><div class="rd-ticket-vobo-area">
      <div class="rd-ticket-vobo-grid">
        <div class="rd-ticket-vobo-box"><label>Resultado de validación</label><select id="rd-vobo-estado">${opts.map(o=>`<option value="${escapeHtml(o)}" ${o===estado?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select></div>
        <div class="rd-ticket-vobo-box"><label>Comentarios</label><textarea id="rd-vobo-comentario" placeholder="Observaciones o motivo...">${escapeHtml(comentario)}</textarea></div>
      </div>
      <div class="rd-ticket-vobo-meta"><div><b>Validado por</b><span id="rd-vobo-por">${escapeHtml(validadoPor)}</span></div><div><b>Fecha validación</b><span id="rd-vobo-en">${escapeHtml(validadoEn)}</span></div></div>
      <div class="rd-ticket-vobo-actions"><button id="rd-vobo-save" type="button">Guardar Vo.Bo.</button></div>
    </div></section>`;
  }
  async function saveTicketVobo(t){
    const btn = byId('rd-vobo-save');
    const sel = byId('rd-vobo-estado');
    const cmt = byId('rd-vobo-comentario');
    if(!t || !t.n || !sel) return;
    const payload = { vobo_estado: sel.value || 'Pendiente', vobo_comentario: cmt ? cmt.value.trim() : '' };
    const oldText = btn ? btn.textContent : '';
    try{
      if(btn){ btn.disabled = true; btn.textContent = 'Guardando...'; }
      const path = '/api/tickets/' + encodeURIComponent(t.n) + '/vobo';
      const api = window.ManttoAuth && window.ManttoAuth.api ? window.ManttoAuth.api : null;
      if(api) await api(path, { method:'POST', body: JSON.stringify(payload) });
      else {
        const res = await fetch(apiUrl(path), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if(!res.ok) throw new Error('No fue posible guardar el Vo.Bo.');
      }
      t.vobo_estado = payload.vobo_estado;
      t.vobo_comentario = payload.vobo_comentario;
      t.vobo_por = currentUserName();
      t.vobo_en = new Date().toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'});
      const badges = byId('rd-ticket-badges');
      if(badges) badges.innerHTML = `<span class="rd-ticket-pill">${escapeHtml(t.et || 'Sin estado')}</span><span class="rd-ticket-pill">${escapeHtml(t.res || 'Sin responsabilidad')}</span><span class="rd-ticket-pill">${escapeHtml(t.vobo_estado || 'Pendiente')}</span>${t.xat ? '<span class="rd-ticket-pill">Fuera de SLA</span>' : ''}`;
      openTicket(t.n);
    }catch(err){
      alert((err && err.message) || 'No fue posible guardar el Vo.Bo.');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = oldText || 'Guardar Vo.Bo.'; }
    }
  }
  function closeTicketDetail(){
    const box = byId('rd-ticket-detail');
    if(box) box.hidden = true;
  }
  function renderTicketChat(t){
    txt('rd-ticket-chat-label', '#' + (t.n || '—'));
    const wrap = byId('rd-ticket-chat-msgs');
    if(!wrap) return;
    const comments = [];
    if(t.vobo_comentario){
      comments.push({ from:'Vo.Bo.', text:t.vobo_comentario, meta:t.vobo_estado || 'Comentario de validación' });
    }
    if(comments.length){
      wrap.innerHTML = comments.map(c => '<div class="rd-ticket-chat-msg"><div class="meta">' + escapeHtml(c.from + ' · ' + c.meta) + '</div>' + escapeHtml(c.text) + '</div>').join('');
    } else {
      wrap.innerHTML = '<div class="rd-ticket-chat-empty">Sin mensajes aún</div>';
    }
    const form = byId('rd-ticket-chat-form');
    const input = byId('rd-ticket-chat-input');
    if(form && form.dataset.bound !== '1'){
      form.dataset.bound = '1';
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        if(input) input.value = '';
        alert('El histórico de comentarios se mostrará aquí desde Aiven. La escritura de comentarios se activará cuando definamos la tabla/endpoint definitivo de chat para tickets.');
      });
    }
  }
  function openTicket(id){
    const ticketId = nrm(id);
    const t = allTickets.find(x => x.n === ticketId) || currentDayTickets.find(x => x.n === ticketId) || tableFiltered.find(x => x.n === ticketId);
    if(window.ManttoDetails && window.ManttoDetails.openTicket){
      window.ManttoDetails.openTicket(ticketId, t || null);
      return;
    }
    const box = byId('rd-ticket-detail');
    if(!box){
      if(window.ManttoRouter && window.ManttoRouter.openTarget) window.ManttoRouter.openTarget({module:'tickets',id:ticketId,source:'resumen-dia'});
      return;
    }
    if(!t){
      box.hidden = false;
      txt('rd-ticket-title','Ticket no encontrado');
      txt('rd-ticket-subtitle','No se encontró el ticket en los datos cargados desde Aiven');
      const badges = byId('rd-ticket-badges'); if(badges) badges.innerHTML = '';
      const main = byId('rd-ticket-main'); if(main) main.innerHTML = '<div class="rd-ticket-empty">No fue posible abrir el detalle porque el registro no está en la carga actual.</div>';
      return;
    }
    box.hidden = false;
    txt('rd-ticket-title','Ticket ' + (t.n || '—'));
    txt('rd-ticket-subtitle', [formatProyectoName(t.pro),t.cod,t.zon].filter(Boolean).join(' · ') || 'Detalle desde Resumen del día');
    const badges = byId('rd-ticket-badges');
    if(badges){
      badges.innerHTML = `<span class="rd-ticket-pill">${escapeHtml(t.et || 'Sin estado')}</span><span class="rd-ticket-pill">${escapeHtml(t.res || 'Sin responsabilidad')}</span>${t.xat ? '<span class="rd-ticket-pill">Fuera de SLA</span>' : ''}`;
    }
    const main = byId('rd-ticket-main');
    if(main){
      main.innerHTML = [
        ticketSection('Datos generales', [
          ticketField('Ticket', t.n, 'hi'), ticketField('Estado ticket', t.et, t.et === 'Abierto' ? 'warn' : ''), ticketField('Proyecto', formatProyectoName(t.pro), 'hi'), ticketField('Equipo', t.cod, 'hi'),
          ticketField('Referencia en zona operativa', t.ref), ticketField('Zona', t.zon), ticketField('Ciudad', t.ciu), ticketField('Estado', t.edo), ticketField('Ejecutivo Call Center', t.ejecutivo_call)
        ]),
        ticketSection('Reporte y atención', [
          ticketField('Fecha reporte', t.fr), ticketField('Hora reporte', t.hr), ticketField('Fecha llegada', t.fl), ticketField('Hora llegada', t.hl),
          ticketField('Fecha cierre', t.fs), ticketField('Hora solución', t.hs), ticketField('Técnico', t.tec), ticketField('Supervisor', t.sup), ticketField('Persona que atiende', t.persona_atiende), ticketField('BLT empleado cierre', t.blt_empleado)
        ]),
        ticketSection('Diagnóstico', [
          ticketField('Estatus equipo inicial', t.eqi), ticketField('Estatus equipo final', t.eqf, String(t.eqf||'').toLowerCase()==='no funcionando'?'warn':''), ticketField('Responsabilidad', t.res, t.res==='BLT'?'warn':''), ticketField('Causa falla', t.caf),
          `<div class="rd-ticket-field rd-ticket-long"><label>Descripción</label><span>${escapeHtml(t.asu || '—')}</span></div>`,
          `<div class="rd-ticket-field rd-ticket-long"><label>Causa</label><span>${escapeHtml(t.cau || '—')}</span></div>`,
          `<div class="rd-ticket-field rd-ticket-long"><label>Acción en cierre</label><span>${escapeHtml(t.acc || '—')}</span></div>`
        ]),
        ticketSection('Tiempos y clasificación', [
          ticketField('Tiempo llegada', fmtDuration(t.tll), t.tll != null ? 'hi' : ''),
          ticketField('Tiempo solución', fmtDuration(t.tso), t.tso != null ? 'hi' : ''),
          ticketField('Tipo equipo', t.prd),
          ticketField('Prioridad', t.pri),
          ticketField('SLA / excede', t.xat || '—', t.xat ? 'warn' : ''),
          ticketField('Fecha/Hora reporte', [t.fr,t.hr].filter(Boolean).join(' ')),
          ticketField('Fecha/Hora llegada', [t.fl,t.hl].filter(Boolean).join(' ')),
          ticketField('Fecha/Hora solución', [t.fs,t.hs].filter(Boolean).join(' '))
        ]),
        renderVoboSection(t)
      ].join('');
    }
    renderTicketChat(t);
    const voboSave = byId('rd-vobo-save'); if(voboSave) voboSave.onclick = () => saveTicketVobo(t);
    const close = byId('rd-ticket-close'); if(close && close.dataset.bound !== '1'){ close.dataset.bound = '1'; close.addEventListener('click', closeTicketDetail); }
    const goTicket = byId('rd-ticket-go-ticket'); if(goTicket) goTicket.onclick = () => window.ManttoRouter && window.ManttoRouter.openTarget({module:'tickets',id:t.n,source:'resumen-dia'});
    const goEquipo = byId('rd-ticket-go-equipo'); if(goEquipo){ goEquipo.disabled = !t.cod; goEquipo.onclick = () => openEquipo(t.cod); }
    const goProyecto = byId('rd-ticket-go-proyecto'); if(goProyecto){ goProyecto.disabled = !t.pro; goProyecto.onclick = () => openProyecto(t.pro); }
  }
  function ensureResumenVisualFixes(){
    const view = byId('view-resumen');
    if(!view) return;

    const criticalIcon = view.querySelector('[data-rd-detail="criticos"] .ico');
    if(criticalIcon){
      criticalIcon.removeAttribute('data-estado-visual');
      criticalIcon.setAttribute('aria-label','Críticos');
      criticalIcon.textContent = '💥';
    }

    let note = byId('rd-ticket-emoji-note');
    if(!note){
      note = view.querySelector('[role="note"][aria-label="Nota informativa de emojis"]');
      if(note) note.id = 'rd-ticket-emoji-note';
    }
    if(!note){
      const tableWrap = view.querySelector('.rd-table-wrap');
      if(tableWrap){
        note = document.createElement('div');
        note.id = 'rd-ticket-emoji-note';
        note.className = 'rd-ticket-emoji-note';
        note.setAttribute('role','note');
        note.setAttribute('aria-label','Nota informativa de emojis');
        note.innerHTML = '<strong>Leyenda:</strong><span>🚨 Atrapado</span><span>💧 Filtración</span><span>⚡ Voltaje</span><span>🚧 No funcionando</span><span>⌛ Fuera de SLA</span><span>💥 Equipo crítico</span>';
        tableWrap.parentNode.insertBefore(note, tableWrap);
      }
    }
  }

  function bind(){ document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') hideDetail(); }); byId('rd-prev-day')?.addEventListener('click',()=>{ if(currentDayIdx<dates.length-1){ currentDayIdx++; render(); }}); byId('rd-next-day')?.addEventListener('click',()=>{ if(currentDayIdx>0){ currentDayIdx--; render(); }}); byId('rd-refresh')?.addEventListener('click',load); byId('rd-search')?.addEventListener('input',()=>{page=0;renderTable();}); byId('rd-filter-et')?.addEventListener('change',()=>{page=0;renderTable();}); byId('rd-page-prev')?.addEventListener('click',()=>{ if(page>0){page--;renderTable();} }); byId('rd-page-next')?.addEventListener('click',()=>{page++;renderTable();}); document.querySelectorAll('[data-rd-detail]').forEach(el=>el.addEventListener('click',()=>{ const key=el.dataset.rdDetail; const rows=(window.ManttoResumenDia._detailData||{})[key]||[]; showDetail(el.querySelector('.lbl')?.textContent || key, rows); })); }
  async function load(){ ensureResumenVisualFixes(); if(window.EstadosVisuales_gnral) await window.EstadosVisuales_gnral.load(); const [tickets, portafolio] = await Promise.all([fetchTickets(), fetchPortafolio(), fetchCriticidadUsuario()]); allTickets = tickets; portafolioItems = portafolio; initData(); render(); if(window.EstadosVisuales_gnral) window.EstadosVisuales_gnral.apply(byId('view-resumen')); ensureResumenVisualFixes(); }
  function init(){ if(!byId('view-resumen')) return; ensureResumenVisualFixes(); if(byId('rd-refresh')?.dataset.bound==='1') return; if(byId('rd-refresh')) byId('rd-refresh').dataset.bound='1'; bind(); load(); }
  window.ManttoResumenDia = { init, load, openTicket, _detailData:{} };
})();
