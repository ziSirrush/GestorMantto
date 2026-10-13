'use strict';
/* QA aislado, sin red, sin Aiven, sin cambios en BD. */
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const target=path.resolve(__dirname,'../backend/src/modules/instalaciones-administracion/instalaciones-administracion.tabla-service.js');

const captured=[];
const mocks={
  '../../config/db': {
    async query(sql,params){
      captured.push({sql,params});
      return [[
        {id_ins_fl:16,proyecto:'A',id_proyecto:'P150',referencia_sitio:'E-2',costo_mensual_mantenimiento_cem:'SECRET',created_at:'2026-10-01',updated_at:'2026-10-02'},
        {id_ins_fl:15,proyecto:'A',id_proyecto:'P150',referencia_sitio:'E-1',costo_mensual_mantenimiento_cem:'SECRET',created_at:'2026-10-01',updated_at:'2026-10-02'}
      ]];
    }
  },
  '../ventas/ventas-visibility.service': {
    async resolveVisibilityScope(){return {mode:'LIMITED',advisorIds:[7]};}
  },
  './instalaciones-administracion.service': {
    async getContract_cor(){return {
      groups:[
        {key:'proyecto',permissions:{can_view:true},fields:['proyecto','id_proyecto','referencia_sitio','campo_inyectado']},
        {key:'costos',permissions:{can_view:false},fields:['costo_mensual_mantenimiento_cem']}
      ],
      system_readonly_fields:['id_ins_fl','created_at','updated_at','malicious_field']
    };},
    async listProjectEquipments_cor(_req,projectKey,query){
      assert.equal(projectKey,'P:P150');
      assert.deepEqual(query,{limit:'30',offset:'0'});
      return {data:[{id_ins_fl:15},{id_ins_fl:16}],total:2,limit:30,offset:0};
    }
  },
  './instalaciones-administracion.repository': {
    parseProjectKey_cor(key){assert.equal(key,'P:P150');return {sql:'f.id_proyecto = ?',params:['P150']};},
    scopeClause_cor(scope,alias){assert.equal(alias,'f');assert.deepEqual(scope,{mode:'LIMITED',advisorIds:[7]});return {sql:' AND f.id_sup = ?',params:[7]};}
  },
  './instalaciones-administracion.constants': {
    ALL_OPERATIONAL_FIELDS_COR:['proyecto','id_proyecto','referencia_sitio','costo_mensual_mantenimiento_cem'],
    SYSTEM_READONLY_FIELDS_COR:['id_ins_fl','created_at','updated_at']
  }
};

const real=Module._load;
let subject;
try{
  Module._load=function(request,parent,isMain){
    if(parent?.filename===target&&Object.prototype.hasOwnProperty.call(mocks,request))return mocks[request];
    return real.apply(this,arguments);
  };
  subject=require(target);
}finally{Module._load=real;}

(async()=>{
  const contract=await mocks['./instalaciones-administracion.service'].getContract_cor();
  assert.deepEqual(subject.projectTableColumns_cor(contract),[
    'id_ins_fl','proyecto','id_proyecto','referencia_sitio','created_at','updated_at'
  ]);
  const output=await subject.projectEquipmentTable_cor({user:{id_SB:7}},'P:P150',{limit:'30',offset:'0',q:'ignorado',estatus:'INACTIVO'});
  assert.equal(output.data.length,2);
  assert.deepEqual(output.data.map(row=>row.id_ins_fl),[15,16]);
  assert.equal(output.total,2);
  assert.equal(captured.length,1);
  assert.match(captured[0].sql,/FROM ins_fl f/);
  assert.match(captured[0].sql,/f\.id_ins_fl IN \(\?, \?\)/);
  assert.match(captured[0].sql,/f\.id_proyecto = \?/);
  assert.match(captured[0].sql,/AND f\.id_sup = \?/);
  assert.deepEqual(captured[0].params,[15,16,'P150',7]);
  assert.doesNotMatch(captured[0].sql,/campo_inyectado|costo_mensual_mantenimiento_cem|malicious_field/);
  assert.equal(Object.keys(output).includes('write'),false);
  console.log('PASS - 12 comprobaciones Fase 1 (campos/orden/SQL/scope/solo lectura)');
})().catch(error=>{console.error(error);process.exitCode=1;});
