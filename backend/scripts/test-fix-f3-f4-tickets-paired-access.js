'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const repoRoot = path.resolve(__dirname, '..');
const middlewareTarget = path.join(repoRoot, 'src', 'middleware', 'information-access-gnral.middleware.js');
const routesTarget = path.join(repoRoot, 'src', 'modules', 'tickets', 'tickets.routes.js');
const consultasTarget = path.join(repoRoot, 'src', 'modules', 'tickets', 'tickets-consultas_uni.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const middlewareSource = fs.readFileSync(middlewareTarget, 'utf8');
const routesSource = fs.readFileSync(routesTarget, 'utf8');
const consultasSource = fs.readFileSync(consultasTarget, 'utf8');

assert(middlewareSource.includes('groupingPermissionPairsAny'), 'El Guard General debe incluir el modo emparejado opt-in.');
assert(middlewareSource.includes('hasFunctionalPermissionInAnyPair'), 'El Guard debe evaluar permiso y puerta dentro del mismo par.');
assert(routesSource.includes("groupingCode: 'OPERACION'"), 'Tickets debe declarar el par OPERACION.');
assert(routesSource.includes("groupingCode: 'PORTAFOLIO'"), 'Tickets debe declarar el par PORTAFOLIO.');
assert(!routesSource.includes("'EXPERIMENTAL'"), 'Experimental no debe participar en F3/F4 Tickets.');
assert(!routesSource.includes('_EXP_ACCESO_VISUAL_MODULO'), 'Permisos visuales Experimental no deben habilitar Tickets F3/F4.');
assert(consultasSource.includes("OR CAST(t.id AS CHAR) = ?"), 'Detalle debe aceptar id interno de BD como referencia.');
assert(consultasSource.includes("OR TRIM(COALESCE(t.id_interno, '')) = ?"), 'Detalle debe aceptar id_interno.');

const originalLoad = Module._load;
let permissionSet = new Set();
let doorMap = new Map();
let unitedMaster = false;

const groupingRows = {
  OPERACION: { id_agrupacion: 1, codigo: 'OPERACION', nombre: 'Operacion', empresa: 'UNITED', orden: 1, activo: 1 },
  PORTAFOLIO: { id_agrupacion: 2, codigo: 'PORTAFOLIO', nombre: 'Portafolio', empresa: 'UNITED', orden: 2, activo: 1 }
};

const connection = {
  async query(sql, params) {
    if (/FROM perm_agrupaciones/.test(sql) && /codigo = \?/.test(sql)) {
      const row = groupingRows[String(params && params[0] || '').trim()] || null;
      return [row ? [row] : []];
    }
    throw new Error('Consulta inesperada en mock del Guard: ' + String(sql).slice(0, 120));
  },
  release() {}
};

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
          allowed: unitedMaster || doorMap.get(grouping.codigo) === true,
          masterAccess: unitedMaster,
          via: unitedMaster ? 'DOMINIO_COMPLETO' : (doorMap.get(grouping.codigo) === true ? 'DIRECT' : null),
          grouping
        }),
        resolveMasterAccess_gnral: async () => ({ enabled: unitedMaster }),
        resolveAlcanceByGrouping_gnral: async (conn, req, grouping, options) => ({
          motor: 'UNITED',
          empresa: 'UNITED',
          llave_maestra: options && options.masterAccess === true,
          requiere_filtro_zona: !(options && options.masterAccess === true),
          zona_ids: options && options.masterAccess === true ? null : [4, 5, 6],
          zona_codigos: options && options.masterAccess === true ? null : ['CNA-01', 'CNA-02', 'CNA-03'],
          agrupacion: grouping.codigo
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
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return body; }
  };
}

