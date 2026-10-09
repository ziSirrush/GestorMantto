'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const MOD = path.join(ROOT, 'backend/src/modules/instalaciones-administracion');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const policy = require(path.join(MOD, 'instalaciones-administracion.field-policy.js'));

const allFields = [
  'proyecto', 'id_proyecto', 'referencia_sitio', 'estatus', 'numero_equipo_fabrica',
  'tipo_equipo', 'marca', 'modelo', 'cliente', 'estado', 'ciudad', 'activo',
  'id_sup', 'id_asesor', 'id_admin', 'avance_oc', 'presupuesto_mantenimiento_cem'
];

const queries=[];
let nextConnection;
const mockDb={
  query: async (sql,values)=>{
    queries.push({sql,values});
    return [[{id_ins_fl:42,proyecto:'Visible',updated_at:'2026-10-08'}]];
  },
  getConnection: async ()=>nextConnection
};
const originalLoad = Module._load;
let repository;
try {
  Module._load = function(request,parent,isMain){
    if(parent?.filename?.endsWith('instalaciones-administracion.repository.js')){
      if(request==='../../config/db')return mockDb;
      if(request==='./instalaciones-administracion.constants')return {ALL_OPERATIONAL_FIELDS_COR:allFields};
    }
    return originalLoad.call(this,request,parent,isMain);
  };
  repository=require(path.join(MOD,'instalaciones-administracion.repository.js'));
} finally {Module._load=originalLoad;}

function connectionFixture(initial){
  const data={...initial};const calls=[];
  const conn={
    calls,
    beginTransaction:async()=>calls.push('BEGIN'),
    commit:async()=>calls.push('COMMIT'),
    rollback:async()=>calls.push('ROLLBACK'),
    release:()=>calls.push('RELEASE'),
    query:async (sql,values)=>{
      calls.push({sql,values});
      if(/UPDATE ins_fl/.test(sql)){
        const fields=[...sql.matchAll(/`(\w+)` = \?/g)].map(m=>m[1]);
        fields.forEach((field,i)=>{data[field]=values[i];});
        return [{affectedRows:1}];
      }
      if(/SELECT f\.\*/.test(sql))return [[{...data}]];
      return [[]];
    }
  };
  return conn;
}

test('fecha real ISO estricta: rechaza 31 febrero y acepta anio bisiesto',()=>{
  assert.equal(policy.validDate_cor('2028-02-29'),true);
  assert.equal(policy.validDate_cor('2026-02-29'),false);
  assert.equal(policy.validDate_cor('2026-02-31'),false);
  assert.equal(policy.validDate_cor('10/10/2026'),false);
  assert.deepEqual(policy.normalizeEditedFields_cor({fecha_entrega_cliente:'2026-10-08'}),{fecha_entrega_cliente:'2026-10-08'});
});

test('porcentajes y montos: rangos, dos decimales, valores null',()=>{
  assert.deepEqual(policy.normalizeEditedFields_cor({avance_oc:'98.50%',costo_mensual_mantenimiento_cem:'1200.00',avance_mo:null}),{
    avance_oc:'98.5%',costo_mensual_mantenimiento_cem:'1200',avance_mo:null
  });
  assert.throws(()=>policy.normalizeEditedFields_cor({avance_oc:'100.01%'}),{statusCode:400});
  assert.throws(()=>policy.normalizeEditedFields_cor({avance_oc:'21.999%'}),{statusCode:400});
  assert.throws(()=>policy.normalizeEditedFields_cor({presupuesto_mantenimiento_cem:'-1'}),{statusCode:400});
  assert.throws(()=>policy.normalizeEditedFields_cor({fecha_inicio_montaje:'2026-13-01'}),{statusCode:400});
});

test('metadatos de formularios incluyen selects, booleanos, fechas, porcentajes y montos',()=>{
  assert.equal(policy.fieldMeta_cor('id_sup').kind,'user');
  assert.equal(policy.fieldMeta_cor('activo').kind,'boolean');
  assert.equal(policy.fieldMeta_cor('avance_aj').kind,'percent');
  assert.equal(policy.fieldMeta_cor('fecha_visita').kind,'date');
  assert.equal(policy.fieldMeta_cor('costo_mensual_mantenimiento_cem').kind,'money');
  assert.equal(policy.fieldMeta_cor('comentarios_fl').kind,'textarea');
});

test('busqueda respeta proyeccion visible y no utiliza columnas sin permiso',async()=>{
  queries.length=0;
  await repository.searchRecords_cor({scope:{mode:'ALL'},search:'contacto',limit:25,visibleFields:['estatus']});
  assert.equal(queries.length,0,'No debe permitir buscar por campos sin permiso de lectura.');
  await repository.searchRecords_cor({scope:{mode:'ALL'},search:'Cliente',limit:25,visibleFields:['cliente']});
  assert.equal(queries.length,1);
  assert.match(queries[0].sql,/f\.`cliente` LIKE \?/);
  assert.doesNotMatch(queries[0].sql,/f\.`proyecto` LIKE \?/);
  assert.doesNotMatch(queries[0].sql,/f\.`numero_equipo_fabrica` LIKE \?/);
  assert.doesNotMatch(queries[0].sql,/f\.id_asesor\s+IN/);
});

