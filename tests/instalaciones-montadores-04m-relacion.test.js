'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const service=require('../backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.montadores.service');
const t=service._test;
const base={id_ins_fl:10,id_proyecto:'P1',estatus:'04-M',activo:1,
  subcontratista:'MA MU',fecha_inicio_montaje:'2026-11-12',fecha_fin_montaje_planeado:'2026-12-12'};
const person=(contratista,initials='MA MU')=>({contratista,iniciales:initials,activo:1});
test('04-M: coincidencia de iniciales relaciona un solo contratista, nunca a personas',()=>{
 const r=t.evaluate(base,[person('CONTRATISTA UNO'),person('CONTRATISTA UNO')]);
 assert.equal(r.estado,'IDENTIFICADO');assert.equal(r.contratista,'CONTRATISTA UNO');
 assert.equal(r.vinculable,true);
 assert.equal(Object.prototype.hasOwnProperty.call(r,'id_personal'),false);
});
test('04-M: iniciales compartidas entre contratistas diferentes son ambiguas',()=>{
 assert.equal(t.evaluate(base,[person('Uno'),person('Dos')]).estado,'INICIALES_AMBIGUAS');
});
test('04-M: sin fechas o proyecto o iniciales es revision pendiente',()=>{
 assert.equal(t.evaluate({...base,fecha_inicio_montaje:null},[person('Uno')]).estado,'FECHAS_MONTAJE_INVALIDAS');
 assert.equal(t.evaluate({...base,id_proyecto:null},[person('Uno')]).estado,'PROYECTO_SIN_ID');
 assert.equal(t.evaluate({...base,subcontratista:'-'},[person('Uno')]).estado,'SUBCONTRATISTA_SIN_INICIALES');
});
test('04-M: 06-A, no activo y códigos distintos no generan relacion',()=>{
 assert.equal(t.evaluate({...base,estatus:'06-A'},[person('Uno')]).vinculable,false);
 assert.equal(t.evaluate({...base,activo:0},[person('Uno')]).vinculable,false);
 assert.equal(t.evaluate(base,[person('Uno','OT')]).estado,'SIN_CONTRATISTA_CATALOGO');
});
test('04-M: validacion manual impide iniciales de otro contratista',async()=>{
 const conn={async query(sql){assert.match(sql,/FROM instalaciones_programacion_contratistas_fl/);
   return [[{id_proyecto:'P1',iniciales:'MA MU',contratista:'UNO'}]];}};
 const equipo={id_ins_fl:10,id_proyecto:'P1',estatus:'04-M',subcontratista:'MA MU'};
 await assert.doesNotReject(()=>service.validarAsignacion(conn,equipo,[person('UNO')]));
 await assert.rejects(()=>service.validarAsignacion(conn,equipo,[person('DOS')]),{code:'INT9_MONTAJE_PERSONA_OTRO_CONTRATISTA'});
 await assert.rejects(()=>service.validarAsignacion(conn,{...equipo,subcontratista:'XX'},[person('UNO')]),
   {code:'INT9_MONTAJE_RELACION_DESACTUALIZADA'});
});
