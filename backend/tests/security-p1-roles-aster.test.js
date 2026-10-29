'use strict';
// [Aster | 2026-10-29 | ASTER-MG | QA AST-05 ROLE REVOCATION V001]
const test=require('node:test');
const assert=require('node:assert/strict');

// Este test es unitario: no debe importar ni iniciar el pool real de Aiven.
// Sustituimos la dependencia predeterminada unicamente durante la carga del servicio.
const dbPath=require.resolve('../src/config/db');
const priorDbCache=require.cache[dbPath];
require.cache[dbPath]={
  id:dbPath,
  filename:dbPath,
  loaded:true,
  exports:{
    query:async()=>{throw new Error('Se intento consultar la BD real en una prueba aislada.');}
  }
};
let svc;
try {
  svc=require('../src/services/permissions/effective-permission.service');
} finally {
  if(priorDbCache) require.cache[dbPath]=priorDbCache;
  else delete require.cache[dbPath];
}

test('roles inactivos y JWT roleIds no generan permisos heredados',async()=>{
  let got={};
  const db={query:async(sql,params)=>{got={sql,params};return [[{codigo_permiso:'P0',personalizado:null,heredado:0}]];}};
  const out=await svc.listEffectivePermissions(7,['P0'],db,{roleIds:[1,2,999]});
  assert.equal(out.get('P0'),false);
  assert.match(got.sql,/ur\.activo = 1/);
  assert.match(got.sql,/NOT EXISTS \(SELECT 1 FROM usuario_roles ur_any/);
  assert.doesNotMatch(got.sql,/rp\.id_rol IN \(/);
  assert.deepEqual(got.params,[7,7,7,'P0']);
});
test('overrides personales mantienen precedencia frente al rol',async()=>{
  const db={query:async()=>[[{codigo_permiso:'P1',personalizado:0,heredado:1},
                                {codigo_permiso:'P2',personalizado:1,heredado:0}]]};
  const out=await svc.listEffectivePermissions(7,['P1','P2'],db);
  assert.equal(out.get('P1'),false);assert.equal(out.get('P2'),true);
});
test('listar usuarios con permiso excluye rol primario si hay asignaciones',async()=>{
  let sql;
  await svc.listUsersWithEffectivePermission('P', {query:async(s)=>{sql=s;return [[]];}});
  assert.match(sql,/NOT EXISTS \(SELECT 1 FROM usuario_roles ur_any/);
});
