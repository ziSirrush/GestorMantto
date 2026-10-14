'use strict';

// [Mantto Gestor | 2026-10-13 | COBRANZA_UNI_IDENTIDAD_CONSULTAS_FASE_1_V001]
// Capa SOLO LECTURA para resolver una identidad inequívoca antes de relacionar
// GC, MP y PC/VA. No sustituye los guards de alcance, ni el validador FK V001.
// Autoridad: proyectos_mantto.cobranza -> cobranza_proyectos.id_proyecto_cobranza.
// No utiliza coincidencias parciales, alias inferidos ni OR sin validación.

const COLACION_NOMBRE_UNI = 'utf8mb4_0900_as_ci';
const COLACION_EXACTA_UNI = 'utf8mb4_0900_bin';
const MAX_NOMBRE_UNI = 255;
const UINT64_MAX_UNI = 18446744073709551615n;

// Solo se aceptan filtros construidos desde una resolucion real del servicio.
// Un objeto creado a partir de una peticion HTTP no puede simular una identidad.
const identidadesComprobadas_uni = new WeakSet();

// La consulta no autoriza acceso: solo clasifica la identidad del proyecto.
// El guard oficial debe aplicarse adicionalmente al WHERE de cada modulo.
// La igualdad entre catalogos usa el MISMO criterio binario que el SQL V003.
const SQL_RESOLVER_IDENTIDAD_UNI = `
  SELECT
    pm.proyecto AS proyecto_mantto,
    CAST(pm.cobranza AS CHAR) AS id_cobranza_mantto,
    cp.proyecto AS proyecto_cobranza,
    CASE
      WHEN cp.id_proyecto_cobranza IS NOT NULL
       AND pm.proyecto COLLATE ${COLACION_EXACTA_UNI}
         = cp.proyecto COLLATE ${COLACION_EXACTA_UNI}
      THEN 1 ELSE 0
    END AS nombres_catalogos_identicos,
    (
      SELECT COUNT(*)
      FROM proyectos_mantto pm_nombre
      WHERE TRIM(pm_nombre.proyecto) COLLATE ${COLACION_NOMBRE_UNI}
          = TRIM(pm.proyecto) COLLATE ${COLACION_NOMBRE_UNI}
    ) AS registros_mismo_nombre,
    (
      SELECT COUNT(*)
      FROM proyectos_mantto pm_id
      WHERE pm_id.cobranza = pm.cobranza
    ) AS usos_id_cobranza,
    (
      SELECT COUNT(DISTINCT p.id_proyecto_cobranza)
      FROM portafolio p
      WHERE p.id_proyecto_cobranza IS NOT NULL
        AND TRIM(CONVERT(p.proyecto USING utf8mb4)) COLLATE ${COLACION_NOMBRE_UNI}
          = TRIM(pm.proyecto) COLLATE ${COLACION_NOMBRE_UNI}
    ) AS ids_distintos_portafolio,
    (
      SELECT COUNT(*)
      FROM portafolio p_conflicto
      WHERE p_conflicto.id_proyecto_cobranza IS NOT NULL
        AND p_conflicto.id_proyecto_cobranza <> pm.cobranza
        AND TRIM(CONVERT(p_conflicto.proyecto USING utf8mb4)) COLLATE ${COLACION_NOMBRE_UNI}
          = TRIM(pm.proyecto) COLLATE ${COLACION_NOMBRE_UNI}
    ) AS equipos_con_id_contradictorio
  FROM proyectos_mantto pm
  LEFT JOIN cobranza_proyectos cp
    ON cp.id_proyecto_cobranza = pm.cobranza
  WHERE TRIM(pm.proyecto) COLLATE ${COLACION_NOMBRE_UNI}
      = TRIM(?) COLLATE ${COLACION_NOMBRE_UNI}
  ORDER BY pm.proyecto ASC, pm.cobranza ASC
  LIMIT 2
`;

