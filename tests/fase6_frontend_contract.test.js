'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const loader=read('core/module-loader.js');
const js=read('modules/ventas-proyectos-interes/ventas-proyectos-interes.js');
const html=read('modules/ventas-proyectos-interes/ventas-proyectos-interes.html');
const ps=read('APLICAR_FASE_6.ps1');

assert(loader.includes("'ventas-proyectos-interes'"));
assert(loader.includes('20260830-fase6-v001'));
assert(js.includes('const PAGE_SIZE=30'));
assert(js.includes('/api/ventas/cotizaciones/proyectos-interes?'));
assert(js.includes("window.ManttoRouter.go('ventas-cotizaciones-detalle'"));
assert(js.includes("mantto:ventas-cotizacion-actualizada"));
assert(js.includes("detail.tipo!=='proyecto_interes'"));
assert(html.includes('Proyectos de interés'));
assert(html.includes('Lista personal'));
assert(ps.includes('data-route="ventas-proyectos-interes"'));
assert(ps.includes('data-permission="ventas_cotizaciones"'));
assert(ps.includes("if(route==='ventas-proyectos-interes' && showVentasProyectosInteres()) return;"));
assert(ps.includes('view-ventas-proyectos-interes'));
console.log('OK fase6_frontend_contract');
