(function(){
  const FALLBACKS = {
    CRITICO:{codigo:'CRITICO',nombre:'Equipo crítico',emoji:'💥',icono:'ti ti-alert-triangle',prioridad:1},
    CRITICO_PERIODO:{codigo:'CRITICO_PERIODO',nombre:'Equipo crítico período',emoji:'‼️',icono:'ti ti-alert-circle',prioridad:1.1},
    CRITICO_ANIO:{codigo:'CRITICO_ANIO',nombre:'Equipo crítico año actual',emoji:'💥',icono:'ti ti-alert-triangle',prioridad:1.2},
    NO_FUNCIONANDO_PROYECTO:{codigo:'NO_FUNCIONANDO_PROYECTO',nombre:'No funcionando',emoji:'🛑',icono:'ti ti-octagon',prioridad:1.3},
    ATRAPADO:{codigo:'ATRAPADO',nombre:'Persona atrapada',emoji:'🚨',icono:'ti ti-alarm',prioridad:2},
    NO_FUNCIONANDO:{codigo:'NO_FUNCIONANDO',nombre:'Equipo no funcionando',emoji:'🚧',icono:'ti ti-barrier-block',prioridad:3},
    FUERA_SLA:{codigo:'FUERA_SLA',nombre:'Fuera de SLA',emoji:'⌛',icono:'ti ti-hourglass',prioridad:4},
    VOLTAJE:{codigo:'VOLTAJE',nombre:'Variación de voltaje',emoji:'⚡',icono:'ti ti-bolt',prioridad:5},
    FILTRACION:{codigo:'FILTRACION',nombre:'Filtración',emoji:'💧',icono:'ti ti-droplet',prioridad:6},
    ABIERTO:{codigo:'ABIERTO',nombre:'Abierto',emoji:'🔴',icono:'ti ti-circle-filled',prioridad:20},
    EN_CURSO:{codigo:'EN_CURSO',nombre:'En curso',emoji:'⏳',icono:'ti ti-loader',prioridad:21},
    CERRADO:{codigo:'CERRADO',nombre:'Cerrado',emoji:'✓',icono:'ti ti-check',prioridad:22},
    RESPONSABILIDAD_BLT:{codigo:'RESPONSABILIDAD_BLT',nombre:'Responsabilidad BLT',emoji:'🛠️',icono:'ti ti-tools',prioridad:30},
    RESPONSABILIDAD_CLIENTE:{codigo:'RESPONSABILIDAD_CLIENTE',nombre:'Responsabilidad cliente',emoji:'👤',icono:'ti ti-user',prioridad:31},
    TICKET:{codigo:'TICKET',nombre:'Ticket',emoji:'🎫',icono:'ti ti-ticket',prioridad:40},
    PREVENTIVO_REALIZADO:{codigo:'PREVENTIVO_REALIZADO',nombre:'Preventivo realizado',emoji:'✅',icono:'ti ti-circle-check',prioridad:50},
    PREVENTIVO_PENDIENTE:{codigo:'PREVENTIVO_PENDIENTE',nombre:'Preventivo pendiente',emoji:'⏰',icono:'ti ti-clock',prioridad:51},
    INFORMACION:{codigo:'INFORMACION',nombre:'Información',emoji:'ℹ️',icono:'ti ti-info-circle',prioridad:90},
    ADVERTENCIA:{codigo:'ADVERTENCIA',nombre:'Advertencia',emoji:'⚠️',icono:'ti ti-alert-triangle',prioridad:91},
    ERROR:{codigo:'ERROR',nombre:'Error',emoji:'❌',icono:'ti ti-circle-x',prioridad:92}
  };

  let catalogo = new Map(Object.entries(FALLBACKS));
  let loadingPromise = null;
  let loadedFromApi = false;
  let criticidadPromise = null;
  let criticidadLoaded = false;
  let criticalYearCodes = new Set();
  let criticalYearProjects = new Set();
  let critical365Rows = [];

  function apiBase(){ return String(window.MANTTO_API_BASE || '').replace(/\/$/, ''); }
  function normalize(code){ return String(code || '').trim().toUpperCase(); }
  function uniqCodes(codes){ return [...new Set((Array.isArray(codes)?codes:[codes]).map(normalize).filter(Boolean))]; }
  function headers(){ return Object.assign({'Accept':'application/json'}, window.ManttoAuth&&window.ManttoAuth.authHeaders?window.ManttoAuth.authHeaders():{}); }

  async function load(force){
    if(loadedFromApi && !force) return api;
    if(loadingPromise && !force) return loadingPromise;
    loadingPromise = (async function(){
      try{
        const response = await fetch(apiBase() + '/api/estados-visuales', {cache:'no-store',headers:headers()});
        if(!response.ok) throw new Error('HTTP '+response.status);
        const payload = await response.json();
        const rows = Array.isArray(payload)?payload:(payload.data||payload.rows||[]);
        if(Array.isArray(rows) && rows.length){
          rows.forEach(row=>{
            const code=normalize(row.codigo);
            if(code) catalogo.set(code,Object.assign({},FALLBACKS[code]||{},row,{codigo:code}));
          });
          loadedFromApi=true;
        }
      }catch(error){
        console.warn('[EstadosVisuales_gnral] Se usan valores de respaldo:', error.message);
      }finally{
        apply(document);
      }
      return api;
    })();
    return loadingPromise;
  }

  async function loadCriticidadCorporativa(force){
    if(criticidadLoaded && !force) return api;
    if(criticidadPromise && !force) return criticidadPromise;
    criticidadPromise=(async function(){
      try{
        const response=await fetch(apiBase()+'/api/criticidad-corporativa?min_fallas=3',{cache:'no-store',headers:headers()});
        if(!response.ok) throw new Error('HTTP '+response.status);
        const payload=await response.json();
        const yearRows=((payload.anio_en_curso||{}).data)||[];
        critical365Rows=((payload.ultimos_365_dias||{}).data)||[];
        criticalYearCodes=new Set(yearRows.map(row=>String(row.codigo_equipo||'').trim()).filter(Boolean));
        criticalYearProjects=new Set(yearRows.map(row=>String(row.proyecto||'').trim()).filter(Boolean));
        criticidadLoaded=true;
      }catch(error){
        console.warn('[EstadosVisuales_gnral] No se pudo cargar criticidad corporativa:',error.message);
      }
      return api;
    })();
    return criticidadPromise;
  }
  function isCriticoEquipo(codigo){ return criticalYearCodes.has(String(codigo||'').trim()); }
  function isCriticoProyecto(proyecto){ return criticalYearProjects.has(String(proyecto||'').trim()); }
  function getCriticos365(){ return critical365Rows.slice(); }

  function get(code){ const key=normalize(code); return catalogo.get(key)||null; }
  function getMany(codes, options){
    const opts=options||{};
    const excluded=new Set(uniqCodes(opts.excludeCodes||[]));
    return uniqCodes(codes).filter(code=>!excluded.has(code)).map(get).filter(Boolean).sort((a,b)=>(Number(a.prioridad)||100)-(Number(b.prioridad)||100));
  }
  function emoji(code,fallback){ const item=get(code); return item&&item.emoji?item.emoji:(fallback||''); }
  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function textBlob(row){
    const source = row || {};
    return [source.asunto,source.asu,source.descripcion,source.causa,source.cau,source.causa_falla,source.caf,source.accion,source.acc,source.estatus_equipo_final,source.eqf]
      .filter(Boolean).join(' ').toLowerCase();
  }
  function codesForTicket(row, options){
    const opts=options||{}, source=row||{}, blob=textBlob(source), codes=[];
    const hasAny=words=>words.some(word=>blob.includes(word));
    if(opts.critico===true || source.critico===true || Number(source.es_critico||0)===1) codes.push('CRITICO');
    if(hasAny(['atrapado','atrapada','encerrado','encerrada','persona atrapada','personas atrapadas','rescate'])) codes.push('ATRAPADO');
    if(hasAny(['agua','filtracion','filtración','inundacion','inundación','gotera','goteras','humedad'])) codes.push('FILTRACION');
    if(hasAny(['voltaje','variacion de voltaje','variación de voltaje','sobre voltaje','bajo voltaje','pico de voltaje','falla electrica','falla eléctrica','corte de luz','falla de energia','falla de energía','sin energia','sin energía','apagon','apagón'])) codes.push('VOLTAJE');
    const finalState=String(source.estado_operativo||source.estatus_operativo||source.estatus_equipo_final||source.eqf||'').toLowerCase();
    if(finalState.includes('no funcionando') || finalState.includes('parado') || finalState.includes('fuera de servicio')) codes.push('NO_FUNCIONANDO');
    const exceeds=source.ticket_excede||source.excede_sla||source.fuera_sla||source.ens||source.xat;
    if(exceeds && String(exceeds).toLowerCase()!=='null' && String(exceeds)!=='0' && String(exceeds).toLowerCase()!=='false') codes.push('FUERA_SLA');
    return uniqCodes(codes);
  }
  function codesForEquipo(row, tickets, options){
    const source=row||{}, opts=options||{}, codes=[];
    if(opts.critico===true || source.critico===true || Number(source.es_critico||source.equipos_criticos||0)>0) codes.push('CRITICO');
    const state=String(source.estado_operativo||source.estatus_operativo||source.estatus_servicio||source.estatus_actual||'').toLowerCase();
    if(state.includes('parado') || state.includes('no funcionando') || state.includes('no en servicio')) codes.push('NO_FUNCIONANDO');
    (Array.isArray(tickets)?tickets:[]).forEach(ticket=>codes.push(...codesForTicket(ticket,opts)));
    return uniqCodes(codes);
  }
  function codesForProyecto(row, equipos, tickets, options){
    const source=row||{}, opts=options||{}, codes=[];
    if(opts.critico===true || Number(source.equipos_criticos||source.criticos||0)>0) codes.push('CRITICO');
    (Array.isArray(equipos)?equipos:[]).forEach(equipo=>codes.push(...codesForEquipo(equipo,[],opts)));
    (Array.isArray(tickets)?tickets:[]).forEach(ticket=>codes.push(...codesForTicket(ticket,opts)));
    return uniqCodes(codes);
  }
  function renderIdentifier(codes, text, options){
    const opts=options||{};
    const icons=renderMany(codes,{empty:'',separator:opts.separator==null?' ':opts.separator,excludeCodes:opts.excludeCodes||[]});
    const label=opts.escape===false?String(text==null?'—':text):escapeHtml(text==null||text===''?'—':text);
    return '<span class="estado-identificador-gnral">'+(icons?icons+' ':'')+'<span class="estado-identificador-texto-gnral">'+label+'</span></span>';
  }
  function renderMany(codes,options){
    const opts=options||{};
    const items=getMany(codes,opts);
    if(!items.length) return opts.empty==null?'':String(opts.empty);
    return items.map(item=>{
      const title=String(item.nombre||item.codigo||'').replace(/"/g,'&quot;');
      return '<span class="estado-visual-gnral" data-estado-codigo="'+item.codigo+'" title="'+title+'">'+(item.emoji||'')+'</span>';
    }).join(opts.separator==null?' ':opts.separator);
  }
  function renderLegend(codes, options){
    const opts=options||{};
    const items=getMany(codes,{excludeCodes:opts.excludeCodes||[]});
    if(!items.length)return '';
    const entries=items.map(item=>{
      const name=escapeHtml(item.nombre||item.codigo||'Indicador');
      const emojiText=escapeHtml(item.emoji||'');
      return '<span class="estado-leyenda-item-gnral" title="'+name+'"><span class="estado-leyenda-emoji-gnral">'+emojiText+'</span><span>'+name+'</span></span>';
    }).join('<span class="estado-leyenda-sep-gnral">·</span>');
    return '<details class="estado-leyenda-gnral"><summary><span class="estado-leyenda-info-gnral">ⓘ</span> Indicadores</summary><div class="estado-leyenda-contenido-gnral">'+entries+'</div></details>';
  }
  function syncLegendMode(root){
    const base=root||document;
    const mobile=window.matchMedia&&window.matchMedia('(max-width: 720px)').matches;
    base.querySelectorAll('details.estado-leyenda-gnral').forEach(el=>{ el.open=!mobile; });
  }
  function apply(root){
    const base=root||document;
    base.querySelectorAll('[data-estado-visual]').forEach(el=>{
      const item=get(el.getAttribute('data-estado-visual'));
      if(!item)return;
      const target=el.querySelector('[data-estado-visual-icon]')||el;
      if(item.emoji)target.textContent=item.emoji;
      if(item.nombre&&!el.title)el.title=item.nombre;
      if(item.color_texto)el.style.setProperty('--estado-color-texto',item.color_texto);
      if(item.color_fondo)el.style.setProperty('--estado-color-fondo',item.color_fondo);
      if(item.color_borde)el.style.setProperty('--estado-color-borde',item.color_borde);
    });
    base.querySelectorAll('[data-estados-leyenda]').forEach(el=>{
      const rawCodes=String(el.getAttribute('data-estados-leyenda')||'');
      const rawExcluded=String(el.getAttribute('data-estados-excluir')||'');
      const codes=rawCodes.split(',').map(normalize).filter(Boolean);
      const excluded=rawExcluded.split(',').map(normalize).filter(Boolean);
      const signature=rawCodes+'|'+rawExcluded+'|'+loadedFromApi;
      if(el.getAttribute('data-estados-leyenda-rendered')!==signature){
        el.innerHTML=renderLegend(codes,{excludeCodes:excluded});
        el.setAttribute('data-estados-leyenda-rendered',signature);
      }
    });
    syncLegendMode(base);
  }

  function ensureStyles(){
    if(document.getElementById('estados-visuales-gnral-style'))return;
    const style=document.createElement('style');
    style.id='estados-visuales-gnral-style';
    style.textContent='.estado-visual-gnral{display:inline-block;margin-right:.2rem;line-height:1;vertical-align:middle}.estado-visual-gnral:last-child{margin-right:0}.estado-identificador-gnral{display:inline-flex;align-items:center;gap:.12rem;max-width:100%;vertical-align:middle}.estado-identificador-texto-gnral{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.estado-leyenda-host-gnral{margin:8px 0 10px}.estado-leyenda-gnral{border:1px solid #d0d5dd;border-radius:8px;background:#f8fafc;color:#344054}.estado-leyenda-gnral summary{display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:11px;font-weight:700;cursor:pointer;list-style:none}.estado-leyenda-gnral summary::-webkit-details-marker{display:none}.estado-leyenda-info-gnral{color:#1b4fd8}.estado-leyenda-contenido-gnral{display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:0 10px 8px;font-size:11px}.estado-leyenda-item-gnral{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.estado-leyenda-emoji-gnral{font-size:15px;line-height:1}.estado-leyenda-sep-gnral{color:#98a2b3}@media(max-width:720px){.estado-leyenda-host-gnral{margin:6px 0 8px}.estado-leyenda-contenido-gnral{display:grid;grid-template-columns:1fr;gap:7px;padding:2px 10px 10px}.estado-leyenda-sep-gnral{display:none}}';
    document.head.appendChild(style);
  }
  ensureStyles();

  const api={load,loadCriticidadCorporativa,isCriticoEquipo,isCriticoProyecto,getCriticos365,get,getMany,emoji,renderMany,renderIdentifier,renderLegend,codesForTicket,codesForEquipo,codesForProyecto,apply,isLoaded:()=>loadedFromApi};
  window.EstadosVisuales_gnral=api;
  function start(){
    load();
    loadCriticidadCorporativa();
    if(window.MutationObserver){
      const observer=new MutationObserver(mutations=>{
        mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{
          if(node&&node.nodeType===1){
            if(node.matches&&node.matches('[data-estados-leyenda],[data-estado-visual]'))apply(node.parentNode||node);
            else if(node.querySelector&&node.querySelector('[data-estados-leyenda],[data-estado-visual]'))apply(node);
          }
        }));
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }
    window.addEventListener('resize',()=>syncLegendMode(document));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
