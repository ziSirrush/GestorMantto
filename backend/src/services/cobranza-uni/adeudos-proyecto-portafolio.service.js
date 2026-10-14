'use strict';

// [Mantto Gestor | 2026-10-13 | FASE_3_INTEGRACION_COBRANZA_PORTAFOLIO_V001]
// Capa de SOLO LECTURA: sustituye los agregados por ID OR nombre del detalle
// Portafolio/Proyectos con cifras derivadas de una identidad inequivoca.
// Es intencional que no cree ni corrija datos. Requiere Fase 1 instalada.

const identidadProyectoUni = require('./identidad-proyecto.service');

const SQL_RESUMEN_COBRANZA_UNI = `
SELECT
  (SELECT MIN(gc.id_gc)
   FROM gestion_credito gc
   WHERE TRIM(gc.proyecto) COLLATE utf8mb4_0900_as_ci = TRIM(?) COLLATE utf8mb4_0900_as_ci
     AND (gc.id_proyecto_cobranza = ? OR gc.id_proyecto_cobranza IS NULL)) AS gestion_credito_id,
  (SELECT COALESCE(SUM(COALESCE(mp.pendiente_corriente, 0) + COALESCE(mp.pendiente_vencido, 0)), 0)
   FROM detalle_mp_2026 mp
   WHERE TRIM(mp.proyecto) COLLATE utf8mb4_0900_as_ci = TRIM(?) COLLATE utf8mb4_0900_as_ci
     AND (mp.id_proyecto_cobranza = ? OR mp.id_proyecto_cobranza IS NULL)) AS adeudo_mp,
  (SELECT COALESCE(MAX(COALESCE(va.adeudo, 0)), 0)
   FROM pc va
   WHERE TRIM(va.proyecto) COLLATE utf8mb4_0900_as_ci = TRIM(?) COLLATE utf8mb4_0900_as_ci
     AND (va.id_proyecto_cobranza = ? OR va.id_proyecto_cobranza IS NULL)) AS adeudo_va,
  (SELECT COUNT(*) FROM gestion_credito gc
   WHERE TRIM(gc.proyecto) COLLATE utf8mb4_0900_as_ci = TRIM(?) COLLATE utf8mb4_0900_as_ci
     AND gc.id_proyecto_cobranza IS NOT NULL AND gc.id_proyecto_cobranza <> ?) AS gc_fk_conflictivos,
  (SELECT COUNT(*) FROM detalle_mp_2026 mp
   WHERE TRIM(mp.proyecto) COLLATE utf8mb4_0900_as_ci = TRIM(?) COLLATE utf8mb4_0900_as_ci
     AND mp.id_proyecto_cobranza IS NOT NULL AND mp.id_proyecto_cobranza <> ?) AS mp_fk_conflictivos,
  (SELECT COUNT(*) FROM pc va
   WHERE TRIM(va.proyecto) COLLATE utf8mb4_0900_as_ci = TRIM(?) COLLATE utf8mb4_0900_as_ci
     AND va.id_proyecto_cobranza IS NOT NULL AND va.id_proyecto_cobranza <> ?) AS va_fk_conflictivos
`;

function nombreUni(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function idSeguroUni(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const txt = String(value).trim();
  if (!/^\d+$/.test(txt) || /^0+$/.test(txt)) return null;
  const id = BigInt(txt);
  return id <= 18446744073709551615n ? id.toString() : null;
}

function enteroNoNegativoUni(value, campo) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Conteo no fiable: ${campo}.`);
  return n;
}

function importeUni(value, campo) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Importe no fiable: ${campo}.`);
  return n;
}

