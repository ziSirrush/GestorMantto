'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 4 V001]
// Strict additive integration + reversible history lookup. Does not deploy.
// Needs the *exact* Fase 2 and Fase 3 locally applied on the reviewed base.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const vm = require('node:vm');

const BASE_COMMIT = 'c8923226b70f8bc63d13f14fc7390ba41599ddfc';
const SHA_F3_UI = '76319556cd518f431a104819377f77a21cdad1f555564016970e3bbf4432a45c';
const SHA_F4_UI = '360805c6b26b5ac3f80f39acd3fca60abf6b35b4903ed2418048b69d0d1f96e1';
const SHA_F2_BACKEND_MOUNT = '8b6f38861db38b74cbc6faa1e314566f2155836a90d7e905c7b7a5b76551b16d';
const OLD_MODULE_JS = "script.src = './modules/customer-experience-visitas/customer-experience-visitas.js?v=20261015-fase3-v001';";
const NEW_MODULE_JS = "script.src = './modules/customer-experience-visitas/customer-experience-visitas.js?v=20261015-fase4-v001';";
const OLD_APP_TAG = '<script src="./core/app.js?v=20261015-cx-visitas-fase3-v001"></script>';
const NEW_APP_TAG = '<script src="./core/app.js?v=20261015-cx-visitas-fase4-v001"></script>';
const APP_MARKER = '// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 3 V001]';
const FRONT_MARKER = '// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 4 QA V001]';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(p) { return sha256(fs.readFileSync(p)); }
function gitShow(root, rel) {
  try {
    return cp.execFileSync('git', ['show', `${BASE_COMMIT}:${rel}`], {
      cwd: root, encoding: 'utf8', timeout: 15000,
      maxBuffer: 8 * 1024 * 1024, windowsHide: true
    });
  } catch (_error) {
    throw new Error(`No existe el commit base ${BASE_COMMIT.slice(0, 8)} en este clon Git (o falta Git). NO se aplico Fase 4. Usa el clon completo revisado y conserva historial.`);
  }
}
function exactlyOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ancla ausente/duplicada: ${before.slice(0, 110)}. No se sobreescribe.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}
function transformAppF4(source) {
  if (!source.includes(APP_MARKER)) throw new Error('core/app.js no tiene el enlace de Fase 3.');
  const output = exactlyOnce(source, OLD_MODULE_JS, NEW_MODULE_JS);
  new vm.Script(output, { filename: 'core/app.js' });
  return output;
}
function transformIndexF4(source) {
  if (!source.includes('BLT NOW') || !source.includes('BLT NOW GH')) {
    throw new Error('index.html no conserva el contrato de marca y PWA.');
  }
  return exactlyOnce(source, OLD_APP_TAG, NEW_APP_TAG);
}
function resolvePaths(root) {
  return {
    app: path.join(root, 'core/app.js'),
    index: path.join(root, 'index.html'),
    ui: path.join(root, 'modules/customer-experience-visitas/customer-experience-visitas.js'),
    css: path.join(root, 'modules/customer-experience-visitas/customer-experience-visitas.css'),
    f2: path.join(root, 'backend/src/modules/customer-experience/customer-experience.routes.js'),
    f2Service: path.join(root, 'backend/src/modules/customer-experience/customer-experience-visitas.service.js'),
    f3Installer: path.join(root, 'tools/apply-cx-visitas-fase3-v001.cjs'),
    uiF3: path.join(root, 'release/cx-visitas-fase4/customer-experience-visitas.fase3.original.js'),
    uiF4: path.join(root, 'release/cx-visitas-fase4/customer-experience-visitas.js')
  };
}
function buildExpected(root) {
  const files = resolvePaths(root);
  for (const [name, p] of Object.entries(files)) {
    if (!fs.existsSync(p)) throw new Error(`Falta dependencia ${name}: ${path.relative(root, p)}`);
  }
  const f2Hash = sha256File(files.f2);
  if (f2Hash !== SHA_F2_BACKEND_MOUNT) {
    throw new Error(`Backend CX difiere de la Fase 2 revisada; archivo: ${path.relative(root, files.f2)}. Integrar manualmente antes.`);
  }
  const f2service = fs.readFileSync(files.f2Service, 'utf8');
  if (!f2service.includes('CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL')) {
    throw new Error('No se detecto permiso VER_HISTORIAL de Fase 2.');
  }
  if (sha256File(files.uiF3) !== SHA_F3_UI || sha256File(files.uiF4) !== SHA_F4_UI) {
    throw new Error('El frontend original/nuevo del paquete Fase 4 no supera integridad SHA256.');
  }
  const f3 = require(files.f3Installer);
  const baseApp = gitShow(root, 'core/app.js');
  const baseIndex = gitShow(root, 'index.html');
  const appF3 = f3.transform(baseApp).content;
  const indexF3 = f3.transformIndex(baseIndex).content;
  const appF4 = transformAppF4(appF3);
  const indexF4 = transformIndexF4(indexF3);
  const uiF3 = fs.readFileSync(files.uiF3, 'utf8');
  const uiF4 = fs.readFileSync(files.uiF4, 'utf8');
  if (!uiF4.includes(FRONT_MARKER)) throw new Error('Falta marca Fase 4 en el frontend final.');
  new vm.Script(uiF4, { filename: 'modules/customer-experience-visitas/customer-experience-visitas.js' });
  return { files, phase3: { app: appF3, index: indexF3, ui: uiF3 },
    phase4: { app: appF4, index: indexF4, ui: uiF4 } };
}
function readCurrent(files) {
  return Object.fromEntries(['app','index','ui'].map(k => [k, fs.readFileSync(files[k],'utf8')]));
}
function classify(current, expected) {
  const same = label => Object.keys(current).every(k => current[k] === expected[label][k]);
  if (same('phase3')) return 'LISTO_FASE3';
  if (same('phase4')) return 'FASE4_APLICADA';
  return 'CONFLICTO';
}
function plan(root) {
  const expected = buildExpected(root);
  const current = readCurrent(expected.files);
  const state = classify(current, expected);
  if (state === 'CONFLICTO') {
    const mismatches = Object.keys(current).filter(k => current[k] !== expected.phase3[k] && current[k] !== expected.phase4[k]);
    throw new Error('CONFLICTO: Fases 3/4 no coinciden con la base exacta o se aplicaron parcialmente. Verificar: '
      + (mismatches.length ? mismatches.map(k=>path.relative(root,expected.files[k])).join(', ') : 'instalacion mixta')
      + '. Sin sobrescritura ni correccion automatica.');
  }
  return { ...expected, current, state };
}
function writeAtomic(candidates) {
  // Stage all target contents before replacing any existing file.
  const staged = [], written = [];
  try {
    for (let i = 0; i < candidates.length; i++) {
      const item=candidates[i], tmp=item.file+'.cxv-f4-tmp-'+process.pid+'-'+i;
      fs.writeFileSync(tmp,item.newContent,{encoding:'utf8',flag:'wx'});
      staged.push(tmp);
    }
    for (let i=0; i<candidates.length; i++) {
      fs.renameSync(staged[i], candidates[i].file);
      written.push(candidates[i]);
    }
  } catch (error) {
    for (const item of written.reverse()) {
      try {fs.writeFileSync(item.file,item.oldContent,'utf8');}
      catch (restoreError) {console.error('[CX_VISITAS_F4_RESTORE_ERROR]',restoreError.message);}
    }
    throw error;
  } finally {
    for (const tmp of staged) {
      try {if (fs.existsSync(tmp)) fs.unlinkSync(tmp);} catch (_) { /* noop */ }
    }
  }
}
function apply(root, { checkOnly=false, rollback=false } = {}) {
  const resolved = path.resolve(root);
  const r = plan(resolved);
  const target = rollback ? 'phase3' : 'phase4';
  const expectedNow = rollback ? 'FASE4_APLICADA' : 'LISTO_FASE3';
  const already = rollback ? 'LISTO_FASE3' : 'FASE4_APLICADA';
  const descriptions = ['app','index','ui'].map(k=>path.relative(resolved,r.files[k]));
  if (r.state === already) return { ok:true, estado:rollback?'FASE4_REVERTIDA_PREVIAMENTE':'FASE4_YA_APLICADA',
    archivos:descriptions, modificado:false, base:BASE_COMMIT };
  if (r.state !== expectedNow) throw new Error('El estado de Fase 3/4 no permite la operacion.');
  if (checkOnly) return { ok:true, estado:rollback?'ROLLBACK_PREPARADO':'LISTO_PARA_FASE4',
    archivos:descriptions, modificado:false, base:BASE_COMMIT };
  writeAtomic(['app','index','ui'].map(k=>({file:r.files[k],oldContent:r.current[k],newContent:r[target][k]})));
  const after = readCurrent(r.files);
  if (Object.keys(after).some(k => after[k] !== r[target][k])) {
    throw new Error('ERROR: la verificacion posterior no coincide con el resultado esperado.');
  }
  return { ok:true, estado:rollback?'FASE4_REVERTIDA':'FASE4_APLICADA',
    archivos:descriptions, modificado:true, base:BASE_COMMIT,
    sha256:sha256(after.ui) };
}
if (require.main === module) {
  const args=process.argv.slice(2);
  const customRoot=args.find(a=>a.startsWith('--root='));
  const root=customRoot ? path.resolve(customRoot.slice('--root='.length)) : path.resolve(__dirname, '..');
  const flags={checkOnly:args.includes('--check'),rollback:args.includes('--rollback')};
  try { console.log('[BLT NOW CX VISITAS FASE4]',JSON.stringify(apply(root,flags),null,2)); }
  catch (e) {console.error('[BLT NOW CX VISITAS FASE4] BLOQUEADO:',e.message);process.exitCode=1;}
}
module.exports = Object.freeze({ apply, plan, buildExpected, readCurrent, classify,
  transformAppF4, transformIndexF4, exactlyOnce, sha256, sha256File,
  BASE_COMMIT, SHA_F3_UI, SHA_F4_UI, FRONT_MARKER, OLD_MODULE_JS, NEW_MODULE_JS });