async function runGuard(options) {
  const req = { method: 'GET', user: { id_SB: 81 } };
  const res = responseHarness();
  let nextCalled = false;
  await middleware.buildInformationAccessGuard_gnral(options)(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

const pairedOptions = {
  domain: 'UNITED',
  groupingPermissionPairsAny: [
    { groupingCode: 'OPERACION', permissionCodesAny: ['OP.VER'] },
    { groupingCode: 'PORTAFOLIO', permissionCodesAny: ['PORT.VER'] }
  ]
};

(async () => {
  // Caso critico del fix: permiso PORTAFOLIO + puerta OPERACION no se pueden cruzar.
  permissionSet = new Set(['PORT.VER']);
  doorMap = new Map([['OPERACION', true], ['PORTAFOLIO', false]]);
  unitedMaster = false;
  let result = await runGuard(pairedOptions);
  assert(result.nextCalled === false, 'Permiso PORTAFOLIO + puerta OPERACION debe fallar cerrado.');
  assert(result.res.statusCode === 403, 'El cruce permiso/puerta debe responder 403.');
  assert(result.res.payload && result.res.payload.code === 'INFORMATION_ACCESS_DENIED', 'El rechazo debe ser de puerta informativa del mismo par.');

  // Mismo permiso con su propia puerta: autorizado.
  permissionSet = new Set(['PORT.VER']);
  doorMap = new Map([['OPERACION', false], ['PORTAFOLIO', true]]);
  result = await runGuard(pairedOptions);
  assert(result.nextCalled === true, 'Permiso PORTAFOLIO + puerta PORTAFOLIO debe pasar.');
  assert(result.req.informationAccess.agrupacion.codigo === 'PORTAFOLIO', 'El contexto debe conservar la agrupacion emparejada PORTAFOLIO.');
  assert(result.req.informationAccess.permission_code === 'PORT.VER', 'El contexto debe conservar el permiso del mismo par.');

  // OPERACION con OPERACION: autorizado.
  permissionSet = new Set(['OP.VER']);
  doorMap = new Map([['OPERACION', true], ['PORTAFOLIO', false]]);
  result = await runGuard(pairedOptions);
  assert(result.nextCalled === true, 'Permiso OPERACION + puerta OPERACION debe pasar.');
  assert(result.req.informationAccess.agrupacion.codigo === 'OPERACION', 'El contexto debe conservar OPERACION.');

  // La llave UNITED abre la puerta del mismo par y elimina solo el filtro territorial.
  permissionSet = new Set(['PORT.VER']);
  doorMap = new Map([['OPERACION', false], ['PORTAFOLIO', false]]);
  unitedMaster = true;
  result = await runGuard(pairedOptions);
  assert(result.nextCalled === true, 'DOMINIO_COMPLETO UNITED debe abrir la puerta PORTAFOLIO del permiso concedido.');
  assert(result.req.informationAccess.permission_code === 'PORT.VER', 'La llave no debe cambiar el permiso funcional utilizado.');
  assert(result.req.informationAccess.agrupacion.codigo === 'PORTAFOLIO', 'La llave debe conservar el emparejamiento PORTAFOLIO.');
  assert(result.req.informationAccess.llave_maestra === true, 'El contexto debe conservar DOMINIO_COMPLETO UNITED.');
  assert(result.req.informationAccess.requiere_filtro_zona === false, 'La llave UNITED no debe conservar filtro territorial.');
  assert(result.req.informationAccess.zona_ids === null, 'La llave UNITED no debe depender de zonas asignadas.');

  // Puerta sin permiso funcional: denegacion funcional.
  permissionSet = new Set();
  doorMap = new Map([['OPERACION', true], ['PORTAFOLIO', true]]);
  result = await runGuard(pairedOptions);
  assert(result.nextCalled === false, 'Ninguna puerta debe sustituir el permiso funcional.');
  assert(result.res.payload && result.res.payload.code === 'FUNCTIONAL_PERMISSION_DENIED', 'Sin permiso debe responder FUNCTIONAL_PERMISSION_DENIED.');

  // La misma denegacion funcional aplica aunque DOMINIO_COMPLETO este activo.
  unitedMaster = true;
  result = await runGuard(pairedOptions);
  assert(result.nextCalled === false, 'DOMINIO_COMPLETO no debe autorizar sin permiso funcional.');
  assert(result.res.payload && result.res.payload.code === 'FUNCTIONAL_PERMISSION_DENIED', 'La llave sin permiso debe fallar por permiso funcional.');

  // Compatibilidad: el modo historico sigue funcionando para rutas no migradas.
  unitedMaster = false;
  permissionSet = new Set(['LEGACY.VER']);
  doorMap = new Map([['OPERACION', true]]);
  result = await runGuard({
    permissionCode: 'LEGACY.VER',
    domain: 'UNITED',
    groupingCodesAny: ['OPERACION']
  });
  assert(result.nextCalled === true, 'El modo historico del Guard no debe romperse.');

  // Detalle: los cuatro identificadores deben viajar antes de params de alcance.
  let capturedSql = '';
  let capturedParams = null;
  Module._load = function detailPatchedLoad(request, parent, isMain) {
    if (parent && parent.filename === consultasTarget && request === '../../config/db') {
      return {
        query: async (sql, params) => {
          capturedSql = sql;
          capturedParams = params;
          return [[{
            id: 900,
            ticket: 'T-900',
            id_interno: 'INT-900',
            folio: 'F-900',
            zona: 'CNB-03',
            zona_id_oficial: 4,
            zona_oficial: 'CNA-01'
          }]];
        }
      };
    }
    if (parent && parent.filename === consultasTarget && request === '../../services/information-record-scope-gnral.service') {
      return {
        buildTicketScopeSql_gnral: () => ({ sql: 't.id = ?', params: [900] }),
        zoneIds_gnral: () => [4, 5, 6],
        zoneCodes_gnral: () => ['CNA-01', 'CNA-02', 'CNA-03']
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[consultasTarget];
  const consultas = require(consultasTarget);
  Module._load = originalLoad;

  const detailRes = responseHarness();
  await consultas.getTicketDetalle_uni({ params: { ticket: 'INT-900' } }, detailRes);
  assert(detailRes.statusCode === 200 && detailRes.payload && detailRes.payload.ok === true, 'Detalle simulado debe responder 200.');
  assert(/TRIM\(COALESCE\(t\.ticket, ''\)\) = \?/.test(capturedSql), 'SQL debe buscar por ticket.');
  assert(/CAST\(t\.id AS CHAR\) = \?/.test(capturedSql), 'SQL debe buscar por id.');
  assert(/TRIM\(COALESCE\(t\.folio, ''\)\) = \?/.test(capturedSql), 'SQL debe buscar por folio.');
  assert(/TRIM\(COALESCE\(t\.id_interno, ''\)\) = \?/.test(capturedSql), 'SQL debe buscar por id_interno.');
  assert(JSON.stringify(capturedParams) === JSON.stringify(['INT-900', 'INT-900', 'INT-900', 'INT-900', 900]), 'Detalle debe enviar cuatro referencias y despues parametros de alcance.');
  assert(detailRes.payload.data.zona === 'CNA-01', 'Detalle debe conservar la zona canonica estructurada.');

  console.log('FIX_F3_F4_TICKETS_PERMISO_PUERTA_ID_V001: OK');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error.stack || error.message || error);
  process.exit(1);
});