function bloquearFinanzasUni(payload, estado, motivo, pendientes = {}) {
  const metrics = payload.project_metrics;
  metrics.gestion_credito_id = null;
  metrics.adeudo_mp = null;
  metrics.adeudo_va = null;
  metrics.adeudo_total = null;
  metrics.adeudo_verificado = false;
  metrics.adeudo_es_parcial = true;
  metrics.adeudo_estado = estado;
  metrics.adeudo_advertencia = motivo;
  metrics.adeudo_pendientes = pendientes;
  // Datos agregados originales de la consulta antigua quedan reemplazados,
  // no se devuelven ni accidentalmente en otra propiedad de metrics.
  return payload;
}

function applyResumenUni(payload, row, identidad) {
  const values = ['gc_fk_conflictivos', 'mp_fk_conflictivos', 'va_fk_conflictivos'];
  const pendientes = Object.fromEntries(values.map(k => [k, enteroNoNegativoUni(row[k], k)]));
  const totalPendientes = Object.values(pendientes).reduce((a, b) => a + b, 0);
  const metrics = payload.project_metrics;
  const adeudoMp = importeUni(row.adeudo_mp, 'adeudo_mp');
  const adeudoVa = importeUni(row.adeudo_va, 'adeudo_va');
  const gcId = idSeguroUni(row.gestion_credito_id);
  metrics.gestion_credito_id = gcId && BigInt(gcId) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(gcId) : null;
  // Los valores de las facturas no certificadas NO se presentan como totales.
  // Al existir discrepancias los subtotales se conservan en una propiedad
  // diferente, identificada explicitamente como monto parcial.
  const parcial = totalPendientes > 0;
  metrics.adeudo_mp = parcial ? null : adeudoMp;
  metrics.adeudo_va = parcial ? null : adeudoVa;
  metrics.adeudo_total = parcial ? null : adeudoMp + adeudoVa;
  metrics.adeudo_verificado = !parcial;
  metrics.adeudo_es_parcial = parcial;
  metrics.adeudo_estado = parcial ? 'PARCIAL_FK_CONFLICTIVO' : 'VALIDADO';
  metrics.adeudo_advertencia = parcial
    ? 'Existen operaciones financieras con ID de otro proyecto. Los montos no son definitivos.'
    : null;
  metrics.adeudo_pendientes = pendientes;
  metrics.adeudo_subtotal_validado = parcial ? {
    mp: adeudoMp, va: adeudoVa, total: adeudoMp + adeudoVa
  } : null;
  metrics.id_cobranza_validado = identidad.id_proyecto_cobranza;
  return payload;
}

function nombreCrudoDesdeRespuestaUni(payload) {
  const equipos = payload.equipos;
  if (!Array.isArray(equipos) || equipos.length < 1) return null;
  const nombres = new Set(equipos.map(e => nombreUni(e?.proyecto)).filter(Boolean));
  if (nombres.size !== 1) return null;
  const nombre = [...nombres][0];
  // La cabecera es una proyeccion del mismo Portafolio, no un parametro HTTP.
  const cabecera = nombreUni(payload.proyecto?.proyecto_busqueda || payload.proyecto?.proyecto);
  if (cabecera && cabecera.localeCompare(nombre, 'es', { sensitivity: 'accent' }) !== 0) return null;
  return nombre;
}

