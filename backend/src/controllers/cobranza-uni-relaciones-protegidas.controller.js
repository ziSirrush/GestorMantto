'use strict';

// [Mantto Gestor | 2026-10-13 | COBRANZA_UNI_CONSULTAS_PROTEGIDAS_FASE_2_V001]
// Solo consulta. Mantiene los Guards oficiales de las rutas y el scope de UNITED.
// Nunca confia en el FK de un registro si contradice su nombre de proyecto.
// El servicio de identidad FASE 1 constituye una dependencia obligatoria.

const db = require('../config/db');
const cobranzaScope = require('../services/cobranza-uni-scope.service');
const identidadProyecto = require('../services/cobranza-uni/identidad-proyecto.service');
const mpControllerActual = require('./detalle-mp-2026-cuartos-v2.controller');

const TABLAS = Object.freeze({
  gc: Object.freeze({ tabla: 'gestion_credito', id: 'id_gc', zona: 'z_oper' }),
  mp: Object.freeze({ tabla: 'detalle_mp_2026', id: 'id_dmp', zona: 'z_oper' }),
  pc: Object.freeze({ tabla: 'pc', id: 'id_pc', zona: 'zona_operativa' })
});

function idRegistro_uni(value) {
  const text = String(value == null ? '' : value).trim();
  return /^\d+$/.test(text) && !/^0+$/.test(text) ? text : null;
}

function importe_uni(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function redondearMoneda_uni(value) {
  const n = importe_uni(value);
  return Math.round((n + Math.sign(n || 1) * Number.EPSILON) * 100) / 100;
}

function sqlSeleccion_uni(alias) {
  if (!Object.hasOwn(TABLAS, alias)) throw new Error('Modulo de Cobranza desconocido.');
  return `${alias}.*,
    ${cobranzaScope.canonicalProjectSql_uni(alias)} AS proyecto_oficial,
    ${cobranzaScope.canonicalZoneCodeSql_uni(alias)} AS zona_oficial,
    ${cobranzaScope.canonicalZoneIdsSql_uni(alias)} AS zona_ids_oficial`;
}

function consultarScope_uni(req, alias) {
  if (!Object.hasOwn(TABLAS, alias)) throw new Error('Modulo de Cobranza desconocido.');
  return cobranzaScope.buildCobranzaProjectScopeSql_uni(req, alias);
}

function normalizarFila_uni(row, alias) {
  return cobranzaScope.canonicalizeRow_uni(row, TABLAS[alias].zona);
}

async function cargarRegistro_uni(conn, req, alias, id) {
  const conf = TABLAS[alias];
  const [rows] = await conn.query(`
    SELECT ${sqlSeleccion_uni(alias)}
    FROM ${conf.tabla} ${alias}
    WHERE ${alias}.${conf.id} = ? AND ${consultarScope_uni(req, alias)}
    LIMIT 1
  `, [id]);
  return rows[0] ? normalizarFila_uni(rows[0], alias) : null;
}

async function identificarRegistro_uni(conn, row) {
  // IMPORTANTE: utilizar siempre el nombre raw de la fila.
  // 'proyecto_oficial' podria proceder de un FK equivocado.
  const servicio = identidadProyecto.crearServicioIdentidadProyectoUni({
    consultar: (sql, params) => conn.query(sql, params)
  });
  return servicio.resolverIdentidadProyecto_uni({
    proyecto: row.proyecto,
    idProyectoCobranza: row.id_proyecto_cobranza
  });
}

async function consultarRelacion_uni(conn, req, alias, identidad, limiteUno = false) {
  const filtro = identidadProyecto.construirFiltroIdentidadProyecto_uni(alias, identidad);
  // Un origen sin identidad verificada no consulta datos de otro proyecto.
  if (!filtro.protegido) return limiteUno ? null : [];
  const conf = TABLAS[alias];
  const [rows] = await conn.query(`
    SELECT ${sqlSeleccion_uni(alias)}
    FROM ${conf.tabla} ${alias}
    WHERE ${filtro.sql} AND ${consultarScope_uni(req, alias)}
    ORDER BY ${alias}.${conf.id} ASC${limiteUno ? ' LIMIT 1' : ''}
  `, filtro.params);
  const items = rows.map(row => normalizarFila_uni(row, alias));
  return limiteUno ? (items[0] || null) : items;
}

function devolverError_uni(res, message, error) {
  // No incluir consultas SQL ni trazas internas en las respuestas humanas.
  console.error('[COBRANZA_UNI_FASE_2]', message, error && error.message);
  return res.status(500).json({ ok: false, message });
}

async function getGestionCreditoDetalle(req, res) {
  const id = idRegistro_uni(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_gc invalido.' });
  let conn;
  try {
    conn = await db.getConnection();
    const gestion = await cargarRegistro_uni(conn, req, 'gc', id);
    if (!gestion) return res.status(404).json({ ok: false, message: 'No se encontro el registro de Gestion de Credito dentro de los cuartos autorizados.' });

    const identidad = await identificarRegistro_uni(conn, gestion);
    const mantenimiento = await consultarRelacion_uni(conn, req, 'mp', identidad);
    const ventas = await consultarRelacion_uni(conn, req, 'pc', identidad);
    return res.json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
      gestion_credito: gestion,
      mantenimiento_preventivo: mantenimiento,
      venta_adicional: ventas
    });
  } catch (error) {
    return devolverError_uni(res, 'No fue posible consultar las relaciones de Gestion de Credito desde Aiven.', error);
  } finally {
    if (conn) conn.release();
  }
}

