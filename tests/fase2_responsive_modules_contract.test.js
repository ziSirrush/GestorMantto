const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles/responsive-contract.css'), 'utf8');
const snippet = fs.readFileSync(path.join(root, 'patches/module-loader-style-isolation.js'), 'utf8');
const apply = fs.readFileSync(path.join(root, 'APLICAR_FASE_2_RESPONSIVE_MODULOS.ps1'), 'utf8');

function must(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Falta contrato: ${label || needle}`);
}

must(css, '.view > [class*="-page"]', 'wrapper raiz *-page');
must(css, 'max-width:none!important', 'eliminar max-width rigido del modulo');
must(css, '#view-ventas-prospeccion .vpr-head-actions', 'Prospeccion acciones responsive');
must(css, '#view-ventas-prospeccion .vpr-table-wrap', 'Prospeccion tabla local');
must(css, '#view-ventas-proyeccion .vpr-page', 'Proyeccion scope propio');
must(css, '.view [class*="-table-wrap"]', 'wrapper generico de tabla');
must(css, 'overflow-x:auto', 'scroll horizontal local');

if (/\bzoom\s*:|transform\s*:\s*scale\s*\(/i.test(css)) {
  throw new Error('El contrato no debe usar zoom ni transform:scale para hacer caber modulos.');
}

must(snippet, 'function activateRouteStyles(config)', 'aislamiento CSS lazy');
must(snippet, 'link[data-mantto-lazy="1"]', 'solo CSS lazy');
must(snippet, 'link.disabled=!allowed.has(href)', 'activar solo CSS de ruta actual');
must(snippet, 'await routePromises.get(key)', 'reactivacion al volver a ruta cacheada');
must(snippet, 'activateRouteStyles(config)', 'activar estilos de ruta');

must(apply, '20260831-fase2-responsive-modulos-v001', 'cache bust F2');
must(apply, 'core/module-loader.js', 'parche loader');
must(apply, 'styles/responsive-contract.css', 'contrato global acumulativo');

console.log('OK FASE 2 RESPONSIVE MODULOS');
