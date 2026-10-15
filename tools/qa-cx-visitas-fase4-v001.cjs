'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | FASE4 QA GATE V001]
// Local fail-closed release gate. No SQL/HTTP/network calls; no writes unless
// --report=path is explicitly given. Does not create commits or deploy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const vm = require('node:vm');
const installer = require('./apply-cx-visitas-fase4-v001.cjs');

const files = Object.freeze({
  phase1Sql: [
    'database/00_PRECHECK_FASE_1_CX_VISITAS_V001.sql',
    'database/01_APLICAR_FASE_1_CX_VISITAS_V001.sql',
    'database/02_SMOKE_FASE_1_CX_VISITAS_V001.sql',
    'database/99_ROLLBACK_LOGICO_FASE_1_CX_VISITAS_V001.sql'
  ],
  backend: [
    'backend/src/modules/customer-experience/customer-experience.routes.js',
    'backend/src/modules/customer-experience/customer-experience-visitas.routes.js',
    'backend/src/modules/customer-experience/customer-experience-visitas.controller.js',
    'backend/src/modules/customer-experience/customer-experience-visitas.service.js',
    'backend/src/modules/customer-experience/customer-experience-visitas.repository.js'
  ],
  frontend: [
    'modules/customer-experience-visitas/customer-experience-visitas.js',
    'modules/customer-experience-visitas/customer-experience-visitas.css',
    'core/app.js', 'index.html',
    'tools/apply-cx-visitas-fase3-v001.cjs'
  ],
  brand: ['manifest.json', 'manifest-github.json']
});
const expectedSha = Object.freeze({
  'database/00_PRECHECK_FASE_1_CX_VISITAS_V001.sql': 'a35fa302c2ce81fd90232083ab21f581d670b3acff5990112cceed9119ea9e3c',
  'database/01_APLICAR_FASE_1_CX_VISITAS_V001.sql': 'f24e2a3fe191e6f72e8468ea57aa06e89d6572ad2cace2979a62f5f4a3b3e6c5',
  'database/02_SMOKE_FASE_1_CX_VISITAS_V001.sql': '74158e4ea9d3d679eab631f3997981e53abf8ae3fd50847ba745eb168151f9ab',
  'database/99_ROLLBACK_LOGICO_FASE_1_CX_VISITAS_V001.sql': 'de4d80b2ed200f513db0d773ad9eb13bbc286994ecdcac86283f92cb96f4da2a',
  'backend/src/modules/customer-experience/customer-experience-visitas.routes.js':
    'e19eea044ac0505476ff15408e4578dbaf3975771a577601e3ae159db581a31a',
  'backend/src/modules/customer-experience/customer-experience-visitas.service.js':
    '8bec7cbb1e556725ce4d8861972a3e63a73ae2f0524908be90feee60f3c1bb27',
  'backend/src/modules/customer-experience/customer-experience-visitas.repository.js':
    '9666951b5237b7899e48751d7f0ee1b299507460ca83096ba61f7bd4182c5ebb',
  'backend/src/modules/customer-experience/customer-experience-visitas.controller.js':
    '452637034124591b6e2397cbe717ba70e89d88d66c83d79ba37e2c4040abbb5c',
  'modules/customer-experience-visitas/customer-experience-visitas.js': installer.SHA_F4_UI,
  'modules/customer-experience-visitas/customer-experience-visitas.css':
    'e5c40a99dfe3bdb66a6503496778c398f39374a9b33b1c8dbcbd3134bd',
  'tools/apply-cx-visitas-fase3-v001.cjs':
    'd81201448655f504503d8798df90554b134fa3a77ddaf3ea8f634abe75eb9179'
});
function digest(src) {return crypto.createHash('sha256').update(src).digest('hex');}
function hasOnce(text, fragment) {return text.split(fragment).length===2;}
function inspect(root) {
  const absolute=path.resolve(root),results=[];
  function record(name,ok,detail) {results.push({name,status:ok?'PASS':'FAIL',detail:String(detail||'')});}
  for (const [label, paths] of Object.entries(files)) {
    for(const rel of paths) {
      const file=path.join(absolute,rel),exists=fs.existsSync(file);
      record(`${label}: ${rel}`,exists,exists?'archivo presente':'falta archivo requerido');
      if (!exists) continue;
      const expected=expectedSha[rel];
      if(expected && expected!=='PENDING') {
        const ok=digest(fs.readFileSync(file))===expected;
        record(`sha256: ${rel}`,ok,ok?'integridad OK':'archivo distinto a la version auditada');
      }
    }
  }
  const read = rel => fs.existsSync(path.join(absolute,rel))
    ? fs.readFileSync(path.join(absolute,rel),'utf8') : '';
  const sql = read('database/01_APLICAR_FASE_1_CX_VISITAS_V001.sql');
  record('F1 esquema', sql.includes('CREATE TABLE IF NOT EXISTS cx_visitas (')
    && sql.includes('CREATE TABLE IF NOT EXISTS cx_visitas_historial ('),
  'requiere las dos tablas F1 en Aiven; presencia local no confirma ejecucion');
  const expectedPermissions=['VER','CREAR','EDITAR','DESACTIVAR','VER_HISTORIAL'];
  const backend = read('backend/src/modules/customer-experience/customer-experience-visitas.service.js');
  const api = read('backend/src/modules/customer-experience/customer-experience-visitas.routes.js');
  const mount = read('backend/src/modules/customer-experience/customer-experience.routes.js');
  const ui = read('modules/customer-experience-visitas/customer-experience-visitas.js');
  const index = read('index.html');
  const app = read('core/app.js');
  record('F1/F2 permisos',expectedPermissions.every(action=>
      sql.includes(`'${action}'`) && backend.includes(`CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.${action}`)),
    'acciones deben existir en el catalogo, no se autoconceden');
  record('F2 montaje unico',hasOnce(mount,"router.use('/visitas', visitasRoutes_cor);")
    && hasOnce(mount,"require('./customer-experience-visitas.routes')"),
    'sin duplicar middleware de CX ni tocar Dashboard/Encuestas');
  record('F2 seis rutas',[
    "router.get('/',", "router.get('/:id',", "router.get('/:id/historial',",
    "router.post('/',", "router.patch('/:id',", "router.delete('/:id',"
  ].every(x=>api.includes(x)) && api.includes('CX_VISITAS_API_ENABLED')
     && api.includes('humanInformationGuard_gnral'),
    'JWT/Guard + visual + feature flag; no bypass M2M');
  record('F4 historial por ID',ui.includes('cxv-history-lookup-form') && ui.includes('void showHistory(id)')
    && ui.includes('may(\'history\')'),
    'incluye visitas inactivas con VER_HISTORIAL');
  record('F4 cache frontend',hasOnce(app,"customer-experience-visitas.js?v=20261015-fase4-v001")
    && hasOnce(index,'./core/app.js?v=20261015-cx-visitas-fase4-v001'),
    'versiones nuevas JS -> app; no alterar manifest ni PWA');
  record('BLT NOW y PWA GH',index.includes('<title>BLT NOW</title>')
     && read('manifest.json').includes('"BLT NOW"')
     && read('manifest-github.json').includes('"BLT NOW GH"'),
     'nombre visible BLT NOW; GH solo para instalacion GitHub Pages');
  try {new vm.Script(ui,{filename:'CX_Visitas.js'});new vm.Script(app,{filename:'core/app.js'});
       record('Sintaxis JS de aplicacion',true,'vm.Script PASS');}
  catch(error){record('Sintaxis JS de aplicacion',false,error.message);}
  try {
    const plan=installer.plan(absolute);
    record('F4 integracion exacta',plan.state==='FASE4_APLICADA',plan.state);
  } catch(error) {record('F4 integracion exacta',false,error.message);}
  const failed=results.filter(x=>x.status==='FAIL');
  return {ok:failed.length===0,version:'FASE4_V001',base_commit:installer.BASE_COMMIT,
    servicio_remoto_validado:false, esquema_aiven_validado:false, despliegue_realizado:false,
    tests:results.length,passed:results.length-failed.length,failed:failed.length,checks:results};
}
if(require.main===module) {
  const args=process.argv.slice(2);
  const rootArg=args.find(x=>x.startsWith('--root='));
  const jsonArg=args.find(x=>x.startsWith('--report='));
  const root=rootArg?path.resolve(rootArg.slice(7)):path.resolve(__dirname,'..');
  const report=inspect(root);
  report.checks.forEach(c=>console.log(`[${c.status}] ${c.name}${c.status==='FAIL'?': '+c.detail:''}`));
  console.log(`[F4 GATE] ${report.passed}/${report.tests} | ${report.ok?'PASS':'BLOCKED'}`);
  if(jsonArg){const f=path.resolve(jsonArg.slice(9));fs.writeFileSync(f,JSON.stringify(report,null,2)+'\n');}
  if(!report.ok)process.exitCode=1;
}
module.exports=Object.freeze({inspect,expectedSha,files});
