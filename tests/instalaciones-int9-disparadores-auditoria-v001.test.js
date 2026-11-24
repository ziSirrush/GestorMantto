'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const route=file('backend/src/routes/ins-fl.routes.js');
const dashboard=file('backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.service.js');
const administration=file('backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js');
const boot=file('backend/src/bootstrap.js');
const audit=file('backend/src/jobs/instalacionesProgramacionAuditoria.job.js');
test('INT9: Sheets solo envia FL, no dispara reconciliacion de personal',()=>{
  assert.match(route,/return await insFlController\.syncInsFl\(req,res\)/);
  assert.doesNotMatch(route,/ejecutarSyncConAjustadores|ejecutarSyncConMontadores/);
});
test('INT9: ambos guardados humanos concilian por ID tras COMMIT',()=>{
  assert.match(dashboard,/await connection\.commit\(\);[\s\S]*?ajusteInt9\.notifySaved\(id,\[field\]\)/);
  assert.match(dashboard,/montajeInt9\.notifySaved\(id,\[field\]\)/);
  assert.match(administration,/reconciliadorInt9\.notifySaved\(id,Object\.keys\(result\.changes/);
  assert.match(administration,/montajeInt9\.notifySaved\(id,Object\.keys\(result\.changes/);
});
test('INT9: nocturna concilia ambos motores y conserva auditoria final de lectura',()=>{
  assert.match(boot,/require\('\.\/jobs\/instalacionesProgramacionAuditoria\.job'\)/);
  assert.match(audit,/const PAGE=50/);
  assert.match(audit,/WHERE id_ins_fl>\?/);
  const reader=audit.slice(audit.indexOf('async function audit(){'),audit.indexOf('async function reserveDaily('));
  assert.doesNotMatch(reader,/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(reader,/reconcile\(|reconciliarEquipo\(/);
  assert.match(audit,/instalacionesProgramacionPersonal\.job'\)\.scanEquipos/);
  assert.match(audit,/instalacionesProgramacionMontadores\.job'\)\.scanEquipos/);
  assert.match(audit,/const result=await executeDaily\(nowMx\.day\)/);
});
