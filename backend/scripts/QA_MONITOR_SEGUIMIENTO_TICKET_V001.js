'use strict';

// Consulta de solo lectura. Uso desde backend:
// node scripts/QA_MONITOR_SEGUIMIENTO_TICKET_V001.js 254540
// node scripts/QA_MONITOR_SEGUIMIENTO_TICKET_V001.js 254540 --watch

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../src/config/db');

const ticketRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const watch = process.argv.includes('--watch');

if (!ticketRef) {
  console.error('Uso: node scripts/QA_MONITOR_SEGUIMIENTO_TICKET_V001.js <numero-ticket> [--watch]');
  process.exit(1);
}

function show(rows) {
  for (const row of rows) {
    console.log(JSON.stringify({
      id_notificacion: Number(row.id_notificacion),
      fecha_creacion: row.fecha_creacion,
      id_usuario: Number(row.id_usuario),
      evento: row.tipo_notificacion,
      seguimiento_especial: Number(row.seguimiento_especial) === 1,
      titulo: row.titulo_notificacion
    }));
  }
}

async function readNotifications(ticketId, lastId = null) {
  const [rows] = await db.query(`
    SELECT n.id_notificacion, n.fecha_creacion, n.id_usuario,
           n.tipo_notificacion, n.titulo_notificacion,
           JSON_CONTAINS(
             COALESCE(n.codigos_visuales_json, JSON_ARRAY()),
             JSON_QUOTE('SEGUIMIENTO_ESPECIAL')
           ) AS seguimiento_especial
    FROM sup_notificaciones n
    WHERE n.id_referencia = ?
      AND (? IS NULL OR n.id_notificacion > ?)
    ORDER BY n.id_notificacion DESC
    LIMIT 100
  `, [ticketId, lastId, lastId]);
  return rows.reverse();
}

async function main() {
  const [tickets] = await db.query(`
    SELECT id, ticket FROM tickets
    WHERE TRIM(CAST(ticket AS CHAR)) = TRIM(?)
    ORDER BY id DESC LIMIT 1
  `, [ticketRef]);
  const ticket = tickets[0];
  if (!ticket) throw new Error(`Ticket ${ticketRef} no encontrado.`);

  const [followers] = await db.query(`
    SELECT id_usuario FROM seguimiento_especial
    WHERE origen = 'UNITED' AND entidad_tipo = 'TICKET'
      AND entidad_id = ? AND activo = 1
    ORDER BY id_usuario
  `, [ticket.id]);

  console.log(`Ticket ${ticket.ticket} (id ${ticket.id})`);
  console.log(`Seguidores directos activos: ${followers.map((row) => row.id_usuario).join(', ') || 'ninguno'}`);

  const initial = await readNotifications(ticket.id);
  show(initial);
  let lastId = Math.max(0, ...initial.map((row) => Number(row.id_notificacion) || 0));
  if (!watch) return;

  console.log('Vigilando nuevas notificaciones cada 5 segundos. Ctrl+C para salir.');
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const rows = await readNotifications(ticket.id, lastId);
    show(rows);
    lastId = Math.max(lastId, ...rows.map((row) => Number(row.id_notificacion) || 0));
  }
}

main()
  .catch((error) => {
    console.error(`Monitor: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
