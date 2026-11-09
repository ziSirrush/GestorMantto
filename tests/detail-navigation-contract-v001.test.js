'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const home=read('modules/home/home.js');
const pvo=read('modules/logistica-produccion/logistica-produccion.js');
const cobranza=read('modules/cobranza-uni/cobranza-uni.js');
const resumen=read('modules/resumen-dia/resumen-dia.js');

test('Home/Tareas abre Proyecto y Equipo por la ruta global detalle',()=>{
  assert.match(home,/module:'detalle',type:'proyecto',id:t\.proyecto,source:'home-tarea'/);
  assert.match(home,/module:'detalle',type:'equipo',id:t\.equipo,source:'home-tarea'/);
  assert.doesNotMatch(home,/module:'proyectos',id:t\.proyecto/);
  assert.doesNotMatch(home,/module:'portafolio',id:t\.equipo/);
});

test('PVO abre el proyecto unificado sin pasar por instalaciones-proyectos',()=>{
  assert.match(pvo,/go\('detalle',\{type:'proyecto',id:p\.ppns,projectName:p\.proyecto\|\|p\.ppns,source:'logistica-produccion',template:'cliente-unificado'\}\)/);
  assert.doesNotMatch(pvo,/go\('instalaciones-proyectos',\{id:p\.ppns\}\)/);
});

test('Resumen del Dia no usa Proyectos, Portafolio o Tickets como puente de detalle',()=>{
  assert.match(resumen,/module:'detalle', type:'equipo', id:cod, source:'resumen-dia'/);
  assert.match(resumen,/module:'detalle', type:'proyecto', id:pro, source:'resumen-dia'/);
  assert.match(resumen,/module:'detalle',type:'ticket',id:ticketId,source:'resumen-dia'/);
  assert.doesNotMatch(resumen,/module:'portafolio', id:cod/);
  assert.doesNotMatch(resumen,/module:'proyectos', id:pro/);
  assert.doesNotMatch(resumen,/module:'tickets',id:ticketId/);
});

test('Cobranza UNI navega detalle a detalle y Back usa historial global',()=>{
  assert.doesNotMatch(cobranza,/ManttoRouter\.go\('proyectos'/);
  assert.match(cobranza,/ManttoDetails\.openProyecto\(row\.proyecto,\{source:'gestion_credito'\}\)/);
  assert.match(cobranza,/ManttoRouter\.back\(\{fallbackRoute:ROUTE_GESTION_CREDITO_UNI\}\)/);
  assert.match(cobranza,/ManttoRouter\.back\(\{fallbackRoute:ROUTE_MP_UNI\}\)/);
  assert.match(cobranza,/ManttoRouter\.back\(\{fallbackRoute:ROUTE_VENTA_ADICIONAL_UNI\}\)/);
});

test('Cobranza UNI conserva el identificador al cruzar GC a MP',()=>{
  assert.match(cobranza,/ManttoRouter\.go\(ROUTE_MP_UNI,\{id_dmp:id,id:id,source:'gestion_credito_relacion'\}\)/);
  assert.doesNotMatch(cobranza,/ManttoRouter\.go\(ROUTE_MP_UNI\);/);
});

test('GC directo por id no carga el main antes del detalle',()=>{
  assert.match(cobranza,/if\(requestedGcId>0\)\{\s*openDetail_uni\(requestedGcId\);\s*return true;\s*\}/);
  assert.match(cobranza,/else state_uni\.rows\.push\(Object\.assign\(\{\},payload\.gestion_credito\)\)/);
});

test('MP directo no destruye detailId durante su carga',()=>{
  assert.match(cobranza,/if\(!row\)\{\s*if\(mpState_uni\.detailLoading\) return;/);
  assert.doesNotMatch(cobranza,/if\(!row\)\{ mpState_uni\.detailId=null; renderMpMain_uni\(\); return; \}/);
});
