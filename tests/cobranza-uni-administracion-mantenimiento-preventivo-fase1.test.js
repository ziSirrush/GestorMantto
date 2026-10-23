'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_1_V001]
// Solo contratos puros: sin API, Aiven, GAS, DDL ni mutaciones remotas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants');

const MP = 'detalle_mp_2026';
const ZONE = 'detalle_mp_2026_zona_1';
const byName = Object.fromEntries(c.MP_COLUMNS_UNI.map(col => [col.name,col]));
const zoneByName = Object.fromEntries(c.MP_ZONE1_COLUMNS_UNI.map(col => [col.name,col]));

test('MP F1: contrato activo MP con 20 columnas y solo tres tablas en Main', () => {
  assert.deepEqual(Object.keys(c.TABLES_UNI), ['gestion_credito','pc',MP]);
  assert.equal(c.TABLES_UNI[MP].schemaReady,true);
  assert.equal(c.TABLES_UNI[MP].primaryKey,'id_dmp');
  assert.equal(c.getTableContract_uni(MP).columns,c.MP_COLUMNS_UNI);
  assert.equal(c.MP_COLUMNS_UNI.length,20);
  assert.equal(new Set(c.MP_COLUMNS_UNI.map(x=>x.name)).size,20);
  assert.ok(!Object.hasOwn(c.TABLES_UNI,ZONE),'Zona 1 es hija MP, no otro menu');
  assert.equal(c.GC_COLUMNS_UNI.length,29);
  assert.equal(c.PC_COLUMNS_UNI.length,31);
});

test('MP F1: PK, FK, ALTER y tipos SQL preservados', () => {
  assert.equal(byName.id_dmp.sqlType,'bigint');
  assert.equal(byName.id_dmp.nullable,false);
  assert.equal(byName.id_proyecto_cobranza.sqlType,'bigint unsigned');
  assert.equal(byName.id_proyecto_cobranza.nullable,true);
  assert.equal(byName.factor_monto_anual.sqlType,'smallint unsigned');
  assert.equal(byName.factor_monto_anual.nullable,true);
  const order=c.MP_COLUMNS_UNI.map(col=>col.name);
  assert.equal(order[order.indexOf('iguala')+1],'factor_monto_anual');
  for(const n of ['iguala','monto_anual','pendiente_corriente','pendiente_vencido','pendiente']) {
    assert.equal(byName[n].sqlType,'decimal(18,2)',n);
  }
  assert.equal(byName.facturas_pendientes.sqlType,'int');
  assert.deepEqual(c.MP_FOREIGN_KEY_UNI,{
    name:'fk_dmp_cobranza_proyecto',field:'id_proyecto_cobranza',
    referencesTable:'cobranza_proyectos',referencesField:'id_proyecto_cobranza',
    onDelete:'RESTRICT',onUpdate:'CASCADE'
  });
});

test('MP F1: encabezados de la hoja principal A:R, PK y Activo correctos', () => {
  assert.equal(c.MP_SHEET_HEADERS_UNI.length,18);
  assert.deepEqual(c.MP_SHEET_HEADERS_UNI[0],['A','Consecutivo','id_dmp']);
  assert.deepEqual(c.MP_SHEET_HEADERS_UNI[2],['C','PROYECTO','proyecto']);
  assert.deepEqual(c.MP_SHEET_HEADERS_UNI[3],['D','ID','idns']);
  assert.deepEqual(c.MP_SHEET_HEADERS_UNI[17],['R','Activo','estatus_cartera']);
  assert.equal(byName.factor_monto_anual.sheetColumn,null);
  assert.equal(byName.id_proyecto_cobranza.sheetColumn,null);
  assert.equal(byName.estatus_cartera.sheetColumn,'R');
  assert.equal(new Set(c.MP_SHEET_HEADERS_UNI.map(x=>x[2])).size,18);
});

