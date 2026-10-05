'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'unit',DB_PASSWORD:'unit',DB_NAME:'unit',DB_SSL:'false'});
const {latestDueTuesday,buildMovements}=require('../backend/src/jobs/logisticaCierreSemanal.job');
const {fileSlot,decorate,isoWeekAtMexico,validateUploadPolicy}=require('../backend/src/modules/logistica-produccion/logistica-produccion.service');

test('el corte vence el martes a las 12:00 de Ciudad de Mexico',()=>{
 const before=latestDueTuesday(new Date('2026-09-01T17:59:00Z'));
 const due=latestDueTuesday(new Date('2026-09-01T18:00:00Z'));
 assert.equal(before.date,'2026-08-25');
 assert.equal(due.date,'2026-09-01');
 assert.equal(due.recovery,false);
});

test('detecta cambio de estatus y nuevo ingreso por id_log_ops',()=>{
 const previous=[{id_log_ops:10,estatus:'EN PRODUCCION'},{id_log_ops:11,estatus:'PROGRAMADO'}];
 const current=[{id_log_ops:10,id_ppns:'P1',proyecto:'Uno',estatus:'ENTREGADO'},{id_log_ops:11,estatus:'PROGRAMADO'},{id_log_ops:12,id_ppns:'P2',proyecto:'Dos',estatus:'EN TRANSITO'}];
 const rows=buildMovements(previous,current,'2026-09-01 12:00:00');
 assert.deepEqual(rows.map(x=>x.tipo),['CAMBIO_ESTATUS','NUEVO_INGRESO']);
 assert.deepEqual(rows.map(x=>x.id_log_ops),[10,12]);
});

test('valida los slots CPVO y GM',()=>{
 assert.deepEqual(fileSlot('cpvo',2),{type:'CPVO',slot:2});
 assert.deepEqual(fileSlot('GM',10),{type:'GM',slot:10});
 assert.throws(()=>fileSlot('CPVO',3),/Slot de archivo inválido/);
 assert.throws(()=>fileSlot('GM',11),/Slot de archivo inválido/);
});

test('el límite de 25 MB se aplica por cada archivo',()=>{
 assert.doesNotThrow(()=>validateUploadPolicy({size:25*1024*1024}));
 assert.throws(()=>validateUploadPolicy({size:(25*1024*1024)+1}),/excede el límite de 25 MB/);
 const sql=fs.readFileSync(path.join(__dirname,'../sql/20260831_LOGISTICA_PRODUCCION_V003.sql'),'utf8');
 assert.match(sql,/chk_log_prod_arch_tamanio_25mb/);
 assert.match(sql,/tamanio_bytes` <= 26214400/);
});

test('expone indicadores y conserva snapshots historicos sin seleccionar fuentes externas',()=>{
 const row=decorate({id_log_ops:null,id_ppns:'',ppns:'',proyecto:'Historico',cpvo_count:0,gm_count:0,archivos_count:0,fecha_pvo:null,fecha_pvo_fl:null,fecha_cubos:null,supervisores:'AA, BB',asesores:'CC',fechas_pvo_fl_fuente:'2026-01-02, 2026-02-03',fechas_cubos_fuente:'2026-03-01, 2026-03-02',visita_count:2,cubos_count:2});
 assert.deepEqual(row.indicadores.map(x=>x.codigo),['FALTA_ARCHIVO_PVO','FALTA_PPNS','FALTAN_DOCS_PROD']);
 assert.equal(row.fuente_operativa,'SNAPSHOT_HISTORICO');
 assert.equal(row.fecha_visita_fuente,null);
 assert.equal(row.fecha_cubos_fuente,null);
 assert.deepEqual(row.instalaciones.fechas_visita,[]);
 assert.deepEqual(row.instalaciones.fechas_cubos,[]);
});

test('semana de registro se calcula en backend',()=>{
 const value=isoWeekAtMexico(new Date('2026-08-31T16:00:00Z'));
 assert.deepEqual(value,{anio:2026,semana:36});
});
