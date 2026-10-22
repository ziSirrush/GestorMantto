'use strict';

// [Mantto Gestor | 2026-10-13 | COBRANZA_UNI_FK_VALIDADOR_V001]
// Motor 2 UNITED: repara EXCLUSIVAMENTE el FK de registros financieros.
// Autoridad: proyectos_mantto.cobranza -> cobranza_proyectos.id_proyecto_cobranza.
// Misma regla de equivalencia estricta del SQL V003 aplicado manualmente.
// Nunca crea proyectos, modifica importes, nombres, IDs primarios ni Portafolio.

const defaultLogger = require('../../shared/logger');

const TABLES_UNI = Object.freeze({
  gestion_credito: Object.freeze({ pk: 'id_gc', label: 'GC', lock: 'mg_uni_fk_gc_v001' }),
  detalle_mp_2026: Object.freeze({ pk: 'id_dmp', label: 'MP', lock: 'mg_uni_fk_mp_v001' }),
  pc: Object.freeze({ pk: 'id_pc', label: 'VA', lock: 'mg_uni_fk_pc_v001' })
});

const CHUNK_SIZE_UNI = 300;
const BRIDGE_SCHEMA_CACHE_TTL_MS = 60 * 60 * 1000;

// Requiere mapeo univoco tanto por nombre como por ID.
// La equivalencia entre los dos catalogos SI es binaria (texto EXACTO).
// La comparacion de la fuente ignora solo espacios exteriores y mayusculas,
// preservando acentos: utf8mb4_0900_as_ci.
const UNIQUE_MAPPING_UNI = `
  JOIN proyectos_mantto AS pm
    ON TRIM(src.proyecto) COLLATE utf8mb4_0900_as_ci
     = TRIM(pm.proyecto) COLLATE utf8mb4_0900_as_ci
  JOIN cobranza_proyectos AS cp
    ON cp.id_proyecto_cobranza = pm.cobranza
   AND pm.proyecto COLLATE utf8mb4_0900_bin
     = cp.proyecto COLLATE utf8mb4_0900_bin
  JOIN (
    SELECT TRIM(proyecto) COLLATE utf8mb4_0900_as_ci AS clave
    FROM proyectos_mantto
    GROUP BY TRIM(proyecto) COLLATE utf8mb4_0900_as_ci
    HAVING COUNT(*) = 1
  ) AS unicos_nombre
    ON unicos_nombre.clave = TRIM(pm.proyecto) COLLATE utf8mb4_0900_as_ci
  JOIN (
    SELECT cobranza
    FROM proyectos_mantto
    WHERE cobranza IS NOT NULL
    GROUP BY cobranza
    HAVING COUNT(*) = 1
  ) AS unicos_id
    ON unicos_id.cobranza = pm.cobranza
`;

const MISALIGNED_UNI = `
  src.proyecto IS NOT NULL
  AND TRIM(src.proyecto) <> ''
  AND (src.id_proyecto_cobranza IS NULL
       OR src.id_proyecto_cobranza <> pm.cobranza)
`;

function normalizeId_uni(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^\d+$/.test(text) || /^0+$/.test(text) || text.length > 20) return null;
  // IDs de MySQL BIGINT: no convertir a Number para evitar perdida de precision.
  const normalized = text.replace(/^0+/, '');
  if (!normalized || BigInt(normalized) > 9223372036854775807n) return null;
  return normalized;
}

function chunk_uni(array, size = CHUNK_SIZE_UNI) {
  const result = [];
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }
  return result;
}

function sqlFor_uni(table, pk, ids) {
  // table y pk provienen UNICAMENTE de TABLES_UNI (lista cerrada).
  const idFilter = ids === null
    ? ''
    : ` AND src.${pk} IN (${ids.map(() => '?').join(', ')})`;
  const from = `FROM ${table} AS src ${UNIQUE_MAPPING_UNI}`;
  const condition = `WHERE ${MISALIGNED_UNI} ${idFilter}`;
  return {
    count: `SELECT COUNT(*) AS pendientes ${from} ${condition}`,
    examples: `SELECT src.${pk} AS id_registro, src.id_proyecto_cobranza AS id_anterior,
                     pm.cobranza AS id_nuevo ${from} ${condition}
               ORDER BY src.${pk} ASC LIMIT 10`,
    update: `UPDATE ${table} AS src ${UNIQUE_MAPPING_UNI}
             SET src.id_proyecto_cobranza = pm.cobranza
             ${condition}`,
    audit: `SELECT COUNT(*) AS registros_revisados,
                SUM(src.id_proyecto_cobranza IS NULL) AS sin_id,
                SUM(src.id_proyecto_cobranza IS NOT NULL
                    AND cp_audit.id_proyecto_cobranza IS NULL) AS id_sin_catalogo,
                SUM(src.id_proyecto_cobranza IS NOT NULL
                    AND cp_audit.id_proyecto_cobranza IS NOT NULL
                    AND (src.proyecto IS NULL OR
                         TRIM(src.proyecto) COLLATE utf8mb4_0900_as_ci
                           <> TRIM(cp_audit.proyecto) COLLATE utf8mb4_0900_as_ci)) AS nombre_distinto
            FROM ${table} AS src
            LEFT JOIN cobranza_proyectos AS cp_audit
              ON cp_audit.id_proyecto_cobranza = src.id_proyecto_cobranza
            ${ids === null ? '' : `WHERE src.${pk} IN (${ids.map(() => '?').join(', ')})`}`,
    params: ids === null ? [] : ids
  };
}