async function getVentaAdicionalDetalle(req, res) {
  const id = idRegistro_uni(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_pc invalido.' });
  let conn;
  try {
    conn = await db.getConnection();
    const venta = await cargarRegistro_uni(conn, req, 'pc', id);
    if (!venta) return res.status(404).json({ ok: false, message: 'Venta Adicional no encontrada dentro de los cuartos autorizados.' });

    const identidad = await identificarRegistro_uni(conn, venta);
    const gestiones = await consultarRelacion_uni(conn, req, 'gc', identidad);
    const mantenimientos = await consultarRelacion_uni(conn, req, 'mp', identidad);
    return res.json({
      ok: true,
      source: 'aiven',
      table: 'pc',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
      venta,
      gestion_credito: gestiones,
      mantenimiento_preventivo: mantenimientos
    });
  } catch (error) {
    return devolverError_uni(res, 'No fue posible consultar el detalle de Venta Adicional desde Aiven.', error);
  } finally {
    if (conn) conn.release();
  }
}

async function getDetalleMp2026(req, res) {
  const id = idRegistro_uni(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_dmp invalido.' });
  let conn;
  try {
    conn = await db.getConnection();
    const mantenimiento = await cargarRegistro_uni(conn, req, 'mp', id);
    if (!mantenimiento) return res.status(404).json({ ok: false, message: 'No se encontro el registro de Mantenimiento Preventivo dentro de los cuartos autorizados.' });

    const identidad = await identificarRegistro_uni(conn, mantenimiento);
    const mpRows = await consultarRelacion_uni(conn, req, 'mp', identidad);
    const gcRow = await consultarRelacion_uni(conn, req, 'gc', identidad, true);
    const pcRows = await consultarRelacion_uni(conn, req, 'pc', identidad);
    return res.json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
      mantenimiento,
      gestion_credito: gcRow,
      mantenimiento_preventivo: mpRows,
      venta_adicional: pcRows
    });
  } catch (error) {
    return devolverError_uni(res, 'No fue posible consultar el detalle de Mantenimiento Preventivo desde Aiven.', error);
  } finally {
    if (conn) conn.release();
  }
}

// La pagina principal MP ya calcula las columnas operativas y zonas de manera
// autorizada. Se preserva esa respuesta y se recalcula SOLO el adeudo VA bajo
// una correspondencia inequívoca, evitando duplicar logica de otros KPI.
// El agregado es una sola consulta por pantalla (no una consulta por proyecto).
const SQL_ADEUDOS_MP_PROTEGIDOS_UNI = (mpScope, pcScope) => `
  WITH
  nombres_unicos AS (
    SELECT TRIM(proyecto) COLLATE utf8mb4_0900_as_ci AS clave
    FROM proyectos_mantto
    GROUP BY TRIM(proyecto) COLLATE utf8mb4_0900_as_ci
    HAVING COUNT(*) = 1
  ),
  ids_unicos AS (
    SELECT cobranza FROM proyectos_mantto
    WHERE cobranza IS NOT NULL
    GROUP BY cobranza HAVING COUNT(*) = 1
  ),
  relacion_segura AS (
    SELECT pm.proyecto, pm.cobranza
    FROM proyectos_mantto pm
    INNER JOIN nombres_unicos nu
      ON nu.clave = TRIM(pm.proyecto) COLLATE utf8mb4_0900_as_ci
    INNER JOIN ids_unicos iu ON iu.cobranza = pm.cobranza
    INNER JOIN cobranza_proyectos cp
      ON cp.id_proyecto_cobranza = pm.cobranza
     AND pm.proyecto COLLATE utf8mb4_0900_bin = cp.proyecto COLLATE utf8mb4_0900_bin
    WHERE NOT EXISTS (
      SELECT 1 FROM portafolio p
      WHERE p.id_proyecto_cobranza IS NOT NULL
        AND p.id_proyecto_cobranza <> pm.cobranza
        AND TRIM(CONVERT(p.proyecto USING utf8mb4)) COLLATE utf8mb4_0900_as_ci
          = TRIM(pm.proyecto) COLLATE utf8mb4_0900_as_ci
    )
  ),
  adeudos_pc AS (
    SELECT r.cobranza,
      MAX(CASE WHEN pc.id_proyecto_cobranza = r.cobranza
                     OR pc.id_proyecto_cobranza IS NULL
               THEN COALESCE(pc.adeudo, 0) ELSE 0 END) AS adeudo_va,
      SUM(CASE WHEN pc.id_proyecto_cobranza IS NOT NULL
                     AND pc.id_proyecto_cobranza <> r.cobranza
               THEN 1 ELSE 0 END) AS operaciones_fk_conflictivo
    FROM pc pc
    INNER JOIN relacion_segura r
      ON TRIM(pc.proyecto) COLLATE utf8mb4_0900_as_ci
       = TRIM(r.proyecto) COLLATE utf8mb4_0900_as_ci
    WHERE ${pcScope}
    GROUP BY r.cobranza
  )
  SELECT mp.id_dmp, CAST(r.cobranza AS CHAR) AS id_cobranza_validado,
         COALESCE(ap.adeudo_va, 0) AS adeudo_va,
         COALESCE(ap.operaciones_fk_conflictivo, 0) AS operaciones_fk_conflictivo
  FROM detalle_mp_2026 mp
  INNER JOIN relacion_segura r
    ON TRIM(mp.proyecto) COLLATE utf8mb4_0900_as_ci
     = TRIM(r.proyecto) COLLATE utf8mb4_0900_as_ci
  LEFT JOIN adeudos_pc ap ON ap.cobranza = r.cobranza
  WHERE (mp.id_proyecto_cobranza = r.cobranza OR mp.id_proyecto_cobranza IS NULL)
    AND ${mpScope}
`;