test('un scope LIMITED sin personas visibles es fail closed',()=>{
  assert.match(repository.scopeClause_cor({mode:'LIMITED',advisorIds:[]}).sql,/1 = 0/);
});

test('concurrencia: detecta un valor anterior obsoleto sin escribir ni auditar',async()=>{
  const conn=connectionFixture({id_ins_fl:42,estatus:'Modificado por otra persona'});
  nextConnection=conn;let auditCount=0;
  await assert.rejects(()=>repository.updateRecordById_cor({
    id:42,scope:{mode:'ALL'},changes:{estatus:'Nuevo'},expected:{estatus:'Original'},
    beforeCommit:async()=>{auditCount++;}
  }),{statusCode:409,code:'INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA'});
  assert.equal(auditCount,0);
  assert.ok(conn.calls.includes('ROLLBACK'));
  assert.equal(conn.calls.some(x=>typeof x==='object'&&/UPDATE ins_fl/.test(x.sql)),false);
});

test('guardado parcial: solo columna modificada y auditoria antes de COMMIT',async()=>{
  const conn=connectionFixture({id_ins_fl:42,estatus:'Antes',cliente:'Sin cambio',id_asesor:8});
  nextConnection=conn;let audited;
  const result=await repository.updateRecordById_cor({
    id:42,scope:{mode:'ALL'},changes:{estatus:'Despues',cliente:'Sin cambio'},
    expected:{estatus:'Antes',cliente:'Sin cambio'},
    beforeCommit:async data=>{audited=data;conn.calls.push('AUDIT');}
  });
  assert.equal(result.changed,true);
  assert.deepEqual(Object.keys(result.changes),['estatus']);
  assert.equal(audited.after.estatus,'Despues');
  const update=conn.calls.find(x=>typeof x==='object'&&/UPDATE ins_fl/.test(x.sql));
  assert.match(update.sql,/`estatus` = \?/);
  assert.doesNotMatch(update.sql,/`cliente` = \?/);
  assert.ok(conn.calls.indexOf('AUDIT')<conn.calls.indexOf('COMMIT'));
});

test('sin diferencia no hace UPDATE ni registra auditoria',async()=>{
  const conn=connectionFixture({id_ins_fl:42,estatus:'Ok'});
  nextConnection=conn;let count=0;
  const result=await repository.updateRecordById_cor({
    id:42,scope:{mode:'ALL'},changes:{estatus:'Ok'},expected:{estatus:'Ok'},
    beforeCommit:async()=>{count++;}
  });
  assert.equal(result.changed,false);assert.equal(count,0);
  assert.equal(conn.calls.some(x=>typeof x==='object'&&/UPDATE ins_fl/.test(x.sql)),false);
});

test('si auditoria falla, rollback de UPDATE en la misma conexion',async()=>{
  const conn=connectionFixture({id_ins_fl:42,estatus:'Antes'});
  nextConnection=conn;
  await assert.rejects(()=>repository.updateRecordById_cor({
    id:42,scope:{mode:'ALL'},changes:{estatus:'Nuevo'},expected:{estatus:'Antes'},
    beforeCommit:async()=>{throw new Error('Audit write failure');}
  }),/Audit write failure/);
  assert.ok(conn.calls.includes('ROLLBACK'));
  assert.ok(!conn.calls.includes('COMMIT'));
});

test('frontend FIX3 usa autoguardado por campo y expected del valor mostrado',()=>{
  const js=read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');
  const html=read('modules/instalaciones-administracion/instalaciones-administracion_cor.html');
  const css=read('modules/instalaciones-administracion/instalaciones-administracion-form_cor.css');
  assert.match(js,/method:'PATCH'/);
  assert.match(js,/JSON\.stringify\(\{changes:\{\[field\]:job\.value\},expected:\{\[field\]:before\}\}\)/);
  assert.match(js,/\/grupos\/'\+encodeURIComponent\(group\.key\)/);
  assert.match(js,/window\.ManttoAuth\.api/);
  assert.match(js,/st\.touched\.add\(field\)/);
  assert.match(js,/ROOT\+'\/registros\/'\+encodeURIComponent\(id\)/);
  assert.match(js,/st\.conflict=true/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.match(html,/iadm-cor-form_cor\.css|instalaciones-administracion-form_cor\.css/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('router impone CORELLIAN + INSTALACIONES y EDITAR por grupo',()=>{
  const route=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js');
  assert.match(route,/domain: 'CORELLIAN'/);
  assert.match(route,/groupingCodesAny: \['INSTALACIONES'\]/);
  assert.match(route,/hasEffectivePermission\(userId, codes\.edit\)/);
  assert.match(route,/router\.patch\(/);
});
