'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'modules', 'cobranza-cor', 'cobranza-cor-estados-cuenta-pdf.js');
const source = fs.readFileSync(file, 'utf8');

function buildFixture(opts = {}) {
  const text = value => ({ textContent: String(value) });
  const cell = (value, span = 1, classes = []) => ({
    textContent: String(value),
    colSpan: span,
    classList: { contains: name => classes.includes(name) }
  });
  const headerLabels = ['% ME', 'Condición', 'Factura', 'Mon', 'Subtotal', 'IVA', 'Total',
    'Fecha pago', 'Pago M.E.', 'Pago MXN', 'Vencido', 'Por cobrar'];
  const aditivasLabels = ['Cotización', 'Fecha Cot', 'Departamento', 'Equipo', 'Descripción',
    'Estatus trabajos', 'Moneda', 'Total', 'Pagado', 'Pendiente'];
  const row = (cells, classes = []) => ({
    querySelectorAll: selector => selector === 'td' ? cells : [],
    classList: { contains: name => classes.includes(name) }
  });
  const moneyRows = (count, currency) => Array.from({ length: count }, (_, i) => row([
    cell('10%'), cell(i === 0 ? 'Anticipo' : 'Hito ' + (i + 1)),
    cell('CFV-0001'), cell(currency), cell('10,000.00'), cell('1,600.00'),
    cell('11,600.00'), cell('--'), cell('--'), cell('--'), cell('--'),
    cell('11,600.00', 1, ['is-pending'])
  ]));
  const totalRow = currency => row([
    cell('TOTAL ' + currency, 4), cell('10,000.00'), cell('1,600.00'), cell('11,600.00'),
    cell('--'), cell('--'), cell('--'), cell('--'), cell('11,600.00')
  ], ['ccor-ec-total-row']);
  const table = (headers, rows) => ({ querySelectorAll: selector => {
    if (selector === 'thead th') return headers.map(text);
    if (selector === 'tbody tr') return rows;
    return [];
  }});
  const supply = table(headerLabels, moneyRows(opts.supplyRows ?? 2, 'USD').concat(totalRow('USD')));
  const installation = table(headerLabels, moneyRows(opts.installationRows ?? 2, 'MXN').concat(totalRow('MXN')));
  const aditivas = table(aditivasLabels, opts.withAditivas
    ? [row(['COT-2391','18/11/2026','Mantenimiento','Equipo 02',
      'Descripción larga de equipo adicional','Pendiente','MXN','928.00','0.00','928.00'].map(v => cell(v)))]
    : [row([cell('Sin aditivas para este PPNS.', 10)])]);
  const summary = arr => ({querySelectorAll: selector => selector === '.ccor-ec-summary-line'
    ? arr.map(items => ({ children: items.map(value => ({textContent:String(value),querySelector:()=>null})) })) : []});
  const summarizeForeign = opts.foreignCurrencies || [
    ['USD', 'USD 131,829.35', 'USD 31,754.18', 'USD 100,075.17', '24.09%']
  ];
  const values = [
    ['Proyecto', 'TORRE LEONES'],
    ['PPNS', 'P12874'],
    ['Cliente', 'CAGUA CONSTRUCCIONES, S.A. DE C.V.'],
    ['Contractual', '--'], ['Año', '2025']
  ];
  const projectItems = values.map(([name,value]) => ({
    querySelector: selector => selector === 'span' ? text(name) : text(value)
  }));
  const selectorMap = {
    '.ccor-ec-summary-card.is-supply': summary(summarizeForeign),
    '.ccor-ec-summary-card.is-installation': summary([['MXN','1,662,838.20','0.00','1,662,838.20','0%']]),
    '.ccor-ec-account-section.is-supply table': supply,
    '.ccor-ec-account-section.is-installation table': installation,
    '.ccor-ec-account-section.is-aditivas table': aditivas
  };
  const view = {
    querySelector: selector => selectorMap[selector] || null,
    querySelectorAll: selector => selector === '.ccor-ec-project-header > div' ? projectItems : []
  };
  const created = [];
  const images = [];
  class FakePdf {
    constructor(){
      this.pages=opts.pages || 1; this.autoTables=[]; this.texts=[];
      this.images=[]; this.props={}; this.currentPage=1;
      this.internal={pageSize:{getWidth:()=>1190,getHeight:()=>842}};
      created.push(this);
    }
    setProperties(v){this.props=v;} setFont(){} setFontSize(){} setTextColor(){}
    setDrawColor(){} setLineWidth(){} setFillColor(){} roundedRect(){}
    rect(){} line(){}
    addImage(...args){this.images.push(args);}
    splitTextToSize(v){return [String(v)];}
    text(v,x,y,options){this.texts.push({value:v,x,y,options,page:this.currentPage});}
    getNumberOfPages(){return this.pages;}
    setPage(p){this.currentPage=p;}
    addPage(){this.pages+=1;this.currentPage=this.pages;}
    autoTable(config){this.autoTables.push(config);this.lastAutoTable={finalY:config.startY+50};}
    save(filename){this.savedAs=filename;}
  }
  class FakeImage {
    constructor(){this.naturalWidth=389;this.naturalHeight=82;}
    set src(value){images.push(value);queueMicrotask(()=>{this.onload();});}
  }
  const window={
    ManttoRouter:{getCurrent:()=>({route:opts.route || 'cobranza-estados-cuenta'})},
    jspdf:{jsPDF:FakePdf},
    alert: message=>{throw new Error(message);}
  };
  const doc={
    baseURI:'https://zisirrush.github.io/GestorMantto/',readyState:'loading',
    querySelector:selector=>selector==='#view-placeholder .ccor-ec-detail-page'?view:null,
    addEventListener(){},
    createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/png;base64,AAAA'})
  };
  const code=opts.enable === false
    ? source.replace('const PDF_EXPORT_ENABLED_COR=true;', 'const PDF_EXPORT_ENABLED_COR=false;')
    : source;
  vm.runInNewContext(code,{window,document:doc,Image:FakeImage,URL,Promise,queueMicrotask},{timeout:1000});
  return {window,created,images};
}