function capturaRespuesta_uni() {
  const capture = { statusCode: 200, payload: null };
  const response = {
    status(code) { capture.statusCode = Number(code) || 500; return response; },
    json(payload) { capture.payload = payload; return response; }
  };
  return { capture, response };
}

function recalcularAdeudosVa_uni(payload, filasValidadas) {
  const seguros = new Map();
  for (const row of filasValidadas) {
    if (!idRegistro_uni(row.id_dmp) || !idRegistro_uni(row.id_cobranza_validado)) {
      throw new Error('Identidad no confiable en agregado de MP.');
    }
    const key = String(row.id_dmp);
    if (seguros.has(key)) throw new Error('Duplicado no confiable en agregado de MP.');
    const pendientes = Number(row.operaciones_fk_conflictivo || 0);
    if (!Number.isSafeInteger(pendientes) || pendientes < 0) {
      throw new Error('Conteo de operaciones VA no confiable.');
    }
    seguros.set(key, {
      id: String(row.id_cobranza_validado),
      adeudo: importe_uni(row.adeudo_va),
      pendientes
    });
  }

  const contados = new Set();
  let totalVa = 0;
  let filasSinIdentidad = 0;
  let operacionesConFkConflictivo = 0;
  for (const row of payload.rows) {
    const validado = seguros.get(String(row.id_dmp));
    row.adeudo_va = validado ? validado.adeudo : 0;
    // Los importes numericos mantienen el contrato legacy; las banderas
    // indican si la cifra equivale solo a un subtotal comprobado.
    row.adeudo_va_verificado = !!validado && validado.pendientes === 0;
    if (!validado) filasSinIdentidad += 1;
    if (validado && !contados.has(validado.id)) {
      contados.add(validado.id);
      totalVa += validado.adeudo;
      operacionesConFkConflictivo += validado.pendientes;
    }
  }
  payload.kpis.adeudo_va_total = redondearMoneda_uni(totalVa);
  payload.kpis.adeudo_total = redondearMoneda_uni(importe_uni(payload.kpis.adeudo_mp_total) + totalVa);
  payload.kpis.adeudo_va_es_parcial = filasSinIdentidad > 0 || operacionesConFkConflictivo > 0;
  payload.kpis.adeudo_va_filas_sin_identidad = filasSinIdentidad;
  payload.kpis.adeudo_va_operaciones_fk_conflictivo = operacionesConFkConflictivo;
  return payload;
}

async function getMainDetalleMp2026(req, res) {
  const { capture, response } = capturaRespuesta_uni();
  try {
    await mpControllerActual.getMainDetalleMp2026(req, response);
    if (!capture.payload) {
      return res.status(500).json({ ok: false, message: 'MP no devolvio una respuesta valida.' });
    }
    if (capture.statusCode >= 400 || capture.payload.ok !== true) {
      return res.status(capture.statusCode).json(capture.payload);
    }
    if (!Array.isArray(capture.payload.rows) || !capture.payload.kpis) {
      return res.status(500).json({ ok: false, message: 'Respuesta de MP incompleta.' });
    }

    // No se expone el agregado original porque pudo mezclar proyectos por FK.
    const scopeMp = consultarScope_uni(req, 'mp');
    const scopePc = consultarScope_uni(req, 'pc');
    const [rows] = await db.query(SQL_ADEUDOS_MP_PROTEGIDOS_UNI(scopeMp, scopePc));
    recalcularAdeudosVa_uni(capture.payload, rows);
    return res.json(capture.payload);
  } catch (error) {
    return devolverError_uni(res, 'No fue posible validar los adeudos VA de Mantenimiento Preventivo.', error);
  }
}

module.exports = Object.freeze({
  getGestionCreditoDetalle,
  getVentaAdicionalDetalle,
  getDetalleMp2026,
  getMainDetalleMp2026,
  // Expuestos solo para pruebas de contrato sin conexion a Aiven.
  _test: Object.freeze({
    idRegistro_uni,
    SQL_ADEUDOS_MP_PROTEGIDOS_UNI,
    recalcularAdeudosVa_uni
  })
});
