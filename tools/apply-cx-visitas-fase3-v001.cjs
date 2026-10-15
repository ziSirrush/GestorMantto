'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 3 V001]
// Instalacion segura e incremental: genera el archivo COMPLETO core/app.js
// a partir del blob exacto de BLT NOW 101526.4; jamas sobreescribe a ciegas.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const BASE_BLOB = '9c857a6fedf488ff5bf6c2f311a6df0fcd4ddd24';
const INDEX_BASE_BLOB = '6c71db21ab191ba346d02c6460d0cd8a5fc53043';
const OLD_APP_TAG = '<script src="./core/app.js?v=20261001-cobranza-pagos-detalle-v001"></script>';
const NEW_APP_TAG = '<script src="./core/app.js?v=20261015-cx-visitas-fase3-v001"></script>'; 
const MARKER = '// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 3 V001]';

const INJECTION = String.raw`
  // [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 3 V001]
  // Inyecta el frontend de Visitas SIN alterar el router ni los modulos CX existentes.
  const CUSTOMER_EXPERIENCE_VISITAS_ROUTE_COR = 'cx-visitas';
  const CX_VISITAS_VISUAL_COR = 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
  const CX_VISITAS_LIST_COR = 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER';
  let customerExperienceVisitasPromise_cor = null;
  let cxVisitasMenuRequest_cor = 0;

  function ensureCustomerExperienceVisitas_cor(){
    if(window.ManttoCustomerExperienceVisitas) return Promise.resolve(window.ManttoCustomerExperienceVisitas);
    if(customerExperienceVisitasPromise_cor) return customerExperienceVisitasPromise_cor;

    customerExperienceVisitasPromise_cor = new Promise((resolve, reject) => {
      let style = document.querySelector('link[data-blt-cx-visitas="1"]');
      if(!style){
        style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = './modules/customer-experience-visitas/customer-experience-visitas.css?v=20261015-fase3-v001';
        style.dataset.bltCxVisitas = '1';
        document.head.appendChild(style);
      }
      const existing = document.querySelector('script[data-blt-cx-visitas="1"]');
      if(existing){
        if(window.ManttoCustomerExperienceVisitas) return resolve(window.ManttoCustomerExperienceVisitas);
        existing.addEventListener('load', () => resolve(window.ManttoCustomerExperienceVisitas || null), { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = './modules/customer-experience-visitas/customer-experience-visitas.js?v=20261015-fase3-v001';
      script.async = true;
      script.dataset.bltCxVisitas = '1';
      script.addEventListener('load', () => resolve(window.ManttoCustomerExperienceVisitas || null), { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    }).catch(error => {
      customerExperienceVisitasPromise_cor = null;
      throw error;
    });
    return customerExperienceVisitasPromise_cor;
  }

  function activateCustomerExperienceVisitas_cor(){
    if(currentAppRoute_cor() !== CUSTOMER_EXPERIENCE_VISITAS_ROUTE_COR) return Promise.resolve(false);
    const view = document.getElementById('view-placeholder');
    if(view) view.innerHTML = '<div class="cxv-loading">Cargando Customer Experience · Visitas…</div>';
    return ensureCustomerExperienceVisitas_cor()
      .then(module => {
        if(currentAppRoute_cor() !== CUSTOMER_EXPERIENCE_VISITAS_ROUTE_COR) return false;
        if(!module || typeof module.init !== 'function') throw new Error('Modulo Visitas no disponible.');
        return module.init();
      })
      .catch(error => {
        console.error('[BLT NOW] Error al cargar Customer Experience · Visitas:', error);
        if(currentAppRoute_cor() !== CUSTOMER_EXPERIENCE_VISITAS_ROUTE_COR) return false;
        const target = document.getElementById('view-placeholder');
        if(target){
          target.innerHTML = '<div class="placeholder"><div class="card placeholder-card construction-card">' +
            '<div class="construction-icon">⚠️</div><h1>Visitas</h1><h2>No fue posible abrir el modulo</h2>' +
            '<p>Verifica la publicacion de la Fase 3 e informa a Soporte si el problema continua.</p></div></div>';
        }
        return false;
      });
  }

  function bindCustomerExperienceVisitas_cor(){
    if(window.__BLT_CUSTOMER_EXPERIENCE_VISITAS_BOUND__) return;
    window.__BLT_CUSTOMER_EXPERIENCE_VISITAS_BOUND__ = true;
    document.addEventListener('mantto:navigation', event => {
      if(String(event?.detail?.route || '') === CUSTOMER_EXPERIENCE_VISITAS_ROUTE_COR){
        activateCustomerExperienceVisitas_cor();
      }
    });
    activateCustomerExperienceVisitas_cor();
  }

  function setCxVisitasMenuVisibility_cor(allowed){
    const item = document.querySelector('[data-permission="cx_visitas"]');
    if(!item) return;
    item.hidden = !allowed;
    const group = item.closest('.side-group');
    if(group){
      group.hidden = !Array.from(group.querySelectorAll('.side-item')).some(button => !button.hidden);
    }
  }

  // El menu permanece oculto hasta la comprobacion efectiva; la API valida
  // visual + VER + puerta y alcance CORELLIAN. No confiar en el boton como ACL.
  async function refreshCxVisitasMenu_cor(){
    const request = ++cxVisitasMenuRequest_cor;
    setCxVisitasMenuVisibility_cor(false);
    const permissions = window.ManttoPermissions;
    if(permissions && typeof permissions.state === 'function'){
      try{
        const visual = permissions.state(CX_VISITAS_VISUAL_COR);
        const listado = permissions.state(CX_VISITAS_LIST_COR);
        if(visual?.exists === true && listado?.exists === true
            && (visual.efectivo !== true || listado.efectivo !== true)) return;
      }catch(error){
        console.warn('[BLT NOW] No fue posible leer permisos CX Visitas:', error);
      }
    }
    if(!window.ManttoAuth || typeof window.ManttoAuth.api !== 'function') return;
    try{
      const response = await window.ManttoAuth.api('/api/customer-experience/visitas?page=1&page_size=1', {method:'GET'});
      if(request === cxVisitasMenuRequest_cor){
        setCxVisitasMenuVisibility_cor(response?.ok === true && Array.isArray(response.visitas));
      }
    }catch(_error){
      if(request === cxVisitasMenuRequest_cor) setCxVisitasMenuVisibility_cor(false);
    }
  }

  function bindCxVisitasMenu_cor(){
    if(window.__BLT_CX_VISITAS_MENU_BOUND__) return;
    window.__BLT_CX_VISITAS_MENU_BOUND__ = true;
    document.addEventListener('mantto:permissions-updated', refreshCxVisitasMenu_cor);
    refreshCxVisitasMenu_cor();
  }

`;