test('La bandera de QA permite exportar y puede deshabilitarse preventivamente', async () => {
  assert.match(source, /const PDF_EXPORT_ENABLED_COR=true;/);
  assert.match(source, /button\.disabled=!PDF_EXPORT_ENABLED_COR;/);
  assert.match(source, /PDF en revisión/);
  const fixture=buildFixture({enable:false});
  assert.equal(await fixture.window.ManttoCobranzaCorEstadoCuentaPdf.generate(),false);
  assert.equal(fixture.created.length,0);
});

test('El PDF usa jsPDF y logotipo BLT sin impresión ni nuevas consultas financieras', () => {
  assert.doesNotMatch(source,/window\.print\(/);
  assert.doesNotMatch(source,/\bfetch\s*\(|\bManttoHttp\b|XMLHttpRequest|applyFuenteRules_cor|buildFrontendSummary_cor/);
  assert.match(source,/new window\.jspdf\.jsPDF/);
  assert.match(source,/assets\/logo\.png/);
  assert.match(source,/orientation:'landscape'/);
  assert.match(source,/format:'a3'/);
});

test('Elimina los tres recuadros finales, Facturas y Pagos independientes', () => {
  assert.doesNotMatch(source,/drawInfo\(|extractInfo\(|\.ccor-ec-info-grid/);
  assert.doesNotMatch(source,/\.ccor-ec-facturas-section|\.ccor-ec-pagos-section/);
  assert.match(source,/\.ccor-ec-account-section\.is-supply table/);
  assert.match(source,/\.ccor-ec-account-section\.is-installation table/);
});

test('El escenario de un folio con una página conserva solo suministro e instalación',async()=>{
  const f=buildFixture({enable:true});
  assert.equal(await f.window.ManttoCobranzaCorEstadoCuentaPdf.generate(),true);
  const pdf=f.created[0];
  assert.equal(pdf.autoTables.length,2);
  assert.equal(pdf.autoTables[0].head[0][0].content,'SUMINISTRO');
  assert.equal(pdf.autoTables[1].head[0][0].content,'INSTALACIÓN');
  assert.equal(pdf.autoTables[0].head[1].length,12);
  assert.equal(pdf.autoTables[1].head[1].length,12);
  assert.equal(pdf.savedAs,'BLT_NOW_Estado_de_Cuenta_P12874.pdf');
  assert.ok(!pdf.texts.some(call=>/\b1\s*\/\s*1\b/.test(String(call.value))));
  assert.equal(f.images[0],'https://zisirrush.github.io/GestorMantto/assets/logo.png');
});

test('Aditivas aparece solamente cuando contiene registros reales',async()=>{
  const f=buildFixture({enable:true,withAditivas:true});
  assert.equal(await f.window.ManttoCobranzaCorEstadoCuentaPdf.generate(),true);
  const pdf=f.created[0];
  assert.equal(pdf.autoTables.length,3);
  assert.equal(pdf.autoTables[2].head[0][0].content,'ADITIVAS');
  assert.equal(pdf.autoTables[2].head[1].length,10);
  assert.equal(pdf.autoTables[2].body[0][4],'Descripción larga de equipo adicional');
});

test('Dos hojas llevan numeración naranja y sin fecha/URL del navegador',async()=>{
  const f=buildFixture({enable:true,pages:2});
  assert.equal(await f.window.ManttoCobranzaCorEstadoCuentaPdf.generate(),true);
  const calls=f.created[0].texts;
  assert.ok(calls.some(c=>c.value==='1 / 2' && c.page===1));
  assert.ok(calls.some(c=>c.value==='2 / 2' && c.page===2));
  assert.ok(!calls.some(c=>String(c.value).includes('https://zisirrush.github.io')));
});

test('El logotipo es la identidad principal y el título está centrado',async()=>{
  const f=buildFixture({enable:true});
  assert.equal(await f.window.ManttoCobranzaCorEstadoCuentaPdf.generate(),true);
  const pdf=f.created[0];
  const title=pdf.texts.find(v=>v.value==='ESTADO DE CUENTA');
  assert.ok(title);
  assert.equal(title.x,595);
  assert.equal(title.options.align,'center');
  assert.equal(pdf.images.length,1);
  assert.ok(pdf.images[0][4] >= 200);
  assert.equal(pdf.props.subject,'Estado de Cuenta');
  assert.ok(!pdf.texts.some(v=>/cobranza\s*[/·-]\s*corellian/i.test(String(v.value))));
});

test('Suma múltiples monedas sin recalcular el resumen o los saldos',async()=>{
  const f=buildFixture({enable:true,foreignCurrencies:[
    ['USD','USD 10,000','USD 3,000','USD 7,000','30%'],
    ['EUR','EUR 4,000','EUR 1,000','EUR 3,000','25%']
  ]});
  assert.equal(await f.window.ManttoCobranzaCorEstadoCuentaPdf.generate(),true);
  const texts=f.created[0].texts.map(c=>String(c.value));
  assert.ok(texts.includes('EUR'));
  assert.ok(texts.includes('EUR 3,000'));
  assert.ok(texts.includes('USD 7,000'));
});

test('Sin módulo activo no genera ningún documento',async()=>{
  const f=buildFixture({enable:true,route:'home'});
  assert.equal(await f.window.ManttoCobranzaCorEstadoCuentaPdf.generate(),false);
  assert.equal(f.created.length,0);
});