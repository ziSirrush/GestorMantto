'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FIX CX MANTENIMIENTO SYNC V001]
// Persistencia Aiven del contrato Google Sheets -> CX Mantenimiento.

const db = require('../../config/db');

const MT_SYNC_TABLE_COR = 'cx_mantenimiento_encuestas';
const MT_SYNC_KEY_COR = 'id_de_encuesta';

const MT_SYNC_FIELDS_COR = Object.freeze([
  'marca_temporal',
  '1_en_una_escala_del_1_al_10_que_tan_prob',
  'indice_de_recomendacion',
  'tipo_de_cliente',
  '2_como_calificarias_los_siguientes_compo',
  'csat_mantenimiento',
  '2_como_calificarias_los_siguientes_compo_1',
  'csat_atencion_de_fallas',
  '2_como_calificarias_los_siguientes_compo_2',
  'csat_seguimiento_de_supervisor',
  '2_como_calificarias_los_siguientes_compo_3',
  'csat_cotizaciones_suministros_y_reparaci',
  '2_como_calificarias_los_siguientes_compo_4',
  'csat_facturacion',
  '2_como_calificarias_los_siguientes_compo_5',
  'csat_atencion_al_cliente',
  'csat_general',
  '2_1_cual_es_el_nombre_de_su_supervisor_o',
  '3_1_mantenimiento_preventivo_oportunidad',
  '3_2_atencion_de_fallas_oportunidad_de_me',
  '3_3_seguimiento_de_supervisor_oportunida',
  '3_4_cotizaciones_suministros_y_reparacio',
  '3_5_facturacion_oportunidad_de_mejora',
  '3_6_atencion_al_cliente_oportunidad_de_m',
  '4_tengo_confianza_en_blt_para_la_operaci',
  'indice_de_confianza',
  '5_el_servicio_recibido_justifica_el_cost',
  'percepcion_de_valor',
  '6_pensando_en_el_futuro_que_tan_probable',
  'indice_de_riesgo_churn',
  'cuentanos_mas_sobre_tu_experiencia_algo_',
  'proyecto_sitio_del_servicio',
  'nombre',
  'correo_electronico',
  'telefono',
  'cargo',
  'medio_de_encuesta',
  'encuestador',
  'aspectos_destacables',
  'areas_de_oportunidad',
  'temas_operativos',
  'temas_administrativos',
  'valor_agregado',
  'tickets_generados',
  'z_general',
  'z_operativa',
  'z_administrativa',
  'c_administrativo',
  'z_ventas',
  'c_ventas',
  'z_contratos',
  'c_contratos',
  'superintendente',
  'supervisor_operativo',
  'categoria',
  'prioridad',
  'estado',
  'id_de_encuesta'
]);

const MT_SYNC_UPDATE_FIELDS_COR = Object.freeze(
  MT_SYNC_FIELDS_COR.filter(field => field !== MT_SYNC_KEY_COR)
);

const QUOTED_FIELDS_COR = MT_SYNC_FIELDS_COR.map(field => `\`${field}\``).join(',');
const INSERT_PLACEHOLDERS_COR = MT_SYNC_FIELDS_COR.map(() => '?').join(',');
const UPDATE_SET_COR = MT_SYNC_UPDATE_FIELDS_COR.map(field => `\`${field}\`=?`).join(',');
const SELECT_FIELDS_COR = ['id', ...MT_SYNC_FIELDS_COR]
  .map(field => `\`${field}\``)
  .join(',');

const STRUCTURAL_DB_CODES_COR = new Set([
  'ER_NO_SUCH_TABLE',
  'ER_BAD_FIELD_ERROR',
  'ER_PARSE_ERROR',
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ETIMEDOUT',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT'
]);

function comparable_cor(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function sameRecord_cor(existing, incoming) {
  return MT_SYNC_FIELDS_COR.every(field => (
    comparable_cor(existing[field]) === comparable_cor(incoming[field])
  ));
}

async function findExisting_cor(connection, idEncuesta) {
  const [rows] = await connection.query(
    `SELECT ${SELECT_FIELDS_COR}
       FROM ${MT_SYNC_TABLE_COR}
      WHERE \`${MT_SYNC_KEY_COR}\`=?
      ORDER BY \`id\`
      LIMIT 2
      FOR UPDATE`,
    [idEncuesta]
  );

  if (rows.length > 1) {
    const error = new Error(
      `La llave ${MT_SYNC_KEY_COR}=${idEncuesta} ya esta duplicada en ${MT_SYNC_TABLE_COR}.`
    );
    error.code = 'CX_MTTO_SYNC_DUPLICATE_DB_KEY';
    throw error;
  }

  return rows[0] || null;
}

async function insertRecord_cor(connection, record) {
  await connection.query(
    `INSERT INTO ${MT_SYNC_TABLE_COR} (${QUOTED_FIELDS_COR})
     VALUES (${INSERT_PLACEHOLDERS_COR})`,
    MT_SYNC_FIELDS_COR.map(field => record[field])
  );
}

async function updateRecord_cor(connection, existingId, record) {
  await connection.query(
    `UPDATE ${MT_SYNC_TABLE_COR}
        SET ${UPDATE_SET_COR}
      WHERE \`id\`=?`,
    [
      ...MT_SYNC_UPDATE_FIELDS_COR.map(field => record[field]),
      existingId
    ]
  );
}

function isStructuralDbError_cor(error) {
  return STRUCTURAL_DB_CODES_COR.has(String(error?.code || ''));
}

async function syncMantenimientoBatch_cor(records) {
  const connection = await db.getConnection();
  let insertados = 0;
  let actualizados = 0;
  let sinCambios = 0;
  const errores = [];

  try {
    await connection.beginTransaction();

    for (let position = 0; position < records.length; position += 1) {
      const item = records[position];
      const savepoint = `cx_mtto_sync_${position}`;

      try {
        await connection.query(`SAVEPOINT ${savepoint}`);

        const existing = await findExisting_cor(
          connection,
          item.record[MT_SYNC_KEY_COR]
        );

        if (!existing) {
          await insertRecord_cor(connection, item.record);
          insertados += 1;
        } else if (sameRecord_cor(existing, item.record)) {
          sinCambios += 1;
        } else {
          await updateRecord_cor(connection, existing.id, item.record);
          actualizados += 1;
        }

        await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (error) {
        try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_rollbackError) {}
        try { await connection.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_releaseError) {}

        if (isStructuralDbError_cor(error)) throw error;

        errores.push({
          indice: item.indice,
          id_de_encuesta: item.record[MT_SYNC_KEY_COR],
          codigo: error.code || 'CX_MTTO_SYNC_DB_ROW_ERROR',
          motivo: error.message
        });
      }
    }

    await connection.commit();

    return {
      insertados,
      actualizados,
      sin_cambios: sinCambios,
      rechazados: errores.length,
      errores
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = Object.freeze({
  MT_SYNC_TABLE_COR,
  MT_SYNC_KEY_COR,
  MT_SYNC_FIELDS_COR,
  syncMantenimientoBatch_cor
});
