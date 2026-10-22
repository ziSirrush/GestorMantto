'use strict';

const path = require('path');
const Module = require('module');

const backendRoot = path.resolve(__dirname, '..');
const uniTarget = path.join(
  backendRoot,
  'src',
  'services',
  'alcance',
  'alcance-uni.service.js'
);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const uni = require(uniTarget);

async function testUnitedMasterScope() {
  let queries = 0;
  const executor = {
    async query() {
      queries++;
      throw new Error('DOMINIO_COMPLETO UNITED no debe consultar usuario_zop.');
    }
  };

  const scope = await uni.resolveAlcanceUni_uni(
    executor,
    { id_SB: 101 },
    { masterAccess: true }
  );

  assert(queries === 0, 'La llave maestra UNITED consulto zonas inesperadamente.');
  assert(scope.empresa === 'UNITED', 'Empresa UNITED incorrecta.');
  assert(scope.llave_maestra === true, 'No se marco llave_maestra UNITED.');
  assert(scope.modo === 'LLAVE_MAESTRA', 'Modo de llave maestra incorrecto.');
  assert(scope.requiere_filtro_zona === false, 'La llave maestra conserva filtro de zona.');
  assert(scope.zona_ids === null, 'La llave maestra no debe producir zona_ids.');
  assert(scope.zona_codigos === null, 'La llave maestra no debe producir zona_codigos.');
  assert(scope.zonas_operativas === null, 'La llave maestra no debe depender de zonas_operativas.');
  assert(scope.reglas.llave_maestra_ignora_zonas === true, 'La regla maestra no ignora zonas.');
  assert(scope.reglas.permiso_funcional_requerido === true, 'Se perdio el requisito de permiso funcional.');

  const portafolio = uni.buildResolvedPortafolioScopeSql_uni(scope, 'p');
  assert(portafolio.sql === '1 = 1', 'Portafolio no queda irrestricto con llave maestra.');
  assert(portafolio.params.length === 0, 'Portafolio master genero parametros de zona.');

  const ticket = uni.buildResolvedTicketScopeSql_uni(scope, 't');
  assert(ticket.sql === '1 = 1', 'Tickets no quedan irrestrictos con llave maestra.');
  assert(ticket.params.length === 0, 'Tickets master genero parametros de zona.');

  assert(uni.alcanceUniAllowsZone_uni(scope, 999) === true, 'Master UNITED rechazo una zona valida.');
}

async function testUnitedNormalScope() {
  let queries = 0;
  const executor = {
    async query(sql, params) {
      queries++;
      assert(/FROM usuario_zop/.test(sql), 'La consulta normal no uso usuario_zop.');
      assert(Array.isArray(params) && params[0] === 202, 'Usuario incorrecto en consulta de zonas.');
      return [[{
        id_zona: 3,
        zona: 'CENTRO',
        nombre: 'Centro'
      }]];
    }
  };

  const scope = await uni.resolveAlcanceUni_uni(executor, { id_SB: 202 });
  assert(queries === 1, 'El alcance normal debe consultar zonas una vez.');
  assert(scope.llave_maestra === false, 'Usuario normal marcado como master.');
  assert(scope.requiere_filtro_zona === true, 'Usuario normal perdio filtro territorial.');
  assert(scope.zona_ids.length === 1 && scope.zona_ids[0] === 3, 'Zona normal no resuelta.');
  assert(scope.reglas.llave_maestra_ignora_zonas === false, 'Regla normal de zonas alterada.');

  const portafolio = uni.buildResolvedPortafolioScopeSql_uni(scope, 'p');
  assert(portafolio.sql === 'p.zona_id IN (?)', 'Filtro normal de Portafolio cambio.');
  assert(portafolio.params.length === 1 && portafolio.params[0] === 3, 'Parametros normales incorrectos.');
  assert(uni.alcanceUniAllowsZone_uni(scope, 3) === true, 'Zona asignada fue rechazada.');
  assert(uni.alcanceUniAllowsZone_uni(scope, 4) === false, 'Zona no asignada fue autorizada.');
}

async function testUnitedNormalWithoutZonesFailsClosed() {
  const executor = {
    async query() {
      return [[]];
    }
  };
  const scope = await uni.resolveAlcanceUni_uni(executor, { id_SB: 303 });
  const portafolio = uni.buildResolvedPortafolioScopeSql_uni(scope, 'p');
  const ticket = uni.buildResolvedTicketScopeSql_uni(scope, 't');

  assert(portafolio.sql === '1 = 0', 'Usuario normal sin zonas no fallo cerrado en Portafolio.');
  assert(ticket.sql === '1 = 0', 'Usuario normal sin zonas no fallo cerrado en Tickets.');
}







async function main() {
  await testUnitedMasterScope();
  await testUnitedNormalScope();
  await testUnitedNormalWithoutZonesFailsClosed();
  console.log('FIX_UNITED_DOMINIO_COMPLETO_SIN_FILTRO_ZONA_V001: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
