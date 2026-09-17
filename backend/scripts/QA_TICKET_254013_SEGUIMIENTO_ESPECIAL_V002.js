'use strict';

// [Aster | 2026-09-14 | ASTER-MG | QA_TICKET_254013_SEGUIMIENTO_ESPECIAL_V002]
// Base verificada: main @ d1db90ef732e0bae8eae16293394f5cbc08b0619
//
// OBJETIVO
// - PRECHECK (por defecto): solo lectura. No crea notificaciones ni modifica Tickets.
// - --confirm: crea UNA notificacion QA TICKET_CREADO por cada follower autorizado
//   que resuelva el motor actual para el Ticket 254013. No modifica el Ticket.
//
// USO desde /backend:
//   node .\scripts\QA_TICKET_254013_SEGUIMIENTO_ESPECIAL_V002.js
//   node .\scripts\QA_TICKET_254013_SEGUIMIENTO_ESPECIAL_V002.js --confirm

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require(path.join(__dirname, '..', 'src', 'config', 'db'));
const {
  resolveSeguimientoRecipients_uni
} = require(path.join(
  __dirname,
  '..',
  'src',
  'services',
  'notifications',
  'portafolio-seguimiento-especial-notifications_uni.service'
));
const {
  emitBusinessEventSafe_gnral
} = require(path.join(
  __dirname,
  '..',
  'src',
  'services',
  'notifications',
  'notification-business-emitter.service'
));
const {
  siteLabel_gnral
} = require(path.join(
  __dirname,
  '..',
  'src',
  'services',
  'notifications',
  'notification-site-label.service'
));

const TICKET_REF = '254013';
const EVENT_CODE = 'TICKET_CREADO';
const FOLLOW_ONLY_CODES = [
  'TICKET_CREADO',
  'TICKET_ESTATUS_CAMBIADO',
  'TICKET_PRIORIDAD_CAMBIADA',
  'TICKET_ASIGNACION_CAMBIADA',
  'TICKET_RESPONSABILIDAD_CAMBIADA'
];

