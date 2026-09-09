'use strict';

const {
  listUsersWithEffectivePermission
} = require('../permissions/effective-permission.service');

const MANAGE_PERMISSION =
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';
const VISUAL_CODE = 'SEGUIMIENTO_ESPECIAL';

function cleanText(value, max = 500) {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, max) : null;
}

function positiveId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function uniqueFollowers(values) {
  const byUser = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const idUsuario = positiveId(value?.id_usuario ?? value);
    if (!idUsuario) continue;
    const origin = cleanText(value?.origen_seguimiento, 40) || 'EQUIPO';
    const current = byUser.get(idUsuario);
    if (!current || current.origen_seguimiento === 'PROYECTO_HEREDADO') {
      byUser.set(idUsuario, {
        id_usuario: idUsuario,
        origen_seguimiento: origin,
        autorizado: true
      });
    }
  }
  return [...byUser.values()];
}

function normalizeContext(contextoNegocio) {
  const source = contextoNegocio && typeof contextoNegocio === 'object'
    ? contextoNegocio
    : {};
  const snapshot = source.snapshot_pre_mutacion && typeof source.snapshot_pre_mutacion === 'object'
    ? source.snapshot_pre_mutacion
    : {};

  return {
    dominio: cleanText(source.dominio, 40)?.toUpperCase() || null,
    tipo: cleanText(source.tipo, 40)?.toUpperCase() || null,
    id_ticket: positiveId(source.id_ticket ?? snapshot.id_ticket),
    ticket: cleanText(source.ticket ?? snapshot.ticket, 255),
    id_portafolio: positiveId(source.id_portafolio ?? snapshot.id_portafolio),
    numero_equipo: cleanText(
      source.numero_equipo ?? source.equipo ?? snapshot.numero_equipo ?? snapshot.equipo,
      255
    ),
    proyecto: cleanText(source.proyecto ?? snapshot.proyecto, 255),
    zona_id: positiveId(source.zona_id ?? source.zonaOperativaId ?? snapshot.zona_id),
    snapshot_pre_mutacion: Object.keys(snapshot).length ? snapshot : null,
    followers_snapshot: uniqueFollowers(
      source.followers_snapshot ?? source.seguidores_snapshot ?? source.seguidores_aplicables ?? []
    ),
    identificador_operacion: cleanText(
      source.identificador_operacion ?? source.event_instance_key,
      255
    )
  };
}

async function findTicketContext(executor, context) {
  const clauses = [];
  const params = [];
  if (context.id_ticket) {
    clauses.push('t.id = ?');
    params.push(context.id_ticket);
  }
  if (context.ticket) {
    clauses.push("TRIM(COALESCE(t.ticket, '')) = TRIM(?)");
    params.push(context.ticket);
  }
  if (!clauses.length) return null;

  const [rows] = await executor.query(`
    SELECT
      t.id AS id_ticket,
      t.ticket,
      t.codigo_equipo AS numero_equipo,
      COALESCE(NULLIF(TRIM(t.proyecto), ''), NULLIF(TRIM(t.proyecto_padre), '')) AS proyecto
    FROM tickets t
    WHERE ${clauses.join(' OR ')}
    ORDER BY t.id DESC
    LIMIT 1
  `, params);
  return rows[0] || null;
}

async function findEquipmentContext(executor, context) {
  const clauses = [];
  const params = [];
  if (context.id_portafolio) {
    clauses.push('p.id_portafolio = ?');
    params.push(context.id_portafolio);
  }
  if (context.numero_equipo) {
    clauses.push("TRIM(COALESCE(p.numero_equipo, '')) = TRIM(?)");
    params.push(context.numero_equipo);
  }
  if (!clauses.length) return null;

  const [rows] = await executor.query(`
    SELECT p.id_portafolio, p.numero_equipo, p.proyecto, p.zona_id, p.estado_registro
    FROM portafolio p
    WHERE ${clauses.join(' OR ')}
    ORDER BY (p.id_portafolio = ?) DESC, p.estado_registro DESC, p.id_portafolio DESC
    LIMIT 1
  `, [...params, context.id_portafolio || 0]);
  return rows[0] || null;
}

