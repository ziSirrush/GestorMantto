# Código vigente de Auditoría que deben conservar las fases de Prueba de Carga

Este es un snapshot del código local que todavía no forma parte del commit `37780b3`. Si una fase parte de ese commit, debe fusionar este bloque con su nuevo `panel-control.js` y conservar los estilos, scripts y generador indicados abajo. No copiar el archivo antiguo sobre el actual.

En el objeto `state` de `modules/panel-control/panel-control.js` deben estar `auditWeek`, `auditCompany`, `auditModule`, `auditType` y `auditLayer` con valores iniciales `null`, `''`, `''`, `''` y `''`.

En `renderMain()`, antes de `state.bootLoading` y `state.error`, debe estar:

```js
if(state.tab==='audit'){
  renderChangeAudit(box);
  updateSaveButton();
  return;
}
```

El siguiente bloque completo es el renderizador vigente. Se extrajo directamente del archivo local:

```js
  const AUDIT_ZONE='America/Mexico_City';
  const auditPartsFormatter=new Intl.DateTimeFormat('en-US',{timeZone:AUDIT_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const auditTypeLabels={feature:'Función',correction:'Corrección',security:'Seguridad',configuration:'Configuración',data:'Datos',maintenance:'Mantenimiento'};

  function auditLocalParts(date){
    return Object.fromEntries(auditPartsFormatter.formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  }

  function auditWeekKey(date){
    const p=auditLocalParts(date);
    const day=new Date(Date.UTC(p.year,p.month-1,p.day));
    day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
    return day.toISOString().slice(0,10);
  }

  function auditDayLabel(date){
    return `${String(date.getUTCDate()).padStart(2,'0')}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${date.getUTCFullYear()}`;
  }

  function auditWeekLabel(key){
    const monday=new Date(`${key}T00:00:00Z`);
    const sunday=new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate()+6);
    return `${auditDayLabel(monday)} - 00:00 a ${auditDayLabel(sunday)} - 23:59`;
  }

  function auditDateLabel(value){
    const p=auditLocalParts(new Date(value));
    return `${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}/${p.year} - ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;
  }

  function auditCompaniesForUser(){
    const user=api()?.getUser?.()||{};
    const roles=[user.rol,...(Array.isArray(user.roles)?user.roles:[])].map(role=>typeof role==='string'?role:role?.rol).filter(Boolean);
    if(roles.includes('Programador')||roles.includes('Director General'))return ['GENERAL','UNITED','CORELLIAN'];
    const allowed=['GENERAL'];
    if(roles.includes('Programador United'))allowed.push('UNITED');
    if(roles.includes('Programador Corellian'))allowed.push('CORELLIAN');
    return allowed.length>1?allowed:[];
  }

  function auditOptions(values,selected,allLabel){
    return `<option value="">${esc(allLabel)}</option>${values.map(value=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(auditTypeLabels[value]||value)}</option>`).join('')}`;
  }

  function auditReference(url,label){
    if(typeof url!=='string')return '';
    try{
      const parsed=new URL(url);
      if(parsed.protocol!=='https:'||parsed.hostname!=='github.com')return '';
      return `<a href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    }catch(_){return '';}
  }

  function renderChangeAudit(box){
    const artifact=window.MANTTO_CHANGE_AUDIT;
    const build=window.MANTTO_BUILD_INFO||{};
    const allowed=auditCompaniesForUser();
    const auditAvailable=artifact?.schemaVersion===1&&Array.isArray(artifact.changes)&&(!build.commit||artifact.buildCommit===build.commit);
    const records=auditAvailable?artifact.changes:[];
    const scoped=records.filter(item=>allowed.includes(item.company)&&item.status==='published');
    const today=auditWeekKey(new Date());
    const weeks=[...new Set([today,...scoped.map(item=>auditWeekKey(new Date(item.finalized_at)))] )].sort().reverse();
    if(!state.auditWeek)state.auditWeek=today;
    if(!weeks.includes(state.auditWeek))state.auditWeek=today;
    const weekRows=scoped.filter(item=>auditWeekKey(new Date(item.finalized_at))===state.auditWeek);
    const modules=[...new Set(weekRows.map(item=>item.module))].sort((a,b)=>a.localeCompare(b,'es'));
    const types=[...new Set(weekRows.map(item=>item.type))].sort();
    const layers=[...new Set(weekRows.flatMap(item=>item.layer||[]))].sort();
    const companies=[...new Set(weekRows.map(item=>item.company))].sort();
    const visible=weekRows.filter(item=>(!state.auditCompany||item.company===state.auditCompany)&&(!state.auditModule||item.module===state.auditModule)&&(!state.auditType||item.type===state.auditType)&&(!state.auditLayer||item.layer?.includes(state.auditLayer)));
    const moduleCount=new Set(visible.map(item=>item.module)).size;
    const buildCommit=String(build.commit||artifact?.buildCommit||'');
    const buildLabel=build.provider||build.environment||'DESCONOCIDO';
    const updated=artifact?.generatedAt?auditDateLabel(artifact.generatedAt):'No disponible';
    box.innerHTML=`<section class="pc-audit pc-change-audit">
      <div class="pc-audit-head"><div><span class="pc-eyebrow">TRAZABILIDAD DEL SISTEMA</span><h2>Auditoría de cambios</h2><p>Semana: ${esc(auditWeekLabel(state.auditWeek))} · Ciudad de México</p></div><div class="pc-audit-deploy"><span>Entorno: ${esc(buildLabel)}</span><span>Commit: ${esc(buildCommit.slice(0,7)||'No disponible')}</span><span>Registro actualizado: ${esc(updated)}</span></div></div>
      <div class="pc-audit-baseline">Historial disponible desde la activación de Auditoría de cambios. Los registros anteriores se incorporan únicamente cuando existe evidencia verificable.</div>
      <div class="pc-audit-filters">
        <label>Semana<select id="pc-audit-week">${weeks.map(week=>`<option value="${esc(week)}" ${week===state.auditWeek?'selected':''}>${esc(auditWeekLabel(week))}</option>`).join('')}</select></label>
        <label>Empresa<select id="pc-audit-company">${auditOptions(companies,state.auditCompany,'Todas las empresas')}</select></label>
        <label>Módulo<select id="pc-audit-module">${auditOptions(modules,state.auditModule,'Todos los módulos')}</select></label>
        <label>Tipo<select id="pc-audit-type">${auditOptions(types,state.auditType,'Todos los tipos')}</select></label>
        <label>Capa<select id="pc-audit-layer">${auditOptions(layers,state.auditLayer,'Todas las capas')}</select></label>
      </div>
      <div class="pc-audit-totals"><article><b>${visible.length}</b><span>Cambios lógicos</span></article><article><b>${moduleCount}</b><span>Módulos afectados</span></article></div>
      <div class="pc-audit-cards">${visible.length?visible.map(item=>`<article class="pc-audit-card"><div class="pc-audit-card-top"><span class="pc-status ok">Vigente</span><span>${esc(auditTypeLabels[item.type]||item.type)}</span></div><h3>${esc(item.title)}</h3><p class="pc-audit-meta">${esc(item.company)} · ${esc(item.module)}</p><p>${esc(item.final_summary)}</p><p><b>Impacto:</b> ${esc(item.user_impact)}</p><div class="pc-audit-card-bottom"><span>${esc(auditDateLabel(item.finalized_at))}</span><span>Commit ${esc(item.references.commit.slice(0,7))}</span></div><p><b>Validación:</b> ${esc(item.validation)}</p><details><summary>Detalle técnico</summary><dl><dt>SHA completo</dt><dd>${esc(item.references.commit)}</dd><dt>Capa</dt><dd>${esc(item.layer.join(', '))}</dd><dt>Motivo</dt><dd>${esc(item.reason)}</dd><dt>Responsable</dt><dd>${esc(item.responsible)}</dd></dl><div class="pc-audit-links">${auditReference(`https://github.com/ziSirrush/GestorMantto/commit/${item.references.commit}`,'Ver commit')}${auditReference(item.references.issue,'Issue')}${auditReference(item.references.pull_request,'Pull request')}</div></details></article>`).join(''):`<div class="pc-empty large">${weekRows.length?'Sin cambios con los filtros seleccionados.':'Sin cambios publicados esta semana.'}</div>`}</div>
      ${!auditAvailable?'<p class="pc-audit-error">No se pudo cargar el registro de Auditoría de esta versión. Recarga la página para obtener los metadatos actuales.</p>':''}
    </section>`;
    const rerender=()=>renderChangeAudit(box);
    box.querySelector('#pc-audit-week')?.addEventListener('change',event=>{state.auditWeek=event.target.value;state.auditCompany='';state.auditModule='';state.auditType='';state.auditLayer='';rerender();});
    for(const [id,key] of [['company','auditCompany'],['module','auditModule'],['type','auditType'],['layer','auditLayer']])box.querySelector(`#pc-audit-${id}`)?.addEventListener('change',event=>{state[key]=event.target.value;rerender();});
  }
