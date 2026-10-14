'use strict';

// Pruebas de contrato del helper de identidad. MySQL simulado, SIN acceso a Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  crearServicioIdentidadProyectoUni,
  construirFiltroIdentidadProyecto_uni,
  SQL_RESOLVER_IDENTIDAD_UNI
} = require('../backend/src/services/cobranza-uni/identidad-proyecto.service');

function filaValida(overrides = {}) {
  return {
    proyecto_mantto: 'CBRE Querétaro',
    id_cobranza_mantto: '80',
    proyecto_cobranza: 'CBRE Querétaro',
    nombres_catalogos_identicos: 1,
    registros_mismo_nombre: 1,
    usos_id_cobranza: 1,
    ids_distintos_portafolio: 1,
    equipos_con_id_contradictorio: 0,
    ...overrides
  };
}

function servicioDeFilas(filas, observador = null) {
  return crearServicioIdentidadProyectoUni({
    consultar: async (sql, params) => {
      if (observador) observador(sql, params);
      return [filas, []];
    }
  });
}

const CBRE = 'CBRE Querétaro';
const validar = (servicio, id = '80', nombre = CBRE) =>
  servicio.resolverIdentidadProyecto_uni({ proyecto: nombre, idProyectoCobranza: id });

test('V001: resuelve un proyecto e ID existentes con respaldo verificable', async () => {
  const servicio = servicioDeFilas([filaValida()]);
  const identidad = await validar(servicio);
  assert.equal(identidad.valido, true);
  assert.equal(identidad.estado, 'VALIDO');
  assert.equal(identidad.proyecto, CBRE);
  assert.equal(identidad.id_proyecto_cobranza, '80');
  assert.equal(Object.isFrozen(identidad), true);
});

