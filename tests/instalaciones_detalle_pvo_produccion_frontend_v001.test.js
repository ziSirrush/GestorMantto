'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.resolve(__dirname,'..');
const details=fs.readFileSync(path.join(ROOT,'core/details.js'),'utf8');
const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');

function loadHelpers(){
  const marker='  window.ManttoDetails = {';
  assert.ok(details.includes(marker),'No se encontró el punto de exportación de ManttoDetails.');
  const instrumented=details.replace(marker,`  window.__phase2PvoTest={projectPvoPanelHtml,projectPvoDateValues,projectPvoPdfPreviewUrl};\n${marker}`);
  const document={
    addEventListener(){},
    removeEventListener(){},
    getElementById(){return null;},
    querySelectorAll(){return [];},
    contains(){return false;}
  };
  const window={
    requestAnimationFrame(fn){if(typeof fn==='function')fn();},
    clearTimeout(){},
    setTimeout(){},
    addEventListener(){},
    removeEventListener(){}
  };
  const sandbox={window,document,CSS:{escape:value=>String(value)},console,Intl,Date,Map,Set,Promise,Number,String,Math,Array,Object,Boolean,RegExp,Error,JSON,encodeURIComponent,decodeURIComponent};
  vm.runInNewContext(instrumented,sandbox,{filename:'core/details.js'});
  return sandbox.window.__phase2PvoTest;
}

const helpers=loadHelpers();
const sample1={
  id_log_ops:101,
  id_produccion:501,
  proyecto:'Equipos #1 al #5',
  fecha_pvo:'2026-09-10',
  fechas_visita:['2026-09-12','2026-09-13'],
  fechas_cubos:['2026-09-30'],
  fecha_envio_docs_fabrica:'2026-09-11',
  fecha_envio_pago_fabrica:'2026-09-15',
  archivos:[{id_archivo:1,tipo_archivo:'CPVO',numero_archivo:1,nombre_original:'CPVO_1.pdf',mime_type:'application/pdf',extension:'pdf',url_acceso:'https://example.test/cpvo1.pdf'}]
};
const sample2={
  id_log_ops:102,
  id_produccion:502,
  proyecto:'Equipos #6 al #10',
  fecha_pvo:'2026-09-14',
  fechas_visita:['2026-09-16'],
  fechas_cubos:['2026-10-05'],
  fecha_envio_docs_fabrica:'2026-09-15',
  fecha_envio_pago_fabrica:'2026-09-18',
  archivos:[{id_archivo:2,tipo_archivo:'GM',numero_archivo:1,nombre_original:'GM_1.pdf',mime_type:'application/pdf',extension:'pdf',url_acceso:'https://example.test/gm1.pdf'}]
};

test('consulta el endpoint de Fase 1 por PPNS sin convertirlo en una dependencia fatal',()=>{
  assert.ok(details.includes("optionalJson('/api/logistica/produccion/proyecto/'+encodeURIComponent(proyecto)+'/resumen')"));
});

test('el bloque queda entre Bitácora y Equipos del proyecto',()=>{
  assert.ok(details.includes("folderManager+bitacoraObra+pvoProduction+'<section class=\"mg-detail-section\"><h3>Equipos del proyecto</h3>"));
});

test('la tabla es única, solo contiene las cinco fechas y conserva todos los registros',()=>{
  const html=helpers.projectPvoPanelHtml('PPNS-001',[sample1,sample2]);
  assert.equal((html.match(/<table\b/g)||[]).length,1);
  const table=html.slice(html.indexOf('<table'),html.indexOf('</table>')+8);
  for(const header of ['Fecha PVO','Visita','Cubos','Docs Fábrica','Pago Fábrica'])assert.ok(table.includes('>'+header+'<'));
  assert.equal(table.includes('Proyecto'),false);
  assert.equal(table.includes('PPNS'),false);
  assert.equal(table.includes('Equipos #1 al #5'),false);
  assert.equal(table.includes('Equipos #6 al #10'),false);
  assert.equal((table.match(/data-pvo-log-id=/g)||[]).length,2);
  assert.ok(table.includes('10/09/2026'));
  assert.ok(table.includes('12/09/2026'));
  assert.ok(table.includes('13/09/2026'));
  assert.ok(table.includes('18/09/2026'));
});

test('el selector no aparece con un solo registro',()=>{
  const html=helpers.projectPvoPanelHtml('PPNS-001',[sample1]);
  assert.equal(html.includes('mg-pvo-record-select'),false);
  assert.ok(html.includes('Documentación'));
});

test('con dos registros el selector muestra proyecto pero usa id_log_ops como valor',()=>{
  const html=helpers.projectPvoPanelHtml('PPNS-001',[sample1,sample2]);
  assert.ok(html.includes('class="mg-pvo-record-select"'));
  assert.ok(html.includes('<option value="101">Equipos #1 al #5</option>'));
  assert.ok(html.includes('<option value="102">Equipos #6 al #10</option>'));
});

test('el selector solo vuelve a renderizar Documentación y no la tabla',()=>{
  const expected="if(select)select.addEventListener('change',()=>renderProjectPvoDocuments(panel,select.value));";
  assert.ok(details.includes(expected));
  const start=details.indexOf('function initProjectPvoProduction');
  const end=details.indexOf("document.addEventListener('mantto:navigation'",start);
  const block=details.slice(start,end);
  assert.equal(block.includes('projectPvoPanelHtml('),false);
});

test('se crea un solo visor reutilizable y no expone carga, reemplazo, borrado ni descarga',()=>{
  const html=helpers.projectPvoPanelHtml('PPNS-001',[sample1,sample2]);
  assert.equal((html.match(/id="mg-pvo-doc-modal"/g)||[]).length,1);
  assert.equal(html.includes('Descargar'),false);
  assert.equal(html.includes('Cargar'),false);
  assert.equal(html.includes('Eliminar'),false);
  assert.equal(html.includes('Reemplazar'),false);
  assert.ok(html.includes('Abrir documento'));
  const start=details.indexOf('function projectPvoDocumentModalShell');
  const end=details.indexOf('async function openUnifiedClientProject',start);
  const block=details.slice(start,end);
  assert.equal(block.includes("method:'POST'"),false);
  assert.equal(block.includes("method:'PATCH'"),false);
  assert.equal(block.includes("method:'DELETE'"),false);
});

test('el visor PDF usa hoja 1, FitH y scrollbar activo',()=>{
  const url=helpers.projectPvoPdfPreviewUrl('https://example.test/documento.pdf?sig=abc#old');
  assert.equal(url,'https://example.test/documento.pdf?sig=abc#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=1');
});

test('incluye reglas responsive para tabla, documentos y visor',()=>{
  assert.ok(details.includes('@media(max-width:720px){.mg-pvo-table{min-width:650px}'));
  assert.ok(details.includes('.mg-pvo-doc-modal-panel{width:100%;height:calc(100dvh - 8px)'));
  assert.ok(details.includes('touch-action:pan-y pinch-zoom'));
});

test('index actualiza la versión de core/details.js',()=>{
  assert.ok(index.includes('./core/details.js?v=20260925-instalaciones-pvo-produccion-v001'));
  assert.equal(index.includes('./core/details.js?v=20260914-horarios-f2-v001'),false);
});