async function resolveContext(executor, contextoNegocio) {
  const context = normalizeContext(contextoNegocio);
  if (context.dominio !== 'UNITED') return { applicable: false, context, equipmentRow: null };

  if ((!context.numero_equipo || !context.proyecto) && (context.id_ticket || context.ticket)) {
    const ticketRow = await findTicketContext(executor, context);
    if (ticketRow) {
      context.id_ticket = context.id_ticket || positiveId(ticketRow.id_ticket);
      context.ticket = context.ticket || cleanText(ticketRow.ticket, 255);
      context.numero_equipo = context.numero_equipo || cleanText(ticketRow.numero_equipo, 255);
      context.proyecto = context.proyecto || cleanText(ticketRow.proyecto, 255);
    }
  }

  let equipmentRow = null;
  if (context.id_portafolio || context.numero_equipo) {
    equipmentRow = await findEquipmentContext(executor, context);
    if (equipmentRow) {
      context.id_portafolio = context.id_portafolio || positiveId(equipmentRow.id_portafolio);
      context.numero_equipo = context.numero_equipo || cleanText(equipmentRow.numero_equipo, 255);
      context.proyecto = context.proyecto || cleanText(equipmentRow.proyecto, 255);
      context.zona_id = context.zona_id || positiveId(equipmentRow.zona_id);
    }
  }

  const verified = Boolean(
    (context.id_portafolio && context.numero_equipo && context.zona_id) ||
    (context.proyecto && context.zona_id)
  );

  return { applicable: verified, context, equipmentRow };
}

function currentUnitedScopeSql(userAlias, zoneSql) {
  return `(
    EXISTS (
      SELECT 1
      FROM usuarios_alcance_informacion uai_se_master
      WHERE uai_se_master.id_usuario = ${userAlias}
        AND uai_se_master.tipo_alcance = 'DOMINIO_COMPLETO'
        AND UPPER(TRIM(uai_se_master.dominio)) = 'UNITED'
        AND uai_se_master.activo = 1
    )
    OR (
      EXISTS (
        SELECT 1
        FROM usuarios_alcance_informacion uai_se_group
        INNER JOIN perm_agrupaciones pa_se
          ON pa_se.id_agrupacion = uai_se_group.id_agrupacion
         AND pa_se.codigo = 'PORTAFOLIO'
         AND pa_se.activo = 1
        WHERE uai_se_group.id_usuario = ${userAlias}
          AND uai_se_group.tipo_alcance = 'AGRUPACION'
          AND uai_se_group.activo = 1
      )
      AND ${zoneSql} IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM usuario_zop uz_se
        WHERE uz_se.usuario_id = ${userAlias}
          AND uz_se.zona_id = ${zoneSql}
          AND uz_se.estado = 1
      )
    )
  )`;
}

async function recipientsForEquipment(executor, equipment) {
  const idPortafolio = positiveId(equipment?.id_portafolio);
  const project = cleanText(equipment?.proyecto, 255);
  const zoneId = positiveId(equipment?.zona_id);
  if (!idPortafolio || !zoneId) return [];

  const [rows] = await executor.query(`
    SELECT
      candidate.id_usuario,
      CASE
        WHEN MAX(candidate.directo) = 1 THEN MAX(candidate.origen_seguimiento)
        ELSE 'PROYECTO_HEREDADO'
      END AS origen_seguimiento
    FROM (
      SELECT
        direct_follow.id_usuario,
        1 AS directo,
        direct_follow.origen AS origen_seguimiento
      FROM portafolio_interes direct_follow
      WHERE direct_follow.id_portafolio = ?
        AND direct_follow.activo = 1

      UNION ALL

      SELECT
        project_follow.id_usuario,
        0 AS directo,
        'PROYECTO_HEREDADO' AS origen_seguimiento
      FROM portafolio_interes project_follow
      INNER JOIN portafolio project_source
        ON project_source.id_portafolio = project_follow.id_portafolio
       AND project_source.estado_registro = 1
      WHERE project_follow.activo = 1
        AND project_follow.origen = 'PROYECTO'
        AND LOWER(TRIM(COALESCE(project_source.proyecto, ''))) = LOWER(TRIM(?))
        AND NOT EXISTS (
          SELECT 1
          FROM portafolio_interes direct_override
          WHERE direct_override.id_usuario = project_follow.id_usuario
            AND direct_override.id_portafolio = ?
        )
    ) candidate
    INNER JOIN usuarios u_interest
      ON u_interest.id_SB = candidate.id_usuario
     AND u_interest.estado = 1
    WHERE ${currentUnitedScopeSql('candidate.id_usuario', '?')}
    GROUP BY candidate.id_usuario
  `, [idPortafolio, project || '', idPortafolio, zoneId, zoneId]);

  return uniqueFollowers(rows);
}