const ESTADOS_NO_VALIDOS_UNI = Object.freeze({
  SIN_NOMBRE: 'El proyecto no tiene nombre consultable.',
  NOMBRE_INVALIDO: 'El nombre del proyecto no es valido.',
  SIN_MAPEO: 'No existe una equivalencia en proyectos_mantto.',
  NOMBRE_AMBIGUO: 'El nombre corresponde a mas de una entrada del catalogo.',
  SIN_ID_COBRANZA: 'proyectos_mantto no tiene un ID de Cobranza asignado.',
  ID_COMPARTIDO: 'Mas de un proyecto reutiliza el mismo ID de Cobranza.',
  CATALOGO_INCOMPLETO: 'El ID no existe en cobranza_proyectos.',
  CATALOGOS_CONTRADICTORIOS: 'El nombre exacto difiere entre ambos catalogos.',
  PORTAFOLIO_MULTIPLE_IDS: 'Un mismo nombre en Portafolio tiene varios IDs de Cobranza.',
  PORTAFOLIO_ID_CONFLICTO: 'El ID de equipos del Portafolio contradice el catalogo.',
  ID_ORIGEN_INVALIDO: 'El ID recibido no es un entero positivo valido.',
  ID_ORIGEN_CONFLICTO: 'El ID recibido no corresponde al proyecto identificado.'
});

function resultadoNoValido_uni(estado, nombreSolicitado, metadatos = {}) {
  return Object.freeze({
    valido: false,
    estado,
    proyecto: nombreSolicitado || null,
    id_proyecto_cobranza: null,
    permitir_nombre_con_fk_nulo: false,
    motivo: ESTADOS_NO_VALIDOS_UNI[estado],
    ...metadatos
  });
}

function idCanonico_uni(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  if (value === null || value === undefined || value === '') return null;
  const texto = String(value).trim();
  if (!/^\d+$/.test(texto)) return null;
  const id = BigInt(texto);
  if (id <= 0n || id > UINT64_MAX_UNI) return null;
  return id.toString();
}

