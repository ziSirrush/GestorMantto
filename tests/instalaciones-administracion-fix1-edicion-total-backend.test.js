'use strict';
// [Aster | 2026-10-09 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001]
// QA local, aislada. No conecta a Aiven/Azure ni modifica Github.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'backend/src/modules/instalaciones-administracion');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const constants = require(path.join(DIR, 'instalaciones-administracion.constants.js'));
const validation = require(path.join(DIR, 'instalaciones-administracion.validation.js'));
const sql = read('database/FIX_1_INSTALACIONES_ADMINISTRACION_PERMISO_TOTAL_V001.sql');

function withMocks(filename, stubs) {
  const full = path.join(DIR, filename);
  delete require.cache[full];
  const old = Module._load;
  try {
    Module._load = function(request, parent, isMain) {
      if (parent?.filename === full && Object.hasOwn(stubs, request)) return stubs[request];
      return old.call(this, request, parent, isMain);
    };
    return require(full);
  } finally {
    Module._load = old;
  }
}

const ACCESS = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const EDIT = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR';

test('FIX1: 11 grupos y 93 campos operativos editables; identificadores tecnicos intactos', () => {
  assert.equal(constants.ACCESS_PERMISSION_COR, ACCESS);
  assert.equal(constants.FULL_EDIT_PERMISSION_COR, EDIT);
  assert.equal(Object.keys(constants.GROUPS_COR).length, 11);
  assert.equal(constants.ALL_OPERATIONAL_FIELDS_COR.length, 93);
  assert.equal(new Set(constants.ALL_OPERATIONAL_FIELDS_COR).size, 93);
  const contract = validation.publicContract_cor();
  assert.equal(contract.reduce((acc, group) => acc + group.editable_fields.length, 0), 93);
  assert.ok(contract.every(group => group.pending_policy_fields.length === 0));
  assert.deepEqual(constants.SYSTEM_READONLY_FIELDS_COR, ['id_ins_fl', 'created_at', 'updated_at']);
  for (const f of constants.SYSTEM_READONLY_FIELDS_COR) {
    assert.equal(constants.ALL_OPERATIONAL_FIELDS_COR.includes(f), false);
  }
});

