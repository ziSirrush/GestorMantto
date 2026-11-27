'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const front=fs.readFileSync(path.resolve(__dirname,'../modules/equipos-criticos/equipos-criticos.js'),'utf8');

test('Equipos Críticos usa snapshots paginados ya enriquecidos',()=>{
  assert.match(front,/state\.pro\.rows = Array\.isArray\(data\.data\)/);
  assert.doesNotMatch(front,/\/api\/indicadores\/mtbc\/proyectos/);
  assert.doesNotMatch(front,/\/api\/indicadores\/mtbc\/equipos/);
});

test('U365 es lazy y usa MTBC incluido en criticidad corporativa',()=>{
  assert.match(front,/u365:\{ rows:\[\], expanded:false, loaded:false, loading:false \}/);
  assert.match(front,/if\(opening&&!state\.u365\.loaded/);
  assert.doesNotMatch(front,/enrichEquipmentMtbc_uni/);
});

test('Preferencias iniciales salen de sesión; PATCH de guardado se conserva',()=>{
  const loadStart=front.indexOf('async function loadUserPreferences');
  const loadEnd=front.indexOf('async function saveUserPreferences',loadStart);
  const load=front.slice(loadStart,loadEnd);
  assert.doesNotMatch(load,/\/api\/usuarios\/me\/criticos-preferencias/);
  assert.match(front,/method:'PATCH'/);
});

test('Equipos Críticos Operación elimina las leyendas y conserva el contenido de sus tres tablas y detalle',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../modules/equipos-criticos/equipos-criticos.html'),'utf8');
  const inline=front.match(/const EC_INLINE_HTML = ("(?:[^"\\]|\\.)*");/);
  assert.ok(inline,'Debe mantenerse el HTML de respaldo');
  for(const markup of [html,JSON.parse(inline[1])]){
    assert.doesNotMatch(markup,/estado-leyenda-host-gnral|data-estados-leyenda|data-estado-visual|💥/);
    for(const id of ['ec-eq-body','ec-pro-body','ec-365-body','ec-detail-body','ec-eq-criteria','ec-pro-criteria','ec-eq-apply','ec-365-toggle'])assert.ok(markup.includes('id="'+id+'"'),id);
    for(const label of ['MTBC Año Actual','MTBC U365','Fallas BLT período','Último BLT','Crítico año actual'])assert.ok(markup.includes(label),label);
  }
  assert.doesNotMatch(front,/visualIdentifier|renderIdentifier|codesForTicket|pdfTicketEmojiText|pdfEmojiImage|pdfTicketDidParseCell|pdfTicketDidDrawCell|loadPdfVisualCatalog|data-estados-leyenda/);
  assert.match(front,/loadCriticidadCorporativa\(true\)/);
  assert.match(front,/getCriticos365\(\)/);
  assert.match(front,/isCriticoEquipo\(r\.codigo_equipo\)/);
  assert.match(front,/ManttoDetails\.bindLinks\(body\)/);
  assert.match(front,/ManttoPdf_gnral\.exportReport\(/);
  assert.match(front,/ManttoPdf_gnral\.exportTable\(/);
  assert.match(front,/value:r=>pdfTicketText\(r\)/);
});