function crearProtectorAdeudosPortafolioUni({ consultar, resolverIdentidad } = {}) {
  const ejecutar = consultar || ((sql, params) => require('../../config/db').query(sql, params));
  const resolver = resolverIdentidad || (args => identidadProyectoUni.resolverIdentidadProyecto_uni(args));
  if (typeof ejecutar !== 'function' || typeof resolver !== 'function') {
    throw new TypeError('Dependencias de Cobranza Portafolio invalidas.');
  }

  async function protegerPayloadUni(payload) {
    if (!payload || payload.ok !== true || !payload.project_metrics ||
        typeof payload.project_metrics !== 'object' || !Array.isArray(payload.equipos)) {
      throw new Error('Respuesta de detalle de proyecto no confiable.');
    }
    const nombre = nombreCrudoDesdeRespuestaUni(payload);
    if (!nombre) {
      return bloquearFinanzasUni(payload, 'SIN_IDENTIDAD', 'No fue posible identificar un unico proyecto desde sus equipos.');
    }
    const fkCabecera = payload.proyecto?.id_proyecto_cobranza;
    if (fkCabecera !== null && fkCabecera !== undefined && fkCabecera !== '' && !idSeguroUni(fkCabecera)) {
      return bloquearFinanzasUni(payload, 'FK_INVALIDO', 'La referencia de Cobranza del proyecto no es valida.');
    }
    const identidad = await resolver({ proyecto: nombre, idProyectoCobranza: fkCabecera });
    if (!identidad || !identidad.valido || !idSeguroUni(identidad.id_proyecto_cobranza)) {
      return bloquearFinanzasUni(payload, identidad?.estado || 'SIN_MAPEO',
        'No existe una relacion unica y comprobada entre el proyecto y Cobranza.');
    }
    const name = identidad.proyecto;
    const id = identidad.id_proyecto_cobranza;
    const [rows] = await ejecutar(SQL_RESUMEN_COBRANZA_UNI, [
      name,id, name,id, name,id, name,id, name,id, name,id
    ]);
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]) {
      throw new Error('Aiven no devolvio un agregado financiero unico.');
    }
    return applyResumenUni(payload, rows[0], identidad);
  }

  async function envolverDetalleUni(req, res, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler original invalido.');
    }
    const capture = { code: 200, payload: undefined, sent: false };
    const proxy = {
      status(value) { capture.code = Number(value); return proxy; },
      json(value) { capture.payload = value; capture.sent = true; return value; }
    };
    try {
      await handler(req, proxy);
      if (!capture.sent) {
        return res.status(500).json({ ok: false, message: 'Detalle de proyecto sin respuesta confirmada.' });
      }
      if (capture.code >= 400 || capture.payload?.ok !== true) {
        return res.status(capture.code).json(capture.payload);
      }
      await protegerPayloadUni(capture.payload);
      // El frontend legacy convierte NULL/NaN a $0. Para una respuesta no
      // verificable, devolver 200 permitiria mostrar un falso adeudo $0.
      // La ruta de error existente presenta al usuario el mensaje siguiente;
      // no se suprime el error con un subtotal parcial.
      if (capture.payload.project_metrics.adeudo_verificado !== true) {
        const integridad = capture.payload.project_metrics;
        console.warn('[COBRANZA_UNI_FASE_3] Detalle con relacion no verificable', JSON.stringify({
          proyecto: nombreUni(capture.payload.proyecto?.proyecto),
          estado: integridad.adeudo_estado,
          pendientes: integridad.adeudo_pendientes || {}
        }));
        return res.status(409).json({
          ok: false,
          code: 'COBRANZA_PROYECTO_NO_VERIFICADA',
          message: 'El detalle financiero de este proyecto tiene relaciones pendientes de validacion. No se muestran importes para evitar datos de otros proyectos.',
          integridad: {
            estado: capture.payload.project_metrics.adeudo_estado
          }
        });
      }
      return res.status(capture.code).json(capture.payload);
    } catch (error) {
      console.error('[COBRANZA_UNI_FASE_3] Error al proteger el detalle:', error.message);
      // Ante error SQL de validacion, no devolver el agregado original del OR.
      return res.status(503).json({ ok: false, message: 'No fue posible verificar los importes de Cobranza. Intenta nuevamente.' });
    }
  }

  return Object.freeze({ protegerPayloadUni, envolverDetalleUni });
}

const protectorPorDefectoUni = crearProtectorAdeudosPortafolioUni();

module.exports = Object.freeze({
  envolverDetalleUni: protectorPorDefectoUni.envolverDetalleUni,
  crearProtectorAdeudosPortafolioUni,
  SQL_RESUMEN_COBRANZA_UNI
});