test('FIX1: permiso EDITAR es global, explicitamente diferente de ACCESO_VISUAL y ajeno a roles hardcodeados', () => {
  for (const group of Object.keys(constants.GROUPS_COR)) {
    assert.equal(constants.GROUP_PERMISSIONS_COR[group].view, ACCESS);
    assert.equal(constants.GROUP_PERMISSIONS_COR[group].edit, EDIT);
  }
  const service = read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js');
  const routes = read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js');
  assert.match(service, /hasEffectivePermission\(userId, FULL_EDIT_PERMISSION_COR\)/);
  assert.match(service, /hasEffectivePermission\(userId, ACCESS_PERMISSION_COR\)/);
  assert.match(routes, /humanInformationGuard_gnral/);
  assert.match(routes, /domain:\s*'CORELLIAN'/);
  assert.match(routes, /groupingCodesAny:\s*\['INSTALACIONES'\]/);
  assert.match(routes, /hasEffectivePermission\(userId, codes\.edit\)/);
  assert.doesNotMatch(service, /rol\s*===?\s*['"]Admin Instalaciones/);
});

test('FIX1: proyecto, referencia y derivados editables individualmente bajo validacion', () => {
  assert.deepEqual(validation.normalizeGroupUpdate_cor('proyecto', {
    changes: { id_proyecto: 'P100', referencia_sitio: 'Elevador 01' }
  }), { id_proyecto: 'P100', referencia_sitio: 'Elevador 01' });
  assert.deepEqual(validation.normalizeGroupUpdate_cor('seguimiento', {
    changes: { dias_sin_visita: '5', dias_sin_ccnr: '20' }
  }), { dias_sin_visita: '5', dias_sin_ccnr: '20' });
  assert.equal(validation.normalizeGroupUpdate_cor('montaje', { changes: { dias_restantes: '3' } }).dias_restantes, '3');
  assert.equal(validation.normalizeGroupUpdate_cor('entrega_garantia_mantenimiento', {
    changes: { meses_garantia_restantes: '6' }
  }).meses_garantia_restantes, '6');
});

test('FIX1: campos tecnicos, longitud, FK de usuario, valores invalidos y grupo errado siguen cerrados', () => {
  assert.throws(() => validation.normalizeGroupUpdate_cor('proyecto', { changes: { id_ins_fl: 99 } }), {
    code: 'INSTALACIONES_ADMINISTRACION_CAMPO_SOLO_LECTURA', statusCode: 400
  });
  assert.throws(() => validation.normalizeGroupUpdate_cor('proyecto', { changes: { id_proyecto: 'X'.repeat(101) } }), {
    code: 'INSTALACIONES_ADMINISTRACION_VALOR_LARGO', statusCode: 400
  });
  assert.throws(() => validation.normalizeGroupUpdate_cor('responsables', { changes: { id_sup: 'abc' } }), {
    code: 'INSTALACIONES_ADMINISTRACION_VALOR_INVALIDO', statusCode: 400
  });
  assert.throws(() => validation.normalizeGroupUpdate_cor('equipo', { changes: { correo_supervisor: 'x' } }), {
    code: 'INSTALACIONES_ADMINISTRACION_CAMPO_FUERA_GRUPO', statusCode: 400
  });
  assert.throws(() => validation.normalizeGroupUpdate_cor('proyecto', { changes: { id_proyecto: { injection: true } } }), {
    code: 'INSTALACIONES_ADMINISTRACION_VALOR_INVALIDO', statusCode: 400
  });
});

function fixture() {
  let allowed = code => code === ACCESS || code === EDIT;
  const checks = [], audits = [], writes = [];
  const row = { id_ins_fl: 7, id_proyecto: 'P100', referencia_sitio: 'A01',
    proyecto: 'Edificio Uno', estatus: 'En proceso', dias_restantes: '10',
    created_at: '2026-01-01', updated_at: '2026-02-01' };
  const fakeRepository = {
    getRecordById_cor: async ({id, scope}) => {
      assert.equal(id, 7);
      assert.deepEqual(scope, {mode:'LIMITED',advisorIds:[100]});
      return {...row};
    },
    updateRecordById_cor: async ({id, changes, expected, scope, beforeCommit}) => {
      writes.push({id,changes,expected,scope});
      assert.equal(id,7);
      const before={...row};
      for (const [f,v] of Object.entries(changes)) {
        if (String(before[f])!==String(expected[f])) {
          const e = new Error('Cambios en paralelo');e.statusCode=409;
          e.code='INSTALACIONES_ADMINISTRACION_CONFLICTO_CONCURRENCIA';
          throw e;
        }
        row[f]=v;
      }
      await beforeCommit({connection:{sameTransaction:true},before,after:{...row},changes});
      return {found:true,changed:true,changes,after:{...row},before};
    },
    listExistingActiveUsers_cor: async ids => ids,
    listActiveUsers_cor: async () => [],
    updateProjectBatch_cor: async () => {throw new Error('El test no debe llegar a base en cambios de identidad masiva');}
  };
  const service = withMocks('instalaciones-administracion.service.js', {
    '../../config/db': {},
    '../ventas/ventas-visibility.service': {
      resolveVisibilityScope: async()=>({mode:'LIMITED',advisorIds:[100]})
    },
    '../../services/permissions/effective-permission.service': {
      hasEffectivePermission: async(_id,code) => {checks.push(code); return allowed(code);}
    },
    './instalaciones-administracion.repository': fakeRepository,
    './instalaciones-administracion.audit-service': {
      recordGroupUpdate_cor: async(_req,payload)=>{
        assert.equal(payload.executor.sameTransaction,true);
        audits.push(payload);
        return {id_interaccion: audits.length};
      }
    }
  });
  const req={contextUser:{id_SB:100},viewerContext:{active:false}};
  return {service,req,row,checks,audits,writes, allow: f => {allowed=f;}};
}

test('FIX1: contrato resuelve permisos de modulo solo 2 veces y expone 93 editables', async () => {
  const {service,req,checks} = fixture();
  const contract=await service.getContract_cor(req);
  assert.equal(checks.length,2);
  assert.deepEqual(new Set(checks),new Set([ACCESS,EDIT]));
  assert.equal(contract.groups.length,11);
  assert.equal(contract.groups.reduce((a,g)=>a+g.editable_fields.length,0),93);
  assert.ok(contract.groups.every(g=>g.permissions.can_edit&&g.permissions.can_view));
  assert.equal(contract.full_edit_permission,EDIT);
  assert.deepEqual(contract.system_readonly_fields,['id_ins_fl','created_at','updated_at']);
});

test('FIX1: permiso de lectura NO habilita editar y EDITAR sin ACCESO_VISUAL tampoco', async () => {
  const f=fixture();
  f.allow(c=>c===ACCESS);
  const groups=await f.service.resolveGroupPermissions_cor(f.req);
  // ACCESO_VISUAL solo no autoriza ningun dato de grupo si faltan los VER historicos.
  assert.ok(Object.values(groups).every(g=>!g.can_view&&!g.can_edit));
  f.allow(c=>c===ACCESS||c===constants.LEGACY_GROUP_PERMISSIONS_COR.proyecto.view);
  const limited=await f.service.resolveGroupPermissions_cor(f.req);
  assert.equal(limited.proyecto.can_view,true);
  assert.equal(limited.seguimiento.can_view,false);
  assert.ok(Object.values(limited).every(g=>!g.can_edit));
  await assert.rejects(()=>f.service.ensureGroupEditPermission_cor(f.req,'proyecto'), {
    statusCode:403, code:'INSTALACIONES_ADMINISTRACION_EDICION_DENEGADA'
  });
  f.allow(c=>c===EDIT);
  await assert.rejects(()=>f.service.getContract_cor(f.req), {
    statusCode:403, code:'INSTALACIONES_ADMINISTRACION_ACCESO_DENEGADO'
  });
  await assert.rejects(()=>f.service.ensureGroupEditPermission_cor(f.req,'seguimiento'), {
    statusCode:403, code:'INSTALACIONES_ADMINISTRACION_ACCESO_DENEGADO'
  });
  assert.equal(f.writes.length,0);
});

test('FIX1: Visor siempre se mantiene solo lectura y rechaza PATCH aun con permiso EDITAR', async () => {
  const f=fixture();
  const viewer={...f.req,viewerContext:{active:true}};
  const groups=await f.service.resolveGroupPermissions_cor(viewer);
  assert.ok(Object.values(groups).every(g=>g.can_view&&!g.can_edit));
  await assert.rejects(()=>f.service.updateGroup_cor(viewer,7,'proyecto',{
    changes:{estatus:'Terminado'},expected:{estatus:'En proceso'}
  }), {statusCode:403, code:'INSTALACIONES_ADMINISTRACION_VISOR_SOLO_LECTURA'});
  assert.equal(f.writes.length,0);
});

test('FIX1: guardado individual de identidad y campo derivado, expected + auditoria atomica sin fuga', async () => {
  const f=fixture();
  const result=await f.service.updateDetail_cor(f.req,7,{groups:{
    proyecto:{changes:{referencia_sitio:'A02'},expected:{referencia_sitio:'A01'}},
    montaje:{changes:{dias_restantes:'8'},expected:{dias_restantes:'10'}}
  }});
  assert.equal(result.changed,true);
  assert.deepEqual(result.changed_groups,['proyecto','montaje']);
  assert.deepEqual(result.changed_fields,['referencia_sitio','dias_restantes']);
  assert.equal(f.writes.length,1);
  assert.deepEqual(f.writes[0].scope,{mode:'LIMITED',advisorIds:[100]});
  assert.equal(f.audits.length,2);
  assert.deepEqual(Object.keys(f.audits[0].changes),['referencia_sitio']);
  assert.deepEqual(Object.keys(f.audits[1].changes),['dias_restantes']);
  assert.equal(Object.hasOwn(result,'data'),false);
  assert.equal(Object.hasOwn(result,'after'),false);
});

test('FIX1: lote rechaza id_proyecto y referencia_sitio antes de abrir transaccion',()=>{
  const f=fixture();
  for(const field of ['id_proyecto','referencia_sitio']) {
    const raw={ids:[7,8],groups:{proyecto:{changes:{[field]:'Nuevo'}}},
      expected:{7:{[field]:'A'},8:{[field]:'B'}}};
    assert.throws(()=>f.service.normalizeMultiUpdate_cor('P:P100',raw), {
      statusCode:409, code:'INSTALACIONES_ADMINISTRACION_IDENTIDAD_INDIVIDUAL'
    });
  }
  assert.equal(f.writes.length,0);
});

test('FIX1: conflicto UNIQUE en ins_fl hace rollback y responde 409 sin SQL interno',async()=>{
  let rollbacks=0,commits=0;
  const db={getConnection:async()=>({
    beginTransaction:async()=>{},
    query:async(sql)=>{
      if (/SELECT f\.\*/.test(sql)) return [[{id_ins_fl:7,id_proyecto:'P100',referencia_sitio:'A01'}]];
      if (/UPDATE ins_fl/.test(sql)) {
        const e=new Error('Duplicate entry secret');e.code='ER_DUP_ENTRY';throw e;
      }
      throw Error('SQL no simulado');
    },
    rollback:async()=>{rollbacks++;},commit:async()=>{commits++;},release:()=>{}
  })};
  const repository=withMocks('instalaciones-administracion.repository.js',{
    '../../config/db':db,
    './instalaciones-administracion.constants':constants
  });
  await assert.rejects(()=>repository.updateRecordById_cor({
    id:7,scope:{mode:'ALL'},changes:{referencia_sitio:'A02'},expected:{referencia_sitio:'A01'}
  }), e => e.statusCode===409 && e.code==='INSTALACIONES_ADMINISTRACION_REFERENCIA_DUPLICADA' &&
      !e.message.includes('secret'));
  assert.equal(rollbacks,1);
  assert.equal(commits,0);
});

test('FIX1: SQL registra solo un permiso sobre estructura existente y no asigna a roles/usuarios',()=>{
  assert.match(sql,/INSERT INTO perm_subelemento_acciones/);
  assert.match(sql,/INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO\.EDITAR/);
  assert.match(sql,/WHERE ps\.codigo = 'INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO'/);
  assert.match(sql,/pg\.codigo = 'INSTALACIONES'/);
  assert.doesNotMatch(sql,/pg\.empresa = 'CORELLIAN'/);
  assert.doesNotMatch(sql,/\bCREATE TABLE\b|\bALTER TABLE\b|\bDROP TABLE\b/i);
  assert.doesNotMatch(sql,/INSERT INTO (rol_permisos|usuario_permisos)/i);
  assert.match(sql,/COMMIT;/);
});