function enteroNoNegativo_uni(value, campo) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Conteo no confiable para ${campo}.`);
  }
  return number;
}

function resolverNombre_uni(value) {
  if (typeof value !== 'string') return null;
  const nombre = value.trim();
  return nombre || null;
}

function validarAliasSql_uni(alias) {
  // Solo identificadores locales, nunca segmentos SQL o nombres de columnas.
  if (typeof alias !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error('Alias SQL de Cobranza United invalido.');
  }
  return alias;
}

/**
 * Para Fases 2 y 3. Retorna `1 = 0` ante un resultado no confiable.
 * Un registro solo entra por (nombre validado Y FK correcto), o por
 * (nombre validado Y FK NULL). Un FK contradictorio nunca entra.
 * El WHERE de permisos y alcance del modulo se agrega con AND aparte.
 */
function construirFiltroIdentidadProyecto_uni(alias, identidad) {
  const tablaAlias = validarAliasSql_uni(alias);
  if (!identidad || !identidadesComprobadas_uni.has(identidad) || identidad.valido !== true ||
      !['VALIDO', 'VALIDO_SIN_ID'].includes(identidad.estado) ||
      !resolverNombre_uni(identidad.proyecto) ||
      !idCanonico_uni(identidad.id_proyecto_cobranza)) {
    return { sql: '1 = 0', params: [], protegido: false };
  }

  const nombre = identidad.proyecto;
  const id = idCanonico_uni(identidad.id_proyecto_cobranza);
  return {
    sql: `(
      TRIM(${tablaAlias}.proyecto) COLLATE ${COLACION_NOMBRE_UNI}
        = TRIM(?) COLLATE ${COLACION_NOMBRE_UNI}
      AND (
        ${tablaAlias}.id_proyecto_cobranza = ?
        OR ${tablaAlias}.id_proyecto_cobranza IS NULL
      )
    )`,
    params: [nombre, id],
    protegido: true
  };
}

/**
 * Inyeccion de consultar para pruebas. La conexion real se crea de forma
 * perezosa: importar este modulo NO conecta con Aiven.
 */
function crearServicioIdentidadProyectoUni({ consultar } = {}) {
  const ejecutar = consultar || ((sql, params) => require('../../config/db').query(sql, params));
  if (typeof ejecutar !== 'function') {
    throw new TypeError('consultar debe ser una funcion.');
  }

  async function resolverIdentidadProyecto_uni({ proyecto, idProyectoCobranza } = {}) {
    const solicitado = resolverNombre_uni(proyecto);
    if (!solicitado) return resultadoNoValido_uni('SIN_NOMBRE', null);
    if (solicitado.length > MAX_NOMBRE_UNI || solicitado.includes('\u0000')) {
      return resultadoNoValido_uni('NOMBRE_INVALIDO', solicitado);
    }

    const [filas] = await ejecutar(SQL_RESOLVER_IDENTIDAD_UNI, [solicitado]);
    if (!Array.isArray(filas)) {
      throw new Error('Respuesta de identidad no confiable desde Aiven.');
    }
    if (filas.length === 0) return resultadoNoValido_uni('SIN_MAPEO', solicitado);
    if (filas.length > 1) return resultadoNoValido_uni('NOMBRE_AMBIGUO', solicitado);

    const fila = filas[0];
    const mismoNombre = enteroNoNegativo_uni(fila.registros_mismo_nombre, 'registros_mismo_nombre');
    const usosId = enteroNoNegativo_uni(fila.usos_id_cobranza, 'usos_id_cobranza');
    const idsPort = enteroNoNegativo_uni(fila.ids_distintos_portafolio, 'ids_distintos_portafolio');
    const diferenciasPort = enteroNoNegativo_uni(fila.equipos_con_id_contradictorio, 'equipos_con_id_contradictorio');
    if (mismoNombre !== 1) return resultadoNoValido_uni('NOMBRE_AMBIGUO', solicitado);

    const idCorrecto = idCanonico_uni(fila.id_cobranza_mantto);
    if (!idCorrecto) return resultadoNoValido_uni('SIN_ID_COBRANZA', solicitado);
    if (usosId !== 1) return resultadoNoValido_uni('ID_COMPARTIDO', solicitado);
    if (!resolverNombre_uni(fila.proyecto_cobranza)) {
      return resultadoNoValido_uni('CATALOGO_INCOMPLETO', solicitado);
    }
    if (Number(fila.nombres_catalogos_identicos) !== 1) {
      return resultadoNoValido_uni('CATALOGOS_CONTRADICTORIOS', solicitado);
    }
    if (idsPort > 1) {
      return resultadoNoValido_uni('PORTAFOLIO_MULTIPLE_IDS', solicitado, { ids_distintos_portafolio: idsPort });
    }
    if (diferenciasPort > 0) {
      return resultadoNoValido_uni('PORTAFOLIO_ID_CONFLICTO', solicitado, { equipos_con_id_contradictorio: diferenciasPort });
    }

    const idAusente = idProyectoCobranza === undefined || idProyectoCobranza === null || idProyectoCobranza === '';
    const idOrigen = idAusente ? null : idCanonico_uni(idProyectoCobranza);
    if (!idAusente && idOrigen === null) {
      return resultadoNoValido_uni('ID_ORIGEN_INVALIDO', solicitado);
    }
    if (idOrigen && idOrigen !== idCorrecto) {
      return resultadoNoValido_uni('ID_ORIGEN_CONFLICTO', solicitado);
    }

    const identidad = Object.freeze({
      valido: true,
      estado: idOrigen ? 'VALIDO' : 'VALIDO_SIN_ID',
      proyecto: fila.proyecto_mantto,
      id_proyecto_cobranza: idCorrecto,
      permitir_nombre_con_fk_nulo: true,
      motivo: 'Identidad comprobada en proyectos_mantto, cobranza_proyectos y Portafolio.'
    });
    identidadesComprobadas_uni.add(identidad);
    return identidad;
  }

  return Object.freeze({
    resolverIdentidadProyecto_uni,
    construirFiltroIdentidadProyecto_uni
  });
}

const defaultServiceUni = crearServicioIdentidadProyectoUni();

module.exports = Object.freeze({
  resolverIdentidadProyecto_uni: defaultServiceUni.resolverIdentidadProyecto_uni,
  construirFiltroIdentidadProyecto_uni,
  crearServicioIdentidadProyectoUni,
  SQL_RESOLVER_IDENTIDAD_UNI
});