test('V001: permite respaldo de nombre cuando la referencia de origen esta NULL', async () => {
  const servicio = servicioDeFilas([filaValida()]);
  const identidad = await validar(servicio, null);
  assert.equal(identidad.estado, 'VALIDO_SIN_ID');
  assert.equal(identidad.valido, true);
  const filtro = construirFiltroIdentidadProyecto_uni('mp', identidad);
  assert.equal(filtro.protegido, true);
  assert.deepEqual(filtro.params, [CBRE, '80']);
  assert.match(filtro.sql, /mp\.id_proyecto_cobranza = \?/);
  assert.match(filtro.sql, /OR mp\.id_proyecto_cobranza IS NULL/);
  assert.match(filtro.sql, /AND \(/);
  assert.match(filtro.sql, /TRIM\(mp\.proyecto\)/);
});

test('V001: IDs repetidos con ceros a la izquierda se comparan sin Number', async () => {
  const servicio = servicioDeFilas([filaValida()]);
  assert.equal((await validar(servicio, '00080')).estado, 'VALIDO');
});

test('V001: BIGINT UNSIGNED sin perdida de precision', async () => {
  const id = '18446744073709551615';
  const servicio = servicioDeFilas([filaValida({ id_cobranza_mantto: id })]);
  const identity = await validar(servicio, id);
  assert.equal(identity.id_proyecto_cobranza, id);
  assert.deepEqual(construirFiltroIdentidadProyecto_uni('pc', identity).params, [CBRE, id]);
});

test('V001: un ID desplazado nunca obtiene un filtro de resultados', async () => {
  const servicio = servicioDeFilas([filaValida()]);
  const identidad = await validar(servicio, '625');
  assert.equal(identidad.estado, 'ID_ORIGEN_CONFLICTO');
  assert.equal(identidad.valido, false);
  assert.deepEqual(construirFiltroIdentidadProyecto_uni('gc', identidad), {
    sql: '1 = 0', params: [], protegido: false
  });
});

test('V001: entradas con ID cero, negativo o valor no entero fallan cerrado', async () => {
  const servicio = servicioDeFilas([filaValida()]);
  for (const id of [0, -1, '80.0', '80 OR 1=1', 80.5, Number.MAX_SAFE_INTEGER + 10, '18446744073709551616']) {
    assert.equal((await validar(servicio, id)).estado, 'ID_ORIGEN_INVALIDO', String(id));
  }
});

test('V001: proyectos no existentes no producen consulta abierta', async () => {
  const servicio = servicioDeFilas([]);
  const resultado = await validar(servicio);
  assert.equal(resultado.estado, 'SIN_MAPEO');
  assert.equal(construirFiltroIdentidadProyecto_uni('va', resultado).sql, '1 = 0');
});

test('V001: nombre ausente e invalido no consultan Aiven', async () => {
  let consultas = 0;
  const servicio = servicioDeFilas([filaValida()], () => { consultas += 1; });
  assert.equal((await servicio.resolverIdentidadProyecto_uni({ proyecto: '' })).estado, 'SIN_NOMBRE');
  assert.equal((await validar(servicio, '80', 'X'.repeat(256))).estado, 'NOMBRE_INVALIDO');
  assert.equal((await validar(servicio, '80', 'X\u0000Y')).estado, 'NOMBRE_INVALIDO');
  assert.equal(consultas, 0);
});

test('V001: coincidencias distintas de un mismo nombre se consideran ambiguas', async () => {
  const servicio = servicioDeFilas([filaValida(), filaValida()]);
  assert.equal((await validar(servicio)).estado, 'NOMBRE_AMBIGUO');
});

test('V001: conteo duplicado del nombre se considera ambiguo', async () => {
  const servicio = servicioDeFilas([filaValida({ registros_mismo_nombre: 2 })]);
  assert.equal((await validar(servicio)).estado, 'NOMBRE_AMBIGUO');
});

test('V001: sin id de Cobranza asociado deja el proyecto pendiente', async () => {
  const servicio = servicioDeFilas([filaValida({ id_cobranza_mantto: null, usos_id_cobranza: 0 })]);
  assert.equal((await validar(servicio)).estado, 'SIN_ID_COBRANZA');
});

test('V001: dos proyectos reutilizando un ID se consideran ambiguos', async () => {
  const servicio = servicioDeFilas([filaValida({ usos_id_cobranza: 2 })]);
  assert.equal((await validar(servicio)).estado, 'ID_COMPARTIDO');
});

test('V001: un ID inexistente en Cobranza impide validar', async () => {
  const servicio = servicioDeFilas([filaValida({ proyecto_cobranza: null, nombres_catalogos_identicos: 0 })]);
  assert.equal((await validar(servicio)).estado, 'CATALOGO_INCOMPLETO');
});

test('V001: diferencia binaria entre los dos catalogos bloquea asociacion', async () => {
  const servicio = servicioDeFilas([filaValida({ proyecto_cobranza: 'CBRE QUERETARO', nombres_catalogos_identicos: 0 })]);
  assert.equal((await validar(servicio)).estado, 'CATALOGOS_CONTRADICTORIOS');
});

test('V001: Portafolio con dos IDs para un mismo nombre falla cerrado', async () => {
  const servicio = servicioDeFilas([filaValida({ ids_distintos_portafolio: 2, equipos_con_id_contradictorio: 4 })]);
  const resultado = await validar(servicio);
  assert.equal(resultado.estado, 'PORTAFOLIO_MULTIPLE_IDS');
  assert.equal(resultado.valido, false);
});

test('V001: Portafolio con un ID distinto a la relacion de catalogos bloquea asociacion', async () => {
  const servicio = servicioDeFilas([filaValida({ ids_distintos_portafolio: 1, equipos_con_id_contradictorio: 1 })]);
  assert.equal((await validar(servicio)).estado, 'PORTAFOLIO_ID_CONFLICTO');
});

test('V001: nombres SQL y valores nunca se concatenan como entrada del usuario', async () => {
  let parametros;
  const servicio = servicioDeFilas([filaValida()], (sql, params) => {
    assert.equal(sql, SQL_RESOLVER_IDENTIDAD_UNI);
    parametros = params;
    assert.match(sql, /TRIM\(\?\)/);
    assert.doesNotMatch(sql, /DROP TABLE/);
  });
  const nombre = "CBRE Querétaro' ; DROP TABLE pc; --";
  await validar(servicio, '80', nombre);
  assert.deepEqual(parametros, [nombre]);
});

test('V001: convierte Portafolio utf8mb3 antes de aplicar la colacion utf8mb4', () => {
  assert.match(SQL_RESOLVER_IDENTIDAD_UNI, /CONVERT\(p\.proyecto USING utf8mb4\)/);
  assert.match(SQL_RESOLVER_IDENTIDAD_UNI, /CONVERT\(p_conflicto\.proyecto USING utf8mb4\)/);
});

test('V001: no acepta SQL inyectado en el alias de tabla', async () => {
  assert.throws(() => construirFiltroIdentidadProyecto_uni('mp; DROP TABLE pc', null), /Alias SQL/);
});

test('V001: un objeto forjado no habilita el filtro aunque sus campos parezcan validos', async () => {
  const falso = { valido: true, estado: 'VALIDO', proyecto: CBRE, id_proyecto_cobranza: '80' };
  assert.equal(construirFiltroIdentidadProyecto_uni('pc', falso).sql, '1 = 0');
});

test('V001: conteos incoherentes en el resultado SQL causan error y no autorizan nada', async () => {
  const servicio = servicioDeFilas([filaValida({ usos_id_cobranza: 'invalido' })]);
  await assert.rejects(validar(servicio), /Conteo no confiable/);
});

test('V001: un error de Aiven se propaga, no se sustituye por una identidad supuesta', async () => {
  const servicio = crearServicioIdentidadProyectoUni({
    consultar: async () => { throw new Error('Conexion ausente'); }
  });
  await assert.rejects(validar(servicio), /Conexion ausente/);
});

test('V001: portafolio con ID nulo no bloquea una relacion corroborada', async () => {
  const servicio = servicioDeFilas([filaValida({ ids_distintos_portafolio: 0, equipos_con_id_contradictorio: 0 })]);
  assert.equal((await validar(servicio)).estado, 'VALIDO');
});
