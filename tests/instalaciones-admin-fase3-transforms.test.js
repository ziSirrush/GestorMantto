'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const inst=require('../installer/aplicar-fase3');

test('Frontend Fase 3 conecta solo la tabla, conserva Main y exige interaccion explicita',()=>{
  const input=`const VERSION_COR='20261013-admin-ghost-fase2-v001';
  // [Aster | 2026-10-13 | ASTER-MG | FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001]
  const ghost=window.ManttoInstalacionesGhost_cor.create({
    announce:status
  });
  function equipmentRows_cor(){return ghost.render();}
  async function loadFilterOptions_cor(){return true;}`;
  const result=inst.transformModule(input);
  assert.match(result,/onSave:saveTableDrafts_cor/);
  assert.match(result,/confirm\('Guardar '/);
  assert.match(result,/saveEngine\.buildPlan/);
  assert.match(result,/saveEngine\.savePlan/);
  assert.match(result,/ghost\.ackSaved/);
  assert.match(result,/isCurrentContext_cor\(epoch\)/);
  assert.match(result,/saveEngine\.savePlan/); // El PATCH esta encapsulado en save_cor.js, no en el editor.
  assert.match(result,/loadTeams_cor\(\)/); // Refresco inmediato.
  assert.throws(()=>inst.transformModule(result),/Ancla/);
});
test('Cambia version solo del bundle de Instalaciones Administracion',()=>{
  const original="'instalaciones-administracion':{css:['./modules/instalaciones-administracion/instalaciones-administracion_cor.css?v=20261008-instalaciones-administracion-fase3-v001','./modules/instalaciones-administracion/instalaciones-administracion-tabla_cor.css?v=20261012-fase1-v001','./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css?v=20261013-fase2-v001'],js:['./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js?v=20261013-fase2-v001','./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261013-fase2-v001']},";
  const updated=inst.transformLoader('PREFIX;'+original+';SUFFIX');
  assert.match(updated,/save_cor\.js\?v=20261013-fase3-v001/);
  assert.ok(updated.indexOf('save_cor.js')<updated.indexOf('ghost_cor.js'));
  assert.ok(updated.indexOf('ghost_cor.js')<updated.indexOf('administracion_cor.js'));
  assert.match(updated,/PREFIX/);assert.match(updated,/SUFFIX/);
  const index=inst.transformIndex('<script src="./core/module-loader.js?v=20261013-instalaciones-administracion-ghost-fase2-v001"></script>');
  assert.match(index,/guardado-fase3/);
});
test('Backend PATCH usa Guard existente, controlador y proyecto dentro de scope',()=>{
  const route=inst.transformRoutes(`router.patch(\n  '/administracion/proyectos/:projectKey/equipos/edicion-multiple',`);
  assert.match(route,/\.\.\.accessGuard_cor/);
  assert.match(route,/equipos\/:id\/tabla/);
  assert.match(route,/controller\.updateTableEquipment_cor/);
  const ctrl=inst.transformController(`// [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
module.exports = {
  updateDetail_cor,
  updateMulti_cor,
};`);
  assert.match(ctrl,/projectKey:req\.params\.projectKey/);
  assert.match(ctrl,/updateTableEquipment_cor,/);
  const svc=inst.transformService(`async function updateDetail_cor(req, idValue, body = {}) {
  const groupKeys = Object.keys(payload.selected);

  // El mismo permiso EDITAR gobierna
  const result = await repository.updateRecordById_cor({
    id, scope, changes: payload.changes, expected: payload.expected,
  });
}`);
  assert.match(svc,/resolveGroupPermissions_cor\(req\)/);
  assert.match(svc,/visible\?\.proyecto\?\.can_view/);
  assert.match(svc,/repository\.parseProjectKey_cor\(options.projectKey\)/);
  assert.match(svc,/id, scope, projectKey, changes:/);
});
test('Repositorio aplica pertenencia al proyecto durante SELECT ... FOR UPDATE',async()=>{
  const base=`const db={};
  function scopeClause_cor(scope, alias = 'f') {return {sql:' AND f.id_sup = ?',params:[10]};}
  function parseProjectKey_cor(key) {if(key==='P:77')return {sql:'f.id_proyecto = ?',params:['77']};throw Error('bad key');}
  async function getRecordById_cor({ id, scope, connection = db, forUpdate = false }) {
  const scoped = scopeClause_cor(scope, 'f');
  const [rows] = await connection.query(
    \`SELECT f.*
       FROM ins_fl f
      WHERE f.id_ins_fl = ?
      \${scoped.sql}
      LIMIT 1\${forUpdate ? ' FOR UPDATE' : ''}\`,
    [id, ...scoped.params]
  );
  return rows[0] || null;
}
async function updateRecordById_cor({ id, scope, changes, expected, beforeCommit }) {
    const before = await getRecordById_cor({
      id,
      scope,
      connection: conn,
      forUpdate: true
    });
}`;
  const result=inst.transformRepository(base);
  assert.match(result,/projectKey, \/\/ Fase 3/);
  assert.match(result,/projectKey = null/);
  const context={};vm.runInNewContext(result.replace('const db={};','const db={};'),context);
  const q=[];
  const connection={query:async(sql,params)=>{q.push({sql,params});return [[{id_ins_fl:8,id_proyecto:'77'}]];}};
  const row=await vm.runInNewContext('getRecordById_cor',context)({id:8,scope:{},connection,forUpdate:true,projectKey:'P:77'});
  assert.equal(row.id_ins_fl,8);
  assert.match(q[0].sql,/AND f.id_proyecto = \?/);
  assert.match(q[0].sql,/AND f.id_sup = \?/);
  assert.match(q[0].sql,/FOR UPDATE/);
  assert.deepEqual(Array.from(q[0].params),[8,'77',10]);
  q.length=0;
  await vm.runInNewContext('getRecordById_cor',context)({id:8,scope:{},connection});
  assert.doesNotMatch(q[0].sql,/id_proyecto = \?/);
  assert.deepEqual(Array.from(q[0].params),[8,10]);
});
test('No acepta anclas ambiguas, sin sobrescrituras silenciosas',()=>{
  assert.throws(()=>inst.replaceOnce('abcabc','abc','z','demo'),/Ancla ambigua/);
  assert.throws(()=>inst.replaceOnce('xyz','abc','z','demo'),/Ancla ambigua/);
});
