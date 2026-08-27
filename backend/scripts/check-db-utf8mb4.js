'use strict';

const db = require('../src/config/db');

const EXPECTED_CRITICAL_ICONS = Object.freeze({
  PERSONA_ATRAPADA: '🚨',
  FALLA_EQUIPO_CRITICO: '🆘',
  NUEVO_EQUIPO_CRITICO: '💥',
  PERSONA_ATRAPADA_EQUIPO_CRITICO: '🚨🆘',
  PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO: '🚨💥'
});

async function main() {
  try {
    const [charsetRows] = await db.query(`
      SELECT
        @@character_set_client AS character_set_client,
        @@character_set_connection AS character_set_connection,
        @@character_set_results AS character_set_results,
        @@collation_connection AS collation_connection
    `);

    const charset = charsetRows[0] || {};
    console.log('Charset de conexion:', charset);

    const charsetValues = [
      charset.character_set_client,
      charset.character_set_connection,
      charset.character_set_results
    ].map((value) => String(value || '').toLowerCase());

    if (charsetValues.some((value) => value !== 'utf8mb4')) {
      throw new Error(`La conexion no esta completamente en utf8mb4: ${charsetValues.join(', ')}`);
    }

    const codes = Object.keys(EXPECTED_CRITICAL_ICONS);
    const placeholders = codes.map(() => '?').join(', ');
    const [events] = await db.query(`
      SELECT codigo_evento, icono_default, HEX(icono_default) AS icono_hex
      FROM notificacion_eventos
      WHERE codigo_evento IN (${placeholders})
      ORDER BY codigo_evento
    `, codes);

    const byCode = new Map(events.map((row) => [String(row.codigo_evento), row]));
    for (const [code, expectedIcon] of Object.entries(EXPECTED_CRITICAL_ICONS)) {
      const row = byCode.get(code);
      if (!row) throw new Error(`No se encontro ${code} en notificacion_eventos.`);
      if (String(row.icono_default || '') !== expectedIcon) {
        throw new Error(`${code} tiene icono ${JSON.stringify(row.icono_default)} y se esperaba ${expectedIcon}.`);
      }
      const expectedHex = Buffer.from(expectedIcon, 'utf8').toString('hex').toUpperCase();
      if (String(row.icono_hex || '').toUpperCase() !== expectedHex) {
        throw new Error(`${code} no conserva los bytes UTF8 esperados. HEX=${row.icono_hex}, esperado=${expectedHex}.`);
      }
      console.log(`[OK] ${code}: ${expectedIcon} / ${expectedHex}`);
    }

    console.log('[OK] Conexion Aiven y catalogo critico validados en utf8mb4.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('[ERROR]', error.message || error);
  process.exit(1);
});