async function recipientsForProject(executor, project, zoneId) {
  const ref = cleanText(project, 255);
  const normalizedZoneId = positiveId(zoneId);
  if (!ref || !normalizedZoneId) return [];

  const [rows] = await executor.query(`
    SELECT DISTINCT pi.id_usuario, 'PROYECTO' AS origen_seguimiento
    FROM portafolio_interes pi
    INNER JOIN portafolio p_interest
      ON p_interest.id_portafolio = pi.id_portafolio
     AND p_interest.estado_registro = 1
    INNER JOIN usuarios u_interest
      ON u_interest.id_SB = pi.id_usuario
     AND u_interest.estado = 1
    WHERE pi.activo = 1
      AND pi.origen = 'PROYECTO'
      AND LOWER(TRIM(COALESCE(p_interest.proyecto, ''))) = LOWER(TRIM(?))
      AND p_interest.zona_id = ?
      AND ${currentUnitedScopeSql('pi.id_usuario', 'p_interest.zona_id')}
  `, [ref, normalizedZoneId]);

  return uniqueFollowers(rows);
}

async function filterByPermission(executor, followers) {
  const normalized = uniqueFollowers(followers);
  if (!normalized.length) return [];
  const permitted = new Set(
    (await listUsersWithEffectivePermission(MANAGE_PERMISSION, executor)).map(Number)
  );
  return normalized.filter((item) => permitted.has(item.id_usuario));
}

async function resolveSeguimientoRecipients_uni({
  executor,
  contextoNegocio,
  actorUserId,
  codigoEventoNativo
}) {
  if (!executor || typeof executor.query !== 'function') {
    throw new Error('Se requiere un executor MySQL para resolver Seguimiento Especial.');
  }

  const resolved = await resolveContext(executor, contextoNegocio);
  if (!resolved.applicable) {
    return {
      applicable: false,
      context: resolved.context,
      followers: [],
      visual_codes: [],
      follow_candidate_count: 0,
      follow_authorized_count: 0
    };
  }

  const rawFollowers = resolved.context.followers_snapshot.length
    ? resolved.context.followers_snapshot
    : (resolved.context.id_portafolio
      ? await recipientsForEquipment(executor, resolved.context)
      : await recipientsForProject(executor, resolved.context.proyecto, resolved.context.zona_id));
  const actorId = positiveId(actorUserId);
  const followers = (await filterByPermission(executor, rawFollowers))
    .filter((item) => !actorId || item.id_usuario !== actorId);

  return {
    applicable: true,
    context: resolved.context,
    followers,
    visual_codes: followers.length ? [VISUAL_CODE] : [],
    follow_candidate_count: uniqueFollowers(rawFollowers).length,
    follow_authorized_count: followers.length,
    codigo_evento_nativo: cleanText(codigoEventoNativo, 120)
  };
}

module.exports = {
  MANAGE_PERMISSION,
  VISUAL_CODE,
  normalizeContext,
  resolveContext,
  recipientsForEquipment,
  recipientsForProject,
  filterByPermission,
  currentUnitedScopeSql,
  resolveSeguimientoRecipients_uni
};