```

En `index.html` deben cargarse, en este orden, `./core/build-info.generated.js` y `./core/change-audit.generated.js`, ambos con `?v=` del SHA actual que escribe `tools/generate-change-audit.js` durante el build. `core/module-loader.js` debe cargar el CSS y el JS fusionados de Panel de Control con una nueva versión de caché. Conservar también la generación en `.github/workflows/pages.yml` y `docs/netlify.toml`.

CSS de Auditoría vigente, extraído del archivo local:

```css
.pc-change-audit .pc-audit-head{align-items:flex-start}.pc-audit-deploy{display:grid;gap:5px;color:#475569;font-size:.78rem;min-width:210px}.pc-audit-baseline{margin:16px 20px 0;padding:13px 15px;border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff;color:#1e3a5f;font-size:.84rem}.pc-audit-filters{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:10px;padding:18px 20px}.pc-audit-filters label{display:grid;gap:5px;font-size:.75rem;font-weight:800;color:#475569}.pc-audit-filters select{width:100%;min-width:0;border:1px solid #cbd5e1;border-radius:10px;padding:9px;background:#fff;font:inherit;color:#17202a}.pc-audit-totals{display:flex;gap:12px;padding:0 20px 18px}.pc-audit-totals article{min-width:150px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:13px}.pc-audit-totals b{display:block;font-size:1.4rem}.pc-audit-totals span{font-size:.77rem;color:#64748b}.pc-audit-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:14px;padding:0 20px 20px}.pc-audit-card{border:1px solid #dce5ee;border-radius:16px;padding:17px;background:#fff;min-width:0}.pc-audit-card-top,.pc-audit-card-bottom{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:.76rem;color:#64748b}.pc-audit-card h3{margin:13px 0 3px;font-size:1rem}.pc-audit-card p{line-height:1.45;overflow-wrap:anywhere}.pc-audit-card .pc-audit-meta{margin:0;color:#64748b;font-size:.78rem}.pc-audit-card-bottom{padding:11px 0;border-top:1px solid #edf2f7;border-bottom:1px solid #edf2f7}.pc-audit-card details{border-top:1px solid #edf2f7;padding-top:12px;font-size:.8rem}.pc-audit-card summary{cursor:pointer;font-weight:800;color:#1e5a97}.pc-audit-card dl{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;overflow-wrap:anywhere}.pc-audit-card dt{font-weight:800}.pc-audit-card dd{margin:0}.pc-audit-links{display:flex;gap:12px;flex-wrap:wrap}.pc-audit-links a{color:#1e5a97}.pc-audit-error{margin:0 20px 18px!important;color:#b91c1c!important}
```

Para comprobar la fusión: `node --test tests/change-audit-generator.test.js`, `node --check modules/panel-control/panel-control.js`, `git diff --check`, y revisión manual de ambas pestañas del Panel.