function crearValidadorUni({
  obtenerConexion = () => require('../../config/db').getConnection(),
  logger = defaultLogger,
  now = () => Date.now(),
  bridgeSchemaCacheTtlMs = BRIDGE_SCHEMA_CACHE_TTL_MS
} = {}) {
  let bridgeSchemaValidatedAt = 0;

  async function comprobarPuente_uni(conn) {
    const currentTime = Number(now());
    if (bridgeSchemaValidatedAt && currentTime - bridgeSchemaValidatedAt < bridgeSchemaCacheTtlMs) {
      return;
    }
    // Previene ejecutar sobre la V001 antigua donde cobranza era TINYINT(1).
    const [rows] = await conn.query(`
      SELECT DATA_TYPE, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'proyectos_mantto'
        AND COLUMN_NAME = 'cobranza'
      LIMIT 1
    `);
    if (!rows.length || String(rows[0].DATA_TYPE).toLowerCase() !== 'bigint'
        || !String(rows[0].COLUMN_TYPE).toLowerCase().includes('unsigned')) {
      throw new Error('El catalogo proyectos_mantto.cobranza no es BIGINT UNSIGNED; validacion bloqueada.');
    }
    bridgeSchemaValidatedAt = currentTime;
  }

  async function reconciliar({
    tabla,
    ids = null,
    connection = null,
    origen = 'programado',
    auditarResiduales = true,
    capturarMuestra = origen !== 'programado'
  } = {}) {
    const spec = TABLES_UNI[tabla];
    if (!Object.prototype.hasOwnProperty.call(TABLES_UNI, tabla) || !spec) {
      throw new Error('Tabla fuera de la lista permitida de Cobranza United.');
    }

    // null significa auditoria completa. [] significa ningun registro por procesar.
    const uniqueIds = ids === null ? null : [...new Set(
      (Array.isArray(ids) ? ids : []).map(normalizeId_uni).filter(Boolean)
    )];
    if (uniqueIds !== null && !uniqueIds.length) {
      return { modulo: spec.label, corregidos: 0, detectados: 0, omitido: 'sin_ids_validos' };
    }

    const ownedConnection = !connection;
    const conn = connection || await obtenerConexion();
    let lockAcquired = false;
    let transactionStarted = false;
    let previousSafeUpdates = null;
    let detected = 0;
    let corrected = 0;
    const examples = [];
    const pendingAudit = {
      revisados: 0, sin_id: 0, id_sin_catalogo: 0, nombre_distinto: 0
    };

    try {
      const [locks] = await conn.query('SELECT GET_LOCK(?, 0) AS adquirido', [spec.lock]);
      if (Number(locks[0] && locks[0].adquirido) !== 1) {
        // Otra instancia o sincronizacion ya trabaja sobre esta tabla.
        return { modulo: spec.label, corregidos: 0, detectados: 0, omitido: 'ocupado' };
      }
      lockAcquired = true;

      await comprobarPuente_uni(conn);
      const [safeRows] = await conn.query('SELECT @@SESSION.SQL_SAFE_UPDATES AS valor');
      previousSafeUpdates = Number(safeRows[0].valor);
      if (previousSafeUpdates !== 0) await conn.query('SET SESSION SQL_SAFE_UPDATES = 0');

      await conn.beginTransaction();
      transactionStarted = true;

      const chunks = uniqueIds === null ? [null] : chunk_uni(uniqueIds);
      for (const batch of chunks) {
        const sql = sqlFor_uni(tabla, spec.pk, batch);

        // El UPDATE ya devuelve affectedRows; el COUNT previo recorria el mismo
        // conjunto completo y duplicaba el costo sin aportar una decision de
        // negocio. La muestra se conserva solo para reconciliaciones dirigidas.
        if (capturarMuestra && examples.length < 10) {
          const [sample] = await conn.query(sql.examples, sql.params);
          examples.push(...sample.slice(0, 10 - examples.length));
        }
        const [result] = await conn.query(sql.update, sql.params);
        const affected = Number(result.affectedRows || 0);
        if (!Number.isSafeInteger(affected) || affected < 0) {
          throw new Error(`Conteo invalido de correcciones en ${spec.label}.`);
        }
        detected += affected;
        corrected += affected;
      }

      // La auditoria residual es valiosa, pero no tiene que repetirse en cada
      // ciclo programado. El job decide cuando ejecutarla; post-sync conserva
      // auditoria dirigida por IDs, cuyo costo es acotado.
      if (auditarResiduales) {
        for (const batch of chunks) {
          const sql = sqlFor_uni(tabla, spec.pk, batch);
          const [auditRows] = await conn.query(sql.audit, sql.params);
          const audit = auditRows[0] || {};
          for (const key of Object.keys(pendingAudit)) {
            pendingAudit[key] += Number(audit[key] || 0);
          }
        }
      }

      await conn.commit();
      transactionStarted = false;
      const report = {
        modulo: spec.label,
        origen,
        detectados: detected,
        corregidos: corrected,
        pendientes: auditarResiduales ? pendingAudit : null,
        auditoria_residual: auditarResiduales ? 'ejecutada' : 'omitida',
        // Una muestra para auditoria tecnica; sin datos financieros.
        muestra: examples
      };
      if (corrected > 0 || detected !== corrected) {
        logger.info('[COBRANZA_UNI_FK] Reconciliacion', report);
      }
      if (origen === 'programado' && auditarResiduales &&
          (pendingAudit.sin_id || pendingAudit.id_sin_catalogo || pendingAudit.nombre_distinto)) {
        logger.warn(`[COBRANZA_UNI_FK] ${spec.label}: excepciones para revision manual`, pendingAudit);
      }
      return report;
    } catch (error) {
      if (transactionStarted) {
        try { await conn.rollback(); } catch (rollbackError) {
          logger.error('[COBRANZA_UNI_FK] Error de ROLLBACK', rollbackError.message);
        }
      }
      logger.error(`[COBRANZA_UNI_FK] ${spec.label}: no fue posible validar`, error.message);
      throw error;
    } finally {
      // La conexion puede ser prestada por el controlador de sync.
      // Restaurar su modo y liberar un lock local de MySQL antes de devolverla.
      if (previousSafeUpdates !== null && previousSafeUpdates !== 0) {
        try { await conn.query('SET SESSION SQL_SAFE_UPDATES = 1'); }
        catch (restoreError) { logger.error('[COBRANZA_UNI_FK] Error restaurando SQL_SAFE_UPDATES', restoreError.message); }
      }
      if (lockAcquired) {
        try { await conn.query('SELECT RELEASE_LOCK(?) AS liberado', [spec.lock]); }
        catch (unlockError) { logger.error('[COBRANZA_UNI_FK] Error liberando lock', unlockError.message); }
      }
      if (ownedConnection) conn.release();
    }
  }

  async function validarDespuesSync({ tabla, rows, summary, connection } = {}) {
    const spec = TABLES_UNI[tabla];
    if (!spec) return { omitido: 'tabla_no_permitida' };
    const errors = new Set((summary && summary.errors || []).map(item => item.index));
    const ids = (Array.isArray(rows) ? rows : [])
      .filter((row, index) => !errors.has(index))
      .map(row => row && row[spec.pk]);
    try {
      return await reconciliar({ tabla, ids, connection, origen: 'post_sync' });
    } catch (error) {
      // La carga de datos YA HIZO COMMIT; un error en la relacion
      // no debe presentar la sincronizacion exitosa como fallida ni reintentar el lote.
      logger.warn(`[COBRANZA_UNI_FK] ${spec.label} pendiente para ciclo programado`, error.message);
      return { modulo: spec.label, corregidos: 0, omitido: 'error', error: error.message };
    }
  }

  return { reconciliar, validarDespuesSync };
}

const instance = crearValidadorUni();

module.exports = {
  TABLES_UNI,
  crearValidadorUni,
  reconciliar: instance.reconciliar,
  validarDespuesSync: instance.validarDespuesSync
};
