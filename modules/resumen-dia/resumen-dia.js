(function(){
  const COLORS = ['#1B4FD8','#16A34A','#D97706','#DC2626','#0891B2','#7C3AED','#64748B','#E87722'];
  const ATRAP_KW = ['atrapado','atrapada','encerrado','encerrada','persona atrapada','personas atrapadas','rescate'];
  const AGUA_KW = ['agua','filtracion','filtración','inundacion','inundación','goteras','humedad'];
  const VOLTAJE_KW = ['voltaje','variacion de voltaje','variación de voltaje','sobre voltaje','bajo voltaje','pico de voltaje','falla electrica','falla eléctrica','corte de luz','falla de energia','falla de energía','sin energia','sin energía','apagon','apagón'];
  let allTickets = [], portafolioItems = [], dates = [], currentDayIdx = 0, currentDayTickets = [], tableFiltered = [], page = 0;
  let criticalEquipmentCodes = new Set();
  let criticalCriteria = { fallas: 3, periodo: 35 };
  let criticalListenerBound = false;
  let selectedDay='', operationalToday='', filtersRd={estado:'',zona:'',supervisor:''}, filterCatalog=null, averagesRd=null;
  let offlineMode=false, dataReady=false, loadingRd=false, requestRevision=0, requestController=null;
  let recentAvailableRd=false, recentActiveRd=false;
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
    return raw || 'Sin estado';
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
      et: estadoTicket({estado_ticket:pick(row,['estado_ticket','Estado_Ticket'])}),
      edo: nrm(pick(row,['estado','Estado','edo'])), ciu: nrm(pick(row,['ciudad','Ciudad','ciu'])), pro: nrm(pick(row,['proyecto','Proyecto','pro'])),
      cod: nrm(pick(row,['codigo_equipo','Codigo_Equipo','equipo','cod'])), ref: nrm(pick(row,['referencia_en_zona_operativa','Referencia_en_Zona_Operativa','identificacion_sitio','Identificacion_en_Sitio','ref'])),
      // FASE 1/11: zona oficial desde z_op a traves de portafolio.zona_id.
      // tickets.zona queda solo como dato historico de origen y no gobierna la UI.
      zon: nrm(row.zona_oficial), asu: nrm(pick(row,['descripcion','asunto_ticket','Asunto','asu'])),
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
      // FASE 1/11: no mostrar zona_operativa como autoridad territorial.
      zon: nrm(row.zona_oficial),
      ref: nrm(row.identificacion_sitio || row.referencia_en_zona_operativa || row.ref),
      inactivo: nrm(row.inactivo).toLowerCase(),
      estatus: nrm(row.estatus_servicio || row.estatus || row.estado_servicio),
      estadoRegistro: row.estado_registro, estado:nrm(row.estado), supervisor:nrm(row.supervisor_zona)
    };
  }
  function isActiveEquipo(pf){
    if(!pf) return false;
    const inactive = ['1','si','sí','true','inactivo','x'].includes(String(pf.inactivo||'').toLowerCase());
    const estadoReg = pf.estadoRegistro == null ? true : String(pf.estadoRegistro) !== '0';
    return !inactive && estadoReg;
  }
  async function fetchResumenInicial(){
    const params=new URLSearchParams({vista:'ejecutiva',criticos_periodo:String(criticalCriteria.periodo||35),min_fallas:String(criticalCriteria.fallas||3)});
    if(selectedDay) params.set('fecha',selectedDay);
    for(const key of ['estado','zona','supervisor'])if(filtersRd[key])params.set(key,filtersRd[key]);
    if(recentActiveRd && canUseRecentRd())params.set('entregas_recientes','1');
    // El puente Offline conserva la misma ruta e ignora los parámetros.
    const response = await fetch(apiUrl('/api/operacion/resumen-dia/inicial?'+params.toString()), {
      cache:'no-store', signal:requestController?.signal,
      headers:Object.assign({'Accept':'application/json'}, window.ManttoAuth ? window.ManttoAuth.authHeaders() : {})
    });
    if(!response.ok) throw new Error('HTTP '+response.status);
    const payload = await response.json();
    if(!payload || payload.ok!==true)throw new Error('Respuesta no válida.');
    const data = payload.data || {};
    const isLocal=payload.offline===true&&payload.source==='indexeddb';
    if(!isLocal && (payload.mode!=='RESUMEN_DIA_EJECUTIVO_V001' || !payload.period?.today ||
       !payload.filters?.disponibilidad || !payload.promedios || !Array.isArray(data.criticos_codigos)))
      throw new Error('La API aún no devuelve el Resumen ejecutivo. Actualiza nuevamente.');
    if(!Array.isArray(data.tickets)||(isLocal&&!Array.isArray(data.portafolio)))
      throw new Error('Respuesta incompleta.');
    const recent=payload.entregas_recientes;
    const recentAvailable=!isLocal&&recent?.disponible===true&&recent?.meses===12&&isOwnDirectorSessionRd();
    const recentActive=recentAvailable&&recent?.activa===true;
    // Nunca mostrar la vista general bajo una selección de recientes.
    if(!isLocal && recentActive!==params.has('entregas_recientes'))
      throw new Error('La API no confirmó el filtro de Entregas Recientes. Actualiza nuevamente.');
    return {
      tickets:data.tickets.map(mapTicket).filter(t=>t.n&&t.fr),
      portafolio:(Array.isArray(data.portafolio)?data.portafolio:[]).map(mapPortafolio).filter(p=>p.cod||p.pro),
      criticalCodes:isLocal?null:new Set(data.criticos_codigos.map(nrm).filter(Boolean)),
      criticidad:data.criticidad||null, offline:isLocal, period:payload.period||null,
      filters:payload.filters||null, averages:payload.promedios||null, recentAvailable,recentActive
    };
  }
  function syncCriticalCriteriaFromSession(){
    const user=window.ManttoAuth&&typeof window.ManttoAuth.getUser==='function'?window.ManttoAuth.getUser():null;
    const fallas=parseInt(user&&user.criticos_fallas,10);
    const periodo=parseInt(user&&user.criticos_periodo,10);
    criticalCriteria={
      fallas:Number.isFinite(fallas)&&fallas>0?fallas:3,
      periodo:Number.isFinite(periodo)&&periodo>0?periodo:35
    };
  }
  async function onCriticalPreferencesUpdated(event){
    const detail=event&&event.detail?event.detail:{};
    const fallas=parseInt(detail.criticos_fallas,10);
    const periodo=parseInt(detail.criticos_periodo,10);
    if(Number.isFinite(fallas)&&fallas>0) criticalCriteria.fallas=fallas;
    if(Number.isFinite(periodo)&&periodo>0) criticalCriteria.periodo=periodo;
    await load();
  }
  function pfByCod(cod){ return portafolioItems.find(p=>p.cod===cod); }
  function openEquipo(cod){
    if(!cod) return;
    if(window.ManttoDetails && window.ManttoDetails.openEquipo) return window.ManttoDetails.openEquipo(cod);
    if(window.ManttoRouter && window.ManttoRouter.openTarget) window.ManttoRouter.openTarget({module:'detalle', type:'equipo', id:cod, source:'resumen-dia'});
  }
  function openProyecto(pro){
    if(!pro) return;
    if(window.ManttoDetails && window.ManttoDetails.openProyecto) return window.ManttoDetails.openProyecto(pro);
    if(window.ManttoRouter && window.ManttoRouter.openTarget) window.ManttoRouter.openTarget({module:'detalle', type:'proyecto', id:pro, source:'resumen-dia'});
  }
  function formatProyectoName(value){
    if(window.ManttoFormat && typeof window.ManttoFormat.projectName === 'function') return window.ManttoFormat.projectName(value);
    const raw=String(value || '').trim();
    const m=raw.match(/^(\d+)-(\d{2})-(\d{2})(?:T.*)?$/);
    if(!m) return raw || '—';
    const meses={'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    const numero=String(Number(m[1]) || m[1].replace(/^0+/, '') || m[1]);
    const dia=String(Number(m[3]) || m[3]);
    return dia + ' de ' + (meses[m[2]] || m[2]) + ' #' + numero;
  }
  function setStatus(type,msg){ const el=byId('rd-api-status'); if(!el) return; el.className='rd-status '+type; el.textContent=msg; }
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
  // Acciones existentes del catálogo DGB. No se crean permisos nuevos.
  const RD_PERMISSION_PREFIX='OPERACION_RESUMEN_DEL_DIA_';
  const RD_PERIOD='TICKET_PERIODO_TICKETS_DEL_PERIODO';
  function offlineAllowedRd(){
    return offlineMode&&window.ManttoOfflineResumenDia?.routeAllowed?.()===true;
  }
  function canRd(code){
    return offlineMode?offlineAllowedRd():window.ManttoPermissions?.state?.(RD_PERMISSION_PREFIX+code)?.efectivo===true;
  }
  function canRdAny(codes){return String(codes||'').split('|').some(code=>code&&canRd(code));}
  function canFilterRd(){return canRdAny(RD_PERIOD+'.FILTRAR|GRAFICAS_ESTADO_TICKETS.FILTRAR');}
  function canLinkRd(type){return canRd(RD_PERIOD+'.VER_'+type.toUpperCase());}
  function isOwnDirectorSessionRd(){
    const auth=window.ManttoAuth;
    const actor=auth?.getActorUser?.(), effective=auth?.getUser?.();
    const id=Number(actor?.id_SB);
    if(!auth||auth.isViewingAs?.()!==false||!Number.isSafeInteger(id)||id<=0||Number(effective?.id_SB)!==id)return false;
    return new Set([actor.rol,...(Array.isArray(actor.roles)?actor.roles:[])]).has('Director General');
  }
  function canUseRecentRd(){
    return recentAvailableRd&&!offlineMode&&window.ManttoOfflineNavigation?.isOffline?.()!==true&&isOwnDirectorSessionRd();
  }
  function renderRecentControlRd(){
    const host=byId('rd-recent-control'),check=byId('rd-recent-check');
    if(!host||!check)return;
    const allowed=canUseRecentRd();
    host.hidden=!allowed;
    check.checked=allowed&&recentActiveRd;
    check.disabled=!allowed||!dataReady||loadingRd;
  }
  function applyExecutivePermissions(){
    const view=byId('view-resumen');
    if(!view)return;
    view.querySelectorAll('[data-rd-view-perm]').forEach(el=>{el.hidden=!canRdAny(el.dataset.rdViewPerm);});
    view.querySelectorAll('[data-rd-action-perm]').forEach(el=>{
      el.disabled=!canRdAny(el.dataset.rdActionPerm)||!dataReady||loadingRd||
        (offlineMode&&el.dataset.rdDetail==='criticos');
    });
    const filters=byId('rd-filter-card');if(filters)filters.hidden=!canFilterRd();
    const search=byId('rd-search'),status=byId('rd-filter-et');
    if(search)search.hidden=!canRd(RD_PERIOD+'.BUSCAR');
    if(status)status.hidden=!canRd(RD_PERIOD+'.FILTRAR');
    renderRecentControlRd();
  }
  function todayKeyRd(){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const values=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return values.year+'-'+values.month+'-'+values.day;
  }
  function shiftDayRd(key,delta){
    const d=new Date(key+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);
  }
  function filterKeyRd(v){return nrm(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function ticketMatchesRd(t){
    return [['estado','edo'],['zona','zon'],['supervisor','sup']].every(([key,field])=>!filtersRd[key]||filterKeyRd(t[field])===filterKeyRd(filtersRd[key]));
  }
  function prepareOfflineRd(){
    const byCode=new Map(portafolioItems.filter(p=>p.cod&&String(p.estadoRegistro)==='1').map(p=>[p.cod,p]));
    for(const ticket of allTickets){
      const p=byCode.get(ticket.cod);
      ticket.sup=p&&p.zon&&ticket.zon&&filterKeyRd(p.zon)===filterKeyRd(ticket.zon)?p.supervisor:'';
    }
    dates=[...new Set(allTickets.map(t=>t.fr))].sort().reverse();
    if(!dates.includes(selectedDay))selectedDay=dates[0]||todayKeyRd();
    currentDayIdx=Math.max(0,dates.indexOf(selectedDay));
  }
  function offlineCatalogRd(dayRows){
    const result={disponibilidad:{}};
    const fields=[['estados','estado','edo'],['zonas','zon','zon'],['supervisores','supervisor','sup']];
    for(const [key,pfField,ticketField] of fields){
      const values=new Map(),enabled=new Set();
      const add=v=>{if(filterKeyRd(v)&&!values.has(filterKeyRd(v)))values.set(filterKeyRd(v),nrm(v));};
      portafolioItems.filter(p=>String(p.estadoRegistro)==='1').forEach(p=>add(p[pfField]));
      dayRows.forEach(t=>{add(t[ticketField]);if(filterKeyRd(t[ticketField]))enabled.add(filterKeyRd(t[ticketField]));});
      result[key]=[...values.values()].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
      result.disponibilidad[key]=result[key].filter(v=>enabled.has(filterKeyRd(v)));
    }
    return result;
  }
  function offlineAveragesRd(day){
    const period=start=>{
      const dias=Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
      const tickets=allTickets.filter(t=>t.fr>=start&&t.fr<day&&ticketMatchesRd(t)).length;
      return {dias,tickets,promedio:dias>0?Math.round(tickets/dias*100)/100:null};
    };
    return {mes:period(day.slice(0,7)+'-01'),anio:period(day.slice(0,4)+'-01-01')};
  }
  function renderFiltersRd(){
    const data=filterCatalog||{disponibilidad:{}};
    for(const [key,field] of [['estado','estados'],['zona','zonas'],['supervisor','supervisores']]){
      const host=byId('rd-filter-'+key);if(!host)continue;
      const values=[...(Array.isArray(data[field])?data[field]:[])];
      if(filtersRd[key]&&!values.includes(filtersRd[key]))values.push(filtersRd[key]);
      const enabled=new Set(data.disponibilidad?.[field]||[]);
      host.replaceChildren();
      for(const value of ['',...values]){
        const button=document.createElement('button');
        button.type='button';button.className='rd-ex-chip'+(value===filtersRd[key]?' active':'');
        button.textContent=value||(key==='zona'?'Todas':'Todos');
        button.setAttribute('aria-pressed',String(value===filtersRd[key]));
        button.disabled=!canFilterRd()||(value!==''&&!enabled.has(value));
        if(value&&!enabled.has(value))button.title='Sin tickets en el día seleccionado';
        button.addEventListener('click',()=>{
          if(button.disabled)return;
          filtersRd[key]=value;page=0;hideDetail();
          if(offlineMode&&dataReady)render();else load();
        });
        host.appendChild(button);
      }
    }
  }
  function renderAverageRd(key,period,total){
    const valid=period?.promedio!=null&&Number.isFinite(Number(period.promedio));
    const format=n=>Number(n).toLocaleString('es-MX',{maximumFractionDigits:2});
    txt('rd-promedio-'+key,valid?format(period.promedio)+' / día':'—');
    const delta=valid?Math.round((total-Number(period.promedio))*100)/100:null;
    txt('rd-delta-'+key,valid?(delta>0?'+':'')+format(delta)+' vs. promedio':period?.dias===0?'Sin días completos':'');
  }
  function renderDatesRd(){
    const key=selectedDay||operationalToday||todayKeyRd();
    txt('rd-day-label',formatDay(key));
    txt('rd-day-sub',offlineMode?'Fecha de la copia local':'Fecha operativa · Ciudad de México');
    const input=byId('rd-date-input');
    if(input){input.value=key;input.max=operationalToday||todayKeyRd();input.disabled=offlineMode||loadingRd;}
    const prev=byId('rd-prev-day'),next=byId('rd-next-day');
    if(prev)prev.disabled=loadingRd||(offlineMode&&currentDayIdx>=dates.length-1);
    if(next)next.disabled=loadingRd||(offlineMode?currentDayIdx<=0:key>=(operationalToday||todayKeyRd()));
    const refresh=byId('rd-refresh');if(refresh)refresh.disabled=loadingRd;
  }
  function renderEmptyState(){
    currentDayTickets=[];tableFiltered=[];window.ManttoResumenDia._detailData={};
    ['rd-total','rd-cerrados','rd-encurso','rd-abiertos','rd-atrap','rd-agua','rd-voltaje','rd-criticos-dia','rd-nofunc','rd-sla','rd-cerrados-pct','rd-encurso-pct','rd-abiertos-pct','rd-promedio-mes','rd-promedio-anio','rd-delta-mes','rd-delta-anio','rd-count','rd-page-info'].forEach(id=>txt(id,'—'));
    ['abiertos','encurso','cerrados'].forEach(key=>{const bar=byId('rd-bar-'+key);if(bar)bar.style.width='0%';});
    const th=byId('rd-thead'),tb=byId('rd-tbody');if(th)th.innerHTML=ticketsContextualUniHead();
    if(tb)tb.innerHTML='<tr><td colspan="18" class="rd-empty">Sin datos disponibles para mostrar.</td></tr>';
    const p=byId('rd-page-prev'),n=byId('rd-page-next');if(p)p.disabled=true;if(n)n.disabled=true;
    hideDetail();renderDatesRd();renderFiltersRd();applyExecutivePermissions();
  }

  function render(){
    if(!dataReady){renderEmptyState();return;}
    if(offlineMode&&!offlineAllowedRd()){clearContextRd();setStatus('error','Respaldo Offline no autorizado o vencido.');return;}
    if(offlineMode){
      const dayRows=allTickets.filter(t=>t.fr===selectedDay);
      filterCatalog=offlineCatalogRd(dayRows);
      currentDayTickets=dayRows.filter(ticketMatchesRd);
      averagesRd=offlineAveragesRd(selectedDay);
    }else currentDayTickets=allTickets;
    const tks=currentDayTickets,total=tks.length,crit=critSet();
    const data={
      todos:tks,
      abiertos:tks.filter(t=>t.et==='Abierto'),
      encurso:tks.filter(t=>t.et==='En curso'),
      cerrados:tks.filter(t=>t.et==='Cerrado'),
      atrap:tks.filter(t=>hasTxt(t,ATRAP_KW)),
      agua:tks.filter(t=>hasTxt(t,AGUA_KW)),
      voltaje:tks.filter(t=>hasTxt(t,VOLTAJE_KW)),
      criticos:offlineMode?[]:tks.filter(t=>crit.has(t.cod)),
      nofunc:tks.filter(t=>String(t.eqf||'').toLowerCase()==='no funcionando'),
      sla:tks.filter(t=>t.xat)
    };
    window.ManttoResumenDia._detailData=data;
    txt('rd-total',total);
    for(const key of ['abiertos','encurso','cerrados']){
      txt('rd-'+key,data[key].length);txt('rd-'+key+'-pct',total?pct(data[key].length,total):'0%');
      const bar=byId('rd-bar-'+key);if(bar)bar.style.width=(total?data[key].length/total*100:0)+'%';
    }
    for(const key of ['atrap','agua','voltaje','nofunc','sla'])txt('rd-'+key,data[key].length);
    txt('rd-criticos-dia',offlineMode?'—':new Set(data.criticos.map(t=>t.cod).filter(Boolean)).size);
    renderAverageRd('mes',averagesRd?.mes,total);renderAverageRd('anio',averagesRd?.anio,total);
    renderDatesRd();renderFiltersRd();applyExecutivePermissions();page=0;renderTable();hideDetail();
  }

  function badge(et){ const cls=et==='Cerrado'?'cerrado':et==='En curso'?'curso':'abierto'; return `<span class="rd-badge ${cls}">${et||'—'}</span>`; }

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
    for(const [type,open] of [['ticket',openTicket],['proyecto',openProyecto],['equipo',openEquipo]]){
      tbody.querySelectorAll('[data-'+type+']').forEach(btn=>{
        btn.disabled=!canLinkRd(type)||!btn.dataset[type];
        btn.addEventListener('click',ev=>{
          if(btn.disabled||!canLinkRd(type))return;
          ev.stopPropagation();hideDetail();open(btn.dataset[type]);
        });
      });
    }
  }
  function renderTable(){
    if(!dataReady)return;
    if(!canRd(RD_PERIOD+'.VER')){
      const body=byId('rd-tbody');if(body)body.innerHTML='';
      tableFiltered=[];txt('rd-count','—');txt('rd-page-info','—');
      return;
    }
    const search=canRd(RD_PERIOD+'.BUSCAR')?nrm(byId('rd-search')&&byId('rd-search').value).toLowerCase():'';
    const et=canRd(RD_PERIOD+'.FILTRAR')?nrm(byId('rd-filter-et')&&byId('rd-filter-et').value):'';
    tableFiltered=currentDayTickets.filter(t=>(!et||t.et===et)&&(!search||[
      t.n,t.pro,t.cod,t.edo,t.zon,t.sup,t.asu,t.eqi,t.eqf,t.cau,t.acc,t.res,t.caf
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
  function humanDateTime(value){
    const fallback=String(value==null||value===''?'—':value);
    return window.ManttoHumanTime&&typeof window.ManttoHumanTime.formatDateTime==='function'
      ? window.ManttoHumanTime.formatDateTime(value,{fallback})
      : fallback;
  }
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
    const validadoEn = humanDateTime(t.vobo_en || t.vobo_guardado_en || t.actualizado_en);
    const opts = ['Pendiente','Validado','Rechazado'];
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
      t.vobo_en = new Date().toISOString();
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
      if(window.ManttoRouter && window.ManttoRouter.openTarget) window.ManttoRouter.openTarget({module:'detalle',type:'ticket',id:ticketId,source:'resumen-dia'});
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
    const goTicket = byId('rd-ticket-go-ticket'); if(goTicket) goTicket.onclick = () => openTicket(t.n);
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

  function changeDayRd(delta){
    if(loadingRd)return;
    if(offlineMode){
      const next=currentDayIdx-delta;
      if(next<0||next>=dates.length)return;
      currentDayIdx=next;selectedDay=dates[next];render();return;
    }
    const key=shiftDayRd(selectedDay||operationalToday||todayKeyRd(),delta);
    if(key>(operationalToday||todayKeyRd()))return;
    selectedDay=key;load();
  }
  function bind(){
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape')hideDetail();});
    if(!criticalListenerBound){document.addEventListener('mantto:criticos-preferencias-updated',onCriticalPreferencesUpdated);criticalListenerBound=true;}
    byId('rd-prev-day')?.addEventListener('click',()=>changeDayRd(-1));
    byId('rd-next-day')?.addEventListener('click',()=>changeDayRd(1));
    byId('rd-date-input')?.addEventListener('change',ev=>{
      if(offlineMode||loadingRd||!ev.target.value||ev.target.value>(operationalToday||todayKeyRd())){renderDatesRd();return;}
      selectedDay=ev.target.value;load();
    });
    byId('rd-refresh')?.addEventListener('click',load);
    byId('rd-recent-check')?.addEventListener('change',ev=>{
      if(!canUseRecentRd()||!dataReady||loadingRd){renderRecentControlRd();return;}
      recentActiveRd=ev.target.checked===true;
      page=0;hideDetail();load();
    });
    byId('rd-search')?.addEventListener('input',()=>{page=0;renderTable();});
    byId('rd-filter-et')?.addEventListener('change',()=>{page=0;renderTable();});
    byId('rd-page-prev')?.addEventListener('click',()=>{if(page>0){page--;renderTable();}});
    byId('rd-page-next')?.addEventListener('click',()=>{page++;renderTable();});
    byId('view-resumen').querySelectorAll('[data-rd-detail]').forEach(el=>el.addEventListener('click',()=>{
      if(!dataReady||loadingRd||el.disabled||el.hidden||
         (el.dataset.rdViewPerm&&!canRdAny(el.dataset.rdViewPerm))||!canRdAny(el.dataset.rdActionPerm)||
         (offlineMode&&el.dataset.rdDetail==='criticos'))return;
      const key=el.dataset.rdDetail,rows=(window.ManttoResumenDia._detailData||{})[key]||[];
      showDetail(el.dataset.rdTitle||key,rows);
    }));
  }
  function clearContextRd(){
    requestRevision++;requestController?.abort();requestController=null;
    dataReady=false;loadingRd=false;offlineMode=false;selectedDay='';operationalToday='';
    recentAvailableRd=false;recentActiveRd=false;
    filtersRd={estado:'',zona:'',supervisor:''};filterCatalog=null;averagesRd=null;
    allTickets=[];portafolioItems=[];dates=[];currentDayIdx=0;criticalEquipmentCodes=new Set();
    if(byId('rd-search'))byId('rd-search').value='';
    if(byId('rd-filter-et'))byId('rd-filter-et').value='';
    if(byId('view-resumen')){renderEmptyState();setStatus('loading','Sin datos cargados');}
  }
  async function load(){
    if(!byId('view-resumen'))return;
    requestController?.abort();
    requestController=typeof AbortController==='function'?new AbortController():null;
    const revision=++requestRevision;
    loadingRd=true;dataReady=false;hideDetail();
    // La copia no autoriza una sesión en línea después de recuperar la conexión.
    if(window.ManttoOfflineNavigation?.isOffline?.()!==true){
      offlineMode=false;
      if(selectedDay&&selectedDay===operationalToday&&todayKeyRd()>operationalToday)selectedDay='';
    }
    if(!canUseRecentRd()){recentActiveRd=false;recentAvailableRd=false;}
    if(!offlineMode&&!canFilterRd())filtersRd={estado:'',zona:'',supervisor:''};
    renderEmptyState();setStatus('loading','Cargando resumen...');
    try{
      syncCriticalCriteriaFromSession();
      const initial = await fetchResumenInicial();
      if(revision!==requestRevision)return;
      allTickets=initial.tickets;portafolioItems=initial.portafolio;
      offlineMode=initial.offline;
      recentAvailableRd=initial.recentAvailable;recentActiveRd=initial.recentActive;
      operationalToday=initial.period?.operational_today||todayKeyRd();
      if(offlineMode)prepareOfflineRd();
      else{
        selectedDay=initial.period.today;
        filterCatalog=initial.filters;averagesRd=initial.averages;
      }
      const crit=initial.criticidad||{};
      criticalCriteria={fallas:Number(crit.min_fallas_blt)||criticalCriteria.fallas,periodo:Number(crit.dias)||criticalCriteria.periodo};
      criticalEquipmentCodes=initial.criticalCodes||new Set();
      if(!offlineMode&&window.EstadosVisuales_gnral)await window.EstadosVisuales_gnral.load();
      if(revision!==requestRevision)return;
      loadingRd=false;dataReady=true;
      setStatus('ok',offlineMode?'Copia local verificada · Vista general':recentActiveRd?'Aiven · Entregas recientes (12 meses)':'Aiven · datos del periodo');
      render();if(!offlineMode&&window.EstadosVisuales_gnral)window.EstadosVisuales_gnral.apply(byId('view-resumen'));
      ensureResumenVisualFixes();
    }catch(error){
      if(revision!==requestRevision||error?.name==='AbortError')return;
      loadingRd=false;dataReady=false;offlineMode=false;recentAvailableRd=false;recentActiveRd=false;allTickets=[];portafolioItems=[];filterCatalog=null;averagesRd=null;criticalEquipmentCodes=new Set();
      renderEmptyState();setStatus('error','Resumen no disponible: '+String(error?.message||'Error de consulta').slice(0,200));
    }finally{if(revision===requestRevision){loadingRd=false;renderDatesRd();applyExecutivePermissions();}}
  }
  function init(){
    if(!byId('view-resumen'))return;
    ensureResumenVisualFixes();
    const refresh=byId('rd-refresh');
    if(refresh&&refresh.dataset.bound!=='1'){refresh.dataset.bound='1';bind();}
    if(!dataReady&&!loadingRd)return load();
  }
  document.addEventListener('mantto:view-user-changed',clearContextRd);
  document.addEventListener('mantto:logout',clearContextRd);
  document.addEventListener('mantto:auth-ready',clearContextRd);
  document.addEventListener('mantto:permissions-updated',()=>{
    if(window.ManttoOfflineNavigation?.isOffline?.()===true)return;
    clearContextRd();
    if(window.ManttoRouter?.getCurrent?.().route==='resumen'&&window.ManttoPermissions?.canNavigate?.('resumen')===true)init();
  });
  window.ManttoResumenDia = { init, load, openTicket, _detailData:{} };
})();
