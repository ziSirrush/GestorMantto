'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.css'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');
function ok(value,message){if(!value)throw new Error(message);}
let passed=0;
function test(name,fn){fn();passed++;console.log('OK - '+name);}
test('scope detalle aplica border-box integral',()=>{
  ok(css.includes('#view-logistica-produccion-detalle *::before'),'Falta box-sizing scoped al detalle');
  ok(css.includes('box-sizing:border-box'),'Falta border-box');
});
test('controles y carga no pueden exceder el ancho',()=>{
  ok(css.includes('#view-logistica-produccion-detalle .lp-upload input[type="file"]'),'Falta control específico de file input');
  ok(css.includes('width:100%;max-width:100%;min-width:0'),'Falta cierre de ancho en controles');
});
test('resumen movil elimina min-width horizontal',()=>{
  ok(css.includes('.lp-summary-table{display:block;width:100%;min-width:0;table-layout:fixed}'),'Falta resumen móvil fluido');
  ok(css.includes('width:100%!important;max-width:100%;min-width:0;white-space:normal'),'Faltan celdas móviles fluidas');
});
test('modal movil cabe en viewport real',()=>{
  ok(css.includes('.lp-doc-modal-panel{width:100vw;height:100dvh;max-width:100vw;max-height:100dvh;border:0;border-radius:0}'),'Falta modal fullscreen <=480');
  ok(css.includes('.lp-doc-modal-panel{width:100%;height:calc(100dvh - 8px);max-width:100%;max-height:calc(100dvh - 8px);margin:0;border-radius:10px}'),'Falta modal <=760 con border-box');
});
test('cache bust solo CSS PVO V004',()=>{
  const routes=['logistica-produccion','logistica-produccion-nuevo','logistica-produccion-detalle','logistica-pvo','logistica-documentos'];
  for(const route of routes){
    const line=loader.split('\n').find(x=>x.includes(`'${route}':`));
    ok(line&&line.includes('logistica-produccion.css?v=20260924-pvo-detalle-responsive-v004'),`Cache CSS faltante en ${route}`);
    ok(line&&line.includes('logistica-produccion.js?v=20260924-pvo-preview-hoja1-v003'),`JS V003 debe conservarse en ${route}`);
  }
});
console.log(`RESULT ${passed}/5 OK`);