function gitBlobSha(source) {
  const bytes = Buffer.from(source, 'utf8');
  return crypto.createHash('sha1')
    .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function replaceExactlyOnce(text, needle, replacement) {
  const first = text.indexOf(needle);
  if (first < 0 || text.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('Ancla de integracion ausente/duplicada: ' + needle.slice(0, 130));
  }
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
}

function transform(source, { verifyBlob = true } = {}) {
  if (source.includes(MARKER)) return { content: source, applied: false, already: true };
  const blob = gitBlobSha(source);
  if (verifyBlob && blob !== BASE_BLOB) {
    throw new Error(`CONFLICTO: core/app.js cambio; se esperaba blob ${BASE_BLOB}, existe ${blob}. NO se sobreescribio. Reintegrar sobre HEAD actual.`);
  }

  let output = replaceExactlyOnce(source,
    '  // [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]',
    INJECTION + '  // [Aster | 2026-10-07 | ASTER-MG | FASE 1 ENTREGAS V001]');
  output = replaceExactlyOnce(output,
    '    bindCustomerExperienceEncuestas_cor();\n    bindEntregasControl_gnral();',
    '    bindCustomerExperienceEncuestas_cor();\n    bindCustomerExperienceVisitas_cor();\n    bindEntregasControl_gnral();');
  output = replaceExactlyOnce(output,
    '    applyTemporarySidebarPermissions();\n    openSidebarGroup(null);',
    '    applyTemporarySidebarPermissions();\n    bindCxVisitasMenu_cor();\n    openSidebarGroup(null);');

  // Validar que se genere el archivo completo y sintacticamente valido.
  new vm.Script(output, { filename: 'core/app.js' });
  if (!output.includes('bindCustomerExperienceVisitas_cor();')
      || !output.includes('bindCxVisitasMenu_cor();')) {
    throw new Error('El resultado de la integracion no incorpora ambos puntos de enlace.');
  }
  return { content: output, applied: true, already: false };
}

function transformIndex(source) {
  if (source.includes(NEW_APP_TAG)) return {content:source,already:true,applied:false};
  const blob=gitBlobSha(source);
  if (blob!==INDEX_BASE_BLOB) {
    throw new Error(`CONFLICTO: index.html cambio; se esperaba blob ${INDEX_BASE_BLOB}, existe ${blob}. NO se sobreescribio.`);
  }
  const output=replaceExactlyOnce(source, OLD_APP_TAG, NEW_APP_TAG);
  if (!output.includes('BLT NOW') || !output.includes('BLT NOW GH')) {
    throw new Error('Contrato de marca PWA BLT NOW incompleto: se cancela la instalacion.');
  }
  return {content:output,already:false,applied:true};
}

function precheck(root) {
  const appFile = path.join(root, 'core', 'app.js');
  const indexFile = path.join(root, 'index.html');
  const frontDir = path.join(root, 'modules', 'customer-experience-visitas');
  const jsFile = path.join(frontDir, 'customer-experience-visitas.js');
  const cssFile = path.join(frontDir, 'customer-experience-visitas.css');
  const cxRoutesFile = path.join(root, 'backend/src/modules/customer-experience/customer-experience.routes.js');
  const phase2RouteFile = path.join(root, 'backend/src/modules/customer-experience/customer-experience-visitas.routes.js');
  for (const file of [appFile, indexFile, jsFile, cssFile, cxRoutesFile, phase2RouteFile]) {
    if (!fs.existsSync(file)) throw new Error('Falta archivo requerido: ' + file);
  }
  const routes = fs.readFileSync(cxRoutesFile, 'utf8');
  const phase2Routes = fs.readFileSync(phase2RouteFile, 'utf8');
  if (!routes.includes("router.use('/visitas', visitasRoutes_cor)")
    || !phase2Routes.includes('CX_VISITAS_API_ENABLED')) {
    throw new Error('Fase 2 no detectada o inconsistente en backend CX. Aplicar/validar Fase 2 ANTES.');
  }
  new vm.Script(fs.readFileSync(jsFile, 'utf8'), { filename: jsFile });
  const original = fs.readFileSync(appFile, 'utf8');
  const result = transform(original);
  const originalIndex = fs.readFileSync(indexFile, 'utf8');
  const indexResult = transformIndex(originalIndex);
  return { appFile, indexFile, original, originalIndex, result, indexResult };
}

function install(root, options = {}) {
  const {appFile,indexFile,original,originalIndex,result,indexResult} = precheck(root);
  if (result.already && indexResult.already) {
    return { status: 'YA_APLICADA', blobApp: gitBlobSha(original),
      blobIndex: gitBlobSha(originalIndex), appFile, indexFile };
  }
  if (options.checkOnly) {
    return { status: 'PRECHECK_OK_SIN_CAMBIOS',
      blobAppAnterior: gitBlobSha(original), blobAppGenerado: gitBlobSha(result.content),
      blobIndexAnterior:gitBlobSha(originalIndex), blobIndexGenerado:gitBlobSha(indexResult.content),
      appFile, indexFile };
  }
  // La instalacion transforma archivos completos. No altera el resto del repo.
  // Verifica AMBAS bases antes de escribir cualquiera de los dos ficheros.
  const candidates = [
    {path:appFile,source:original,content:result.content,change:!result.already},
    {path:indexFile,source:originalIndex,content:indexResult.content,change:!indexResult.already}
  ].filter(item => item.change);
  const staged=[];
  const written=[];
  try {
    for (const [index,item] of candidates.entries()) {
      const temp=item.path+'.cxv-tmp-'+process.pid+'-'+index;
      fs.writeFileSync(temp,item.content,'utf8');
      staged.push(temp);
    }
    for (let index=0; index<candidates.length; index++) {
      fs.renameSync(staged[index],candidates[index].path);
      written.push(candidates[index]);
    }
  } catch (error) {
    for (const item of written.reverse()) {
      try { fs.writeFileSync(item.path,item.source,'utf8'); }
      catch (restoreError) { console.error('[CX VISITAS FASE 3] ERROR RESTAURANDO:',restoreError); }
    }
    throw error;
  } finally {
    for (const temp of staged) {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) { /* sin accion */ }
    }
  }
  return { status: 'APLICADA',
    archivosModificados: candidates.map(item => path.relative(root,item.path)),
    blobAppAnterior: gitBlobSha(original), blobAppNuevo:gitBlobSha(result.content),
    blobIndexAnterior:gitBlobSha(originalIndex), blobIndexNuevo:gitBlobSha(indexResult.content),
    appFile, indexFile };
}

if (require.main === module) {
  const customRoot = process.argv.find(arg => arg.startsWith('--root='));
  const root = customRoot ? path.resolve(customRoot.slice('--root='.length)) : path.resolve(__dirname, '..');
  try {
    const checkOnly = process.argv.includes('--check');
    console.log('[CX VISITAS FASE 3]', JSON.stringify(install(root, {checkOnly}), null, 2));
  } catch (error) {
    console.error('[CX VISITAS FASE 3] BLOQUEADO:', error.message);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ gitBlobSha, transform, transformIndex, precheck, install, BASE_BLOB, INDEX_BASE_BLOB, MARKER });
