const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const files = {
  pros: path.join(root, 'modules/ventas-prospeccion/ventas-prospeccion.css'),
  proy: path.join(root, 'modules/ventas-proyeccion/ventas-proyeccion.css'),
  log: path.join(root, 'modules/dashboard-logistica/dashboard-logistica.css'),
  loader: path.join(root, 'core/module-loader.js')
};

function read(p){ return fs.readFileSync(p, 'utf8'); }
function assert(cond, msg){ if(!cond) throw new Error(msg); }
function gitBlobSha(text){
  const body = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update(Buffer.from(`blob ${body.length}\0`)).update(body).digest('hex');
}
function balancedCss(text, name){
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for(const ch of clean){
    if(ch === '{') depth++;
    if(ch === '}') depth--;
    if(depth < 0) throw new Error(`${name}: llave de cierre sin apertura`);
  }
  assert(depth === 0, `${name}: llaves CSS desbalanceadas (${depth})`);
}

const pros = read(files.pros);
const proy = read(files.proy);
const log = read(files.log);
const loader = read(files.loader);
const marker = '/* [Aster | 2026-08-30 | FIX RESPONSIVE CONFIRMADO';

balancedCss(pros, 'Prospeccion');
balancedCss(proy, 'Proyeccion');
balancedCss(log, 'Dashboard Logistica');

const baselines = [
  [pros, '07b2a5179dd60f833808f27098d16fb64c48b7c3', 'Prospeccion'],
  [proy, '6dc8fd340dea612ededdcfa0efc0c1ba5b379bef', 'Proyeccion'],
  [log, 'f4da9fc3c1e61b938e03961b5464bc54403290b3', 'Dashboard Logistica']
];
for(const [text, sha, name] of baselines){
  assert(text.includes(marker), `${name}: falta marcador del fix`);
  const original = text.split(marker)[0].replace(/\n+$/, '') + '\n';
  assert(gitBlobSha(original) === sha, `${name}: el contenido previo al fix no coincide con main`);
  const fix = marker + text.split(marker)[1];
  assert(!/\bzoom\s*:/.test(fix), `${name}: el fix no debe usar zoom`);
  assert(!/scale\s*\(/.test(fix), `${name}: el fix no debe usar transform scale`);
}

assert(pros.includes('#view-ventas-prospeccion .vpr-table-wrap'), 'Prospeccion: wrapper de tabla no acotado a la view');
assert(pros.includes('overflow-x:auto;'), 'Prospeccion: falta scroll horizontal local');
assert(pros.includes('min-width:860px;'), 'Prospeccion: la tabla debe conservar ancho minimo');
assert(pros.includes('grid-template-columns:repeat(2,minmax(0,1fr));'), 'Prospeccion: falta reacomodo de acciones');

assert(proy.includes('#view-ventas-proyeccion .vpr-page'), 'Proyeccion: reglas no acotadas a la view');
assert(proy.includes('#view-ventas-proyeccion .vpr-table-wrap'), 'Proyeccion: wrapper de tabla no acotado');
assert(proy.includes('min-width:720px;'), 'Proyeccion: la tabla debe conservar ancho minimo');
assert(proy.includes('grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));'), 'Proyeccion: KPI no adaptables');
assert(proy.includes('width:min(900px,calc(100vw - 24px));'), 'Proyeccion: modal no acotado al viewport');

assert(log.includes('#view-logistica-dashboard .dl-page'), 'Dashboard Logistica: falta scope por view');
assert(log.includes('#view-logistica-dashboard .dl-table-wrap'), 'Dashboard Logistica: wrapper de tabla no acotado');
assert(log.includes('min-width:720px;'), 'Dashboard Logistica: tabla sin ancho conservado');
assert(log.includes('grid-template-columns:repeat(3,minmax(0,1fr));'), 'Dashboard Logistica: grid desktop no fluido');
assert(log.includes('grid-template-columns:1fr;'), 'Dashboard Logistica: falta colapso a una columna');

assert(loader.includes("dashboard-logistica.css?v=20260830-responsive-v002"), 'Loader: falta cache-bust Logistica Dashboard');
assert(loader.includes("ventas-proyeccion.css?v=20260830-responsive-v002"), 'Loader: falta cache-bust Ventas Proyeccion');
assert(loader.includes("ventas-prospeccion.css?v=20260830-responsive-v002"), 'Loader: falta cache-bust Ventas Prospeccion');

const loaderBaseline = loader
  .replace('./modules/dashboard-logistica/dashboard-logistica.css?v=20260830-responsive-v002','./modules/dashboard-logistica/dashboard-logistica.css?v=20260710-v003')
  .replace('./modules/ventas-proyeccion/ventas-proyeccion.css?v=20260830-responsive-v002','./modules/ventas-proyeccion/ventas-proyeccion.css?v=20260804-paginado-f2-v001')
  .replace('./modules/ventas-prospeccion/ventas-prospeccion.css?v=20260830-responsive-v002','./modules/ventas-prospeccion/ventas-prospeccion.css?v=20260804-paginado-f2-v001');
assert(gitBlobSha(loaderBaseline) === '308dd276695572b1a57f878e4b2cedbf01525f9c', 'Loader: hubo cambios adicionales al cache-bust de los 3 CSS');

console.log('OK - FIX_RESPONSIVE_3_MODULOS_V001');
console.log('  Ventas.Prospeccion: interfaz responsive + tabla con scroll local');
console.log('  Ventas.Proyeccion: interfaz responsive + scope propio + tabla con scroll local');
console.log('  Logistica.Dashboard: interfaz responsive + modal/grid adaptables + tabla con scroll local');
console.log('  core/module-loader.js: solo 3 cache-bust CSS modificados');