function ids(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((item) => Number(item && typeof item === 'object' ? item.id_usuario : item))
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

function sameIds(a, b) {
  return JSON.stringify(ids(a)) === JSON.stringify(ids(b));
}

function printJson(label, value) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

async function loadTicket() {
  const [rows] = await db.query(`
    SELECT t.*
    FROM tickets t
    WHERE TRIM(COALESCE(CAST(t.ticket AS CHAR), '')) = TRIM(?)
    ORDER BY t.id DESC
    LIMIT 1
  `, [TICKET_REF]);
  return rows[0] || null;
}

async function loadPortfolio(idPortafolio) {
  const id = Number(idPortafolio || 0);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [rows] = await db.query(`
    SELECT p.*
    FROM portafolio p
    WHERE p.id_portafolio = ?
    LIMIT 1
  `, [id]);
  return rows[0] || null;
}

async function loadFollowOnlyMatrixState() {
  const [rows] = await db.query(`
    SELECT
      e.codigo_evento,
      e.activo AS evento_activo,
      e.campana_default,
      e.push_default,
      SUM(
        CASE
          WHEN ner.activo = 1
           AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
          THEN 1 ELSE 0
        END
      ) AS roles_activos
    FROM notificacion_eventos e
    LEFT JOIN notificacion_evento_roles ner
      ON ner.codigo_evento = e.codigo_evento
    WHERE e.codigo_evento IN (?)
    GROUP BY e.codigo_evento, e.activo, e.campana_default, e.push_default
    ORDER BY e.codigo_evento
  `, [FOLLOW_ONLY_CODES]);
  return rows;
}

async function resolveFollowers(ticketRow) {
  return resolveSeguimientoRecipients_uni({
    executor: db,
    contextoNegocio: {
      dominio: 'UNITED',
      tipo: 'TICKET',
      id_ticket: Number(ticketRow.id) || null,
      ticket: ticketRow.ticket || TICKET_REF,
      numero_equipo: ticketRow.codigo_equipo || ticketRow.equipo || null,
      proyecto: ticketRow.proyecto || ticketRow.proyecto_padre || null
    },
    codigoEventoNativo: EVENT_CODE
  });
}

function validatePrecheck(matrixRows, resolved) {
  const errors = [];
  const byCode = new Map(matrixRows.map((row) => [String(row.codigo_evento), row]));

  for (const code of FOLLOW_ONLY_CODES) {
    const row = byCode.get(code);
    if (!row) {
      errors.push(`${code}: no existe en notificacion_eventos`);
      continue;
    }
    if (Number(row.evento_activo) !== 1) {
      errors.push(`${code}: evento_activo != 1`);
    }
    if (Number(row.roles_activos || 0) !== 0) {
      errors.push(`${code}: roles_activos=${Number(row.roles_activos || 0)}; esperado 0`);
    }
  }

  if (resolved?.applicable !== true) {
    errors.push('El resolver no considero aplicable el contexto UNITED del Ticket.');
  }

  const followerIds = ids(resolved?.followers || []);
  if (!followerIds.length) {
    errors.push('El resolver no encontro followers autorizados; no se ejecutara una prueba de emision.');
  }

  return { errors, followerIds };
}

async function rowsByTrace(traceId) {
  const [rows] = await db.query(`
    SELECT
      n.id_notificacion,
      n.id_usuario,
      n.tipo_notificacion,
      n.titulo_notificacion,
      n.mensaje_notificacion,
      n.icono_notificacion,
      n.codigos_visuales_json,
      n.clave_deduplicacion,
      n.trace_id,
      n.leido,
      n.activo,
      n.fecha_creacion,
      CASE
        WHEN JSON_CONTAINS(
          COALESCE(n.codigos_visuales_json, JSON_ARRAY()),
          JSON_QUOTE('SEGUIMIENTO_ESPECIAL')
        ) THEN 1 ELSE 0
      END AS tiene_seguimiento_especial
    FROM sup_notificaciones n
    WHERE n.trace_id = ?
    ORDER BY n.id_usuario, n.id_notificacion
  `, [traceId]);
  return rows;
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  console.log('QA_TICKET_254013_SEGUIMIENTO_ESPECIAL_V002');
  console.log(`Modo: ${confirm ? 'CONFIRM - CREA NOTIFICACION QA' : 'PRECHECK - SOLO LECTURA'}`);
  console.log(`Ticket: ${TICKET_REF}`);
  console.log(`Evento QA: ${EVENT_CODE}`);

  const ticketRow = await loadTicket();
  if (!ticketRow) {
    throw new Error(`No se encontro el Ticket ${TICKET_REF} en Aiven.`);
  }

  const matrixRows = await loadFollowOnlyMatrixState();
  const resolved = await resolveFollowers(ticketRow);
  const portfolioRow = await loadPortfolio(resolved?.context?.id_portafolio);
  const site = siteLabel_gnral({ ...ticketRow, ...(portfolioRow || {}) });

  printJson('TICKET', {
    id: Number(ticketRow.id) || null,
    ticket: ticketRow.ticket || null,
    codigo_equipo: ticketRow.codigo_equipo || null,
    proyecto: ticketRow.proyecto || ticketRow.proyecto_padre || null,
    sitio_visible: site
  });

  printJson('CONTEXTO RESUELTO', resolved?.context || null);
  printJson('FOLLOWERS AUTORIZADOS', resolved?.followers || []);
  printJson('MATRIZ FOLLOW-ONLY', matrixRows);

  const precheck = validatePrecheck(matrixRows, resolved);
  if (precheck.errors.length) {
    printJson('PRECHECK ERROR', precheck.errors);
    throw new Error('PRECHECK NO APROBADO. No se emitio ninguna notificacion.');
  }

  console.log(`\nPRECHECK: PASS | followers autorizados: ${precheck.followerIds.join(', ')}`);

  if (!confirm) {
    console.log('\nNO SE CREO NINGUNA NOTIFICACION.');
    console.log('Para ejecutar la prueba real:');
    console.log('node .\\scripts\\QA_TICKET_254013_SEGUIMIENTO_ESPECIAL_V002.js --confirm');
    return;
  }

  const traceId = crypto.randomUUID();
  const eventInstanceKey = `qa-seguimiento:${EVENT_CODE}:ticket:${TICKET_REF}:${Date.now()}`;

  const result = await emitBusinessEventSafe_gnral({
    codigoEvento: EVENT_CODE,
    destinatarios: [],
    actorUserId: null,
    zonaOperativaId: Number(resolved.context.zona_id) || null,
    requireRoleMatrix: true,
    allowMissingEvent: true,
    titulo: 'Ticket generado',
    mensaje: `[QA CONTROLADA] Se genero ticket ${TICKET_REF} · ${site}.`,
    icono: '🎫',
    accion: 'ABRIR_TICKET',
    idReferencia: Number(ticketRow.id) || null,
    ruta: `detalle:ticket:${TICKET_REF}`,
    eventInstanceKey,
    traceId,
    contextoSeguimiento: {
      dominio: 'UNITED',
      tipo: 'TICKET',
      id_ticket: Number(ticketRow.id) || null,
      ticket: ticketRow.ticket || TICKET_REF,
      id_portafolio: Number(resolved.context.id_portafolio) || null,
      numero_equipo: resolved.context.numero_equipo || ticketRow.codigo_equipo || null,
      proyecto: resolved.context.proyecto || ticketRow.proyecto || ticketRow.proyecto_padre || null,
      zona_id: Number(resolved.context.zona_id) || null,
      identificador_operacion: eventInstanceKey
    }
  }, {
    label: 'qa-ticket-254013-seguimiento-especial-v002'
  });

  const persisted = await rowsByTrace(traceId);
  const expectedIds = precheck.followerIds;
  const resultIds = ids(result?.recipients || []);
  const persistedIds = ids(persisted.map((row) => row.id_usuario));
  const generalRows = persisted.filter((row) => Number(row.tiene_seguimiento_especial) !== 1);

  printJson('RESULTADO MOTOR', result);
  printJson('FILAS PERSISTIDAS POR TRACE', persisted);

  const checks = {
    emitter_ok: result?.ok === true,
    created_matches_followers: Number(result?.created || 0) === expectedIds.length,
    recipients_match_followers: sameIds(resultIds, expectedIds),
    persisted_users_match_followers: sameIds(persistedIds, expectedIds),
    every_row_is_ticket_creado: persisted.every((row) => row.tipo_notificacion === EVENT_CODE),
    every_row_has_seguimiento_especial: persisted.length > 0 && generalRows.length === 0,
    no_general_rows: generalRows.length === 0,
    trace_matches: persisted.every((row) => row.trace_id === traceId)
  };

  printJson('CHECKS', checks);

  const failed = Object.entries(checks).filter(([, ok]) => ok !== true);
  if (failed.length) {
    printJson('QA FAIL', failed.map(([name]) => name));
    process.exitCode = 2;
    return;
  }

  console.log('\nQA RESULTADO: PASS');
  console.log(`TRACE_ID: ${traceId}`);
  console.log(`FOLLOWERS ESPERADOS/ENTREGADOS: ${expectedIds.join(', ')}`);
  console.log('El Ticket NO fue modificado. Solo se crearon notificaciones QA en sup_notificaciones.');
  console.log('Si el job Push esta activo, estas filas pueden generar Push real a los followers.');
}

main()
  .catch((error) => {
    console.error('\nQA RESULTADO: FAIL');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.close();
    } catch (_error) {
      // No ocultar el resultado principal por un error al cerrar el pool.
    }
  });