test('MP F1: los seis BUSCARV conservan indices exactos de B:P', () => {
  const list=c.MP_LOOKUP_SHEET_UNI;
  assert.equal(list.sourceTable,ZONE);
  assert.equal(list.originalRange,'B:P');
  assert.equal(list.originalKey,'PROYECTO');
  assert.equal(list.runtimeJoinKey,'id_dmp');
  assert.equal(list.rejectAmbiguous,true);
  assert.deepEqual(list.rules.map(x=>[x.sheetColumn,x.sourceIndex,x.target]),[
    ['K',9,'iguala'],['L',10,'condiciones_pago'],
    ['N',12,'pendiente_corriente'],['O',13,'pendiente_vencido'],
    ['P',14,'pendiente'],['Q',15,'facturas_pendientes']
  ]);
  for(const item of list.rules){
    const sourceHeader = c.MP_ZONE1_SHEET_HEADERS_UNI[item.sourceIndex];
    assert.equal(sourceHeader.name,item.sourceColumn,`B:P indice ${item.sourceIndex}`);
    assert.equal(byName[item.target].kind,'derived');
    assert.equal(byName[item.target].editable,false);
    assert.equal(byName[item.target].derivesFrom,ZONE+'.'+item.sourceColumn);
    assert.match(item.formula,/^=BUSCARV\(\$C5,/);
  }
});

test('MP F1: monto anual usa factor NULL sin inventar x12 ni sobrescribir legado',()=>{
  assert.equal(c.MP_FORMULAS_UNI.monto_anual.historicalFormula,'=K5*6');
  assert.equal(c.MP_FORMULAS_UNI.monto_anual.expression,'iguala * factor_monto_anual');
  assert.equal(c.MP_FORMULAS_UNI.monto_anual.nullFactorPolicy,'preserve_stored_value');
  assert.deepEqual(c.MP_FORMULAS_UNI.monto_anual.dependencies,['iguala','factor_monto_anual']);
  assert.equal(c.MP_FORMULAS_UNI.monto_anual.enabledForWrite,false);
  assert.equal(byName.monto_anual.editable,false);
  assert.equal(byName.factor_monto_anual.editable,true);
  assert.equal(c.MP_DERIVED_FIELDS_UNI.length,7);
  assert.equal(c.MP_EDITABLE_FIELDS_UNI.length,11);
  assert.deepEqual(c.MP_PROTECTED_FIELDS_UNI,['id_dmp','id_proyecto_cobranza']);
});

test('MP F1: Zona 1 tiene 128 columnas: 4 tecnicas, 16 generales, 12 por 9',()=>{
  assert.equal(c.MP_ZONE1_META_UNI.table,ZONE);
  assert.equal(c.MP_ZONE1_META_UNI.primaryKey,'id_mp_zona_1');
  assert.equal(c.MP_ZONE1_META_UNI.invoiceBlocks,12);
  assert.equal(c.MP_ZONE1_META_UNI.fieldsPerBlock,9);
  assert.equal(c.MP_ZONE1_META_UNI.generalFields,16);
  assert.equal(c.MP_ZONE1_SHEET_HEADERS_UNI.length,124);
  assert.equal(c.MP_ZONE1_COLUMNS_UNI.length,128);
  assert.equal(new Set(c.MP_ZONE1_COLUMNS_UNI.map(x=>x.name)).size,128);
  assert.deepEqual(c.MP_ZONE1_COLUMNS_UNI.slice(0,2).map(x=>x.name),['id_mp_zona_1','id_dmp']);
  assert.deepEqual(c.MP_ZONE1_COLUMNS_UNI.slice(-2).map(x=>x.name),['created_at','updated_at']);
  assert.equal(zoneByName.id_dmp.sqlType,'bigint');
  assert.equal(zoneByName.id_mp_zona_1.sqlType,'bigint unsigned');
  assert.equal(zoneByName.facturacion_01.sqlType,'varchar(150)');
  assert.equal(zoneByName.fecha_pago_12.sqlType,'date');
  assert.equal(zoneByName.dias_vencimiento_12.sqlType,'int');
});

test('MP F1: 12 bloques sin duplicar nombres SQL; variaciones de Sheets conservadas',()=>{
  assert.equal(c.MP_ZONE1_SHEET_HEADERS_UNI[0].name,'zona_adm');
  assert.equal(c.MP_ZONE1_SHEET_HEADERS_UNI[1].name,'proyecto');
  assert.equal(c.MP_ZONE1_SHEET_HEADERS_UNI[2].name,'idns');
  assert.equal(c.MP_ZONE1_SHEET_HEADERS_UNI[9].name,'iguala');
  assert.equal(c.MP_ZONE1_SHEET_HEADERS_UNI[15].name,'facturas_pendientes');
  const sheetByField=Object.fromEntries(c.MP_ZONE1_SHEET_HEADERS_UNI.map(x=>[x.name,x]));
  for(let block=1;block<=12;block++){
    const suffix=String(block).padStart(2,'0');
    for(const base of c.MP_ZONE1_BLOCK_BASE_UNI){
      assert.ok(sheetByField[base[0]+'_'+suffix],base[0]+'_'+suffix);
    }
  }
  assert.equal(sheetByField.forma_pago_01.sheetHeader,'FOMA DE PAGO');
  assert.equal(sheetByField.estatus_factura_04.sheetHeader,'ESTATUS DE FACTURA');
  assert.equal(sheetByField.fecha_factura_07.sheetHeader,'FECHA DE FACTURA');
  assert.equal(sheetByField.forma_pago_12.sheetColumn,'DT');
  assert.equal(zoneByName.fecha_factura_01.editable,false);
  assert.equal(zoneByName.dias_vencimiento_01.kind,'source_pending_rules');
});

test('MP F1: Zona 1 esta vinculada 1:1 y no se puede enlazar por nombre',()=>{
  const fk=c.MP_ZONE1_FOREIGN_KEY_UNI;
  assert.equal(fk.field,'id_dmp');
  assert.equal(fk.referencesTable,MP);
  assert.equal(fk.referencesField,'id_dmp');
  assert.equal(fk.onDelete,'RESTRICT');
  assert.equal(fk.onUpdate,'CASCADE');
  assert.equal(fk.unique,true);
  assert.equal(fk.nullable,true);
  assert.equal(c.MP_ZONE1_META_UNI.requiresVerifiedIdDmp,true);
  assert.equal(c.MP_RULES_UNI.identityJoin,'id_dmp_verified');
  assert.equal(c.MP_RULES_UNI.denyUnmatchedZone1,true);
});

test('MP F1: Activo/Inactivo separado de facturas; GAS y escritura inactivos',()=>{
  assert.deepEqual(c.MP_RULES_UNI.statusValues,['Activo','Inactivo']);
  assert.equal(c.MP_RULES_UNI.statusField,'estatus_cartera');
  assert.equal(c.MP_RULES_UNI.statusNullPolicy,'no_automatic_conversion');
  assert.equal(c.MP_RULES_UNI.writesEnabled,false);
  assert.equal(c.MP_RULES_UNI.zone1WritesEnabled,false);
  assert.equal(c.MP_ZONE1_META_UNI.writesEnabled,false);
  assert.equal(c.MP_RULES_UNI.gasSyncRemainsActive,true);
  assert.equal(c.MP_RULES_UNI.independentPermissionView,
    'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.VER');
  assert.equal(c.MP_RULES_UNI.independentPermissionEdit,
    'COBRANZA_UNI_ADMINISTRACION_MANTENIMIENTO_PREVENTIVO.EDITAR');
  const file=path.join(__dirname,'../backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-contract.js');
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/require\(['"](?:mysql2|\.\.\/\.\.\/config\/db)['"]\)/);
  assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE\s+`?detalle_mp_2026|DELETE FROM|ALTER TABLE|CREATE TABLE)\b/i);
  assert.ok(Object.isFrozen(c.MP_ZONE1_COLUMNS_UNI));
  assert.ok(Object.isFrozen(c.MP_ZONE1_COLUMNS_UNI[0]));
  assert.ok(Object.isFrozen(c.MP_RULES_UNI));
});
