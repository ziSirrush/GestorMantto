'use strict';

const path = require('path');
const Module = require('module');

const backendRoot = path.resolve(__dirname, '..');
const middlewareTarget = path.join(
  backendRoot,
  'src',
  'middleware',
  'information-access-gnral.middleware.js'
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let permissionSet = new Set();
let doorMap = new Map();
let groupingQueries = 0;

const groupingRows = {
  OPERACION: {
    id_agrupacion: 1,
    codigo: 'OPERACION',
    nombre: 'Operacion',
    empresa: 'UNITED',
    orden: 1,
    activo: 1
  },
  PORTAFOLIO: {
    id_agrupacion: 2,
    codigo: 'PORTAFOLIO',
    nombre: 'Portafolio',
    empresa: 'UNITED',
    orden: 2,
    activo: 1
  }
};

const connection = {
  async query(sql, params) {
    if (/FROM perm_agrupaciones/.test(sql)) {
      groupingQueries++;
      const key = String(params && params[0] || '').trim();
      const row = groupingRows[key] || null;
      return [row ? [row] : []];
    }
    throw new Error(`Consulta inesperada en mock: ${String(sql).slice(0, 120)}`);
  },
  release() {}
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (parent && parent.filename === middlewareTarget) {
    if (request === '../config/db') {
      return { getConnection: async () => connection };
    }
    if (request === './auth.middleware') {
      return { requireAuth: (req, res, next) => next() };
    }
    if (request === '../services/permissions/effective-permission.service') {
      return {
        hasEffectivePermission: async (userId, permissionCode) => (
          Number(userId) === 81 && permissionSet.has(permissionCode)
        )
      };
    }
    if (request === '../services/alcance/alcance-gnral.service') {
      return {
        GENERAL_COMPANY: 'GENERAL',
        resolveAlcanceGnral_gnral: () => ({ motor: 'GENERAL', empresa: 'GENERAL' })
      };
    }
    if (request === '../services/alcance/alcance-cor.service') {
      return { CORELLIAN_COMPANY: 'CORELLIAN' };
    }
    if (request === '../services/alcance/alcance-uni.service') {
      return { UNITED_COMPANY: 'UNITED' };
    }
    if (request === '../services/alcance/alcance-resolver.service') {
      return {
        normalizeGroupingCompany_gnral: (value) => String(value || '').trim().toUpperCase(),
        resolveInformationDoor_gnral: async (conn, req, grouping) => ({
          allowed: doorMap.get(grouping.codigo) === true,
          masterAccess: false,
          via: doorMap.get(grouping.codigo) === true ? 'AGRUPACION' : null,
          grouping
        }),
        resolveMasterAccess_gnral: async () => ({ enabled: false }),
        resolveAlcanceByGrouping_gnral: async (conn, req, grouping) => ({
          motor: 'alcance_uni',
          empresa: 'UNITED',
          llave_maestra: false,
          requiere_filtro_zona: true,
          zona_ids: [4],
          zona_codigos: ['CNA-01'],
          agrupacion: grouping
        })
      };
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};

delete require.cache[middlewareTarget];
const middleware = require(middlewareTarget);
Module._load = originalLoad;

function responseHarness() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return body;
    }
  };
}

async function runGuard(options) {
  const req = { method: 'GET', user: { id_SB: 81 } };
  const res = responseHarness();
  let nextCalled = false;
  await middleware.buildInformationAccessGuard_gnral(options)(
    req,
    res,
    () => { nextCalled = true; }
  );
  return { req, res, nextCalled };
}

(async () => {
  // Regresion objetivo: el modo historico debe cortar por permiso ANTES de
  // consultar perm_agrupaciones.
  groupingQueries = 0;
  permissionSet = new Set();
  doorMap = new Map([['OPERACION', true]]);

  let result = await runGuard({
    permissionCode: 'LEGACY.VER',
    domain: 'UNITED',
    groupingCodesAny: ['OPERACION']
  });

  assert(result.nextCalled === false, 'Sin permiso historico no debe autorizar.');
  assert(result.res.statusCode === 403, 'Sin permiso historico debe responder 403.');
  assert(
    result.res.payload && result.res.payload.code === 'FUNCTIONAL_PERMISSION_DENIED',
    'Sin permiso historico debe responder FUNCTIONAL_PERMISSION_DENIED.'
  );
  assert(
    groupingQueries === 0,
    'El modo historico no debe consultar perm_agrupaciones cuando falla el permiso funcional.'
  );

  // Compatibilidad positiva del modo historico.
  groupingQueries = 0;
  permissionSet = new Set(['LEGACY.VER']);
  doorMap = new Map([['OPERACION', true]]);

  result = await runGuard({
    permissionCode: 'LEGACY.VER',
    domain: 'UNITED',
    groupingCodesAny: ['OPERACION']
  });

  assert(result.nextCalled === true, 'Permiso + puerta historicos deben seguir autorizando.');
  assert(groupingQueries === 1, 'Con permiso valido debe resolverse la agrupacion historica.');
  assert(
    result.req.informationAccess.permission_code === 'LEGACY.VER',
    'El contexto historico debe conservar el permiso concedido.'
  );
  assert(
    result.req.informationAccess.agrupacion.codigo === 'OPERACION',
    'El contexto historico debe conservar la agrupacion autorizada.'
  );

  // El modo emparejado F3/F4 debe conservar la proteccion contra cruces.
  groupingQueries = 0;
  permissionSet = new Set(['PORT.VER']);
  doorMap = new Map([['OPERACION', true], ['PORTAFOLIO', false]]);

  result = await runGuard({
    domain: 'UNITED',
    groupingPermissionPairsAny: [
      { groupingCode: 'OPERACION', permissionCodesAny: ['OP.VER'] },
      { groupingCode: 'PORTAFOLIO', permissionCodesAny: ['PORT.VER'] }
    ]
  });

  assert(result.nextCalled === false, 'El modo emparejado no debe cruzar permiso y puerta.');
  assert(
    result.res.payload && result.res.payload.code === 'INFORMATION_ACCESS_DENIED',
    'Permiso PORTAFOLIO + puerta OPERACION debe seguir fallando por puerta del mismo par.'
  );

  // Modo emparejado positivo.
  permissionSet = new Set(['PORT.VER']);
  doorMap = new Map([['OPERACION', false], ['PORTAFOLIO', true]]);

  result = await runGuard({
    domain: 'UNITED',
    groupingPermissionPairsAny: [
      { groupingCode: 'OPERACION', permissionCodesAny: ['OP.VER'] },
      { groupingCode: 'PORTAFOLIO', permissionCodesAny: ['PORT.VER'] }
    ]
  });

  assert(result.nextCalled === true, 'PORTAFOLIO + PORTAFOLIO debe seguir autorizando.');
  assert(
    result.req.informationAccess.agrupacion.codigo === 'PORTAFOLIO',
    'El modo emparejado debe conservar la agrupacion PORTAFOLIO.'
  );

  console.log('FIX_GUARD_HISTORICO_ORDEN_PERMISO_V001: OK');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error.stack || error.message || error);
  process.exit(1);
});
