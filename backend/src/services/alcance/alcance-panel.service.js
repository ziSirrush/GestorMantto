'use strict';

const {
  GENERAL_COMPANY
} = require('./alcance-gnral.service');
const {
  CORELLIAN_COMPANY
} = require('./alcance-cor.service');
const {
  UNITED_COMPANY
} = require('./alcance-uni.service');
const {
  normalizeGroupingCompany_gnral
} = require('./alcance-resolver.service');

const PANEL_SCOPE_VERSION = 'F6_V001';

function panelError_gnral(message, status = 400, code = 'ALCANCE_PANEL_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function assertExecutor_gnral(executor) {
  if (!executor || typeof executor.query !== 'function') {
    throw panelError_gnral(
      'Executor SQL no disponible para administrar Alcance de Informacion.',
      500,
      'ALCANCE_PANEL_EXECUTOR_REQUIRED'
    );
  }
  return executor;
}

function positiveId_gnral(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function positiveIds_gnral(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source.map(positiveId_gnral).filter(Boolean))].sort((a, b) => a - b);
}

function bool_gnral(value) {
  return value === true || value === 1 || value === '1';
}

function normalizeDomainConfig_gnral(source, domain) {
  const input = source && typeof source === 'object' ? source : {};
  return {
    llave_maestra: bool_gnral(input.llave_maestra ?? input.dominio_completo),
    agrupaciones: positiveIds_gnral(input.agrupaciones),
    ver_propio: true,
    ver_reporta_a: domain === CORELLIAN_COMPANY ? bool_gnral(input.ver_reporta_a) : false,
    ver_rel_admin: domain === CORELLIAN_COMPANY ? bool_gnral(input.ver_rel_admin) : false,
    usuarios_adicionales: domain === CORELLIAN_COMPANY
      ? positiveIds_gnral(input.usuarios_adicionales)
      : [],
    // FASE 1 Puertas/Cuartos:
    // Alcance administra puertas. Los cuartos UNITED se administran
    // exclusivamente desde Panel de Control > Usuarios y usuario_zop.
    zonas: []
  };
}

function normalizeNewPanelPayload_gnral(body) {
  const root = body && typeof body === 'object' ? body : {};
  const scopes = root.alcances && typeof root.alcances === 'object' ? root.alcances : root;
  const general = normalizeDomainConfig_gnral(scopes.general, GENERAL_COMPANY);
  const corellian = normalizeDomainConfig_gnral(scopes.corellian, CORELLIAN_COMPANY);
  const united = normalizeDomainConfig_gnral(scopes.united, UNITED_COMPANY);

  return {
    general: {
      ...general,
      default: true,
      ver_propio: true,
      creado_por_mi: true,
      asignado_a_mi: true,
      relacionado_conmigo: true
    },
    corellian,
    united
  };
}

function hasNewPanelPayload_gnral(body) {
  const root = body && typeof body === 'object' ? body : {};
  return Boolean(
    root.alcances
    || Object.prototype.hasOwnProperty.call(root, 'general')
    || Object.prototype.hasOwnProperty.call(root, 'corellian')
    || Object.prototype.hasOwnProperty.call(root, 'united')
  );
}

async function readZoneCatalog_gnral(executor) {
  const db = assertExecutor_gnral(executor);
  const [rows] = await db.query(
    `SELECT id_zona, zona, nombre, estado
       FROM z_op
      WHERE estado = 1
      ORDER BY zona ASC, id_zona ASC`
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id_zona: Number(row.id_zona),
    zona: String(row.zona || '').trim() || null,
    nombre: String(row.nombre || '').trim() || null,
    estado: Number(row.estado) === 1 ? 1 : 0
  }));
}

async function readUserZones_gnral(executor, userId) {
  const db = assertExecutor_gnral(executor);
  const id = positiveId_gnral(userId);
  if (!id) throw panelError_gnral('Usuario invalido.', 400, 'ALCANCE_PANEL_USER_INVALID');

  const [rows] = await db.query(
    `SELECT uz.zona_id AS id_zona, z.zona, z.nombre
       FROM usuario_zop uz
       INNER JOIN z_op z
         ON z.id_zona = uz.zona_id
        AND z.estado = 1
      WHERE uz.usuario_id = ?
        AND uz.estado = 1
      ORDER BY z.zona ASC, uz.zona_id ASC`,
    [id]
  );

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id_zona: Number(row.id_zona),
    zona: String(row.zona || '').trim() || null,
    nombre: String(row.nombre || '').trim() || null
  }));
}

async function readGroupingDomains_gnral(executor, groupingIds) {
  const db = assertExecutor_gnral(executor);
  const ids = positiveIds_gnral(groupingIds);
  if (!ids.length) return new Map();

  const [rows] = await db.query(
    `SELECT id_agrupacion, codigo, nombre, empresa, activo
       FROM perm_agrupaciones
      WHERE id_agrupacion IN (?)`,
    [ids]
  );

  const result = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const id = positiveId_gnral(row.id_agrupacion);
    if (!id || Number(row.activo) !== 1) continue;
    result.set(id, {
      id_agrupacion: id,
      codigo: String(row.codigo || '').trim() || null,
      nombre: String(row.nombre || '').trim() || null,
      empresa_origen: String(row.empresa || '').trim() || null,
      empresa: normalizeGroupingCompany_gnral(row.empresa)
    });
  }
  return result;
}

async function readPanelScope_gnral(executor, userId, options = {}) {
  const db = assertExecutor_gnral(executor);
  const id = positiveId_gnral(userId);
  if (!id) throw panelError_gnral('Usuario invalido.', 400, 'ALCANCE_PANEL_USER_INVALID');

  const [rows] = await db.query(
    `SELECT id_alcance, tipo_alcance, dominio, id_agrupacion, id_usuario_visible
       FROM usuarios_alcance_informacion
      WHERE id_usuario = ?
        AND activo = 1
      ORDER BY id_alcance ASC`,
    [id]
  );

  const activeRows = Array.isArray(rows) ? rows : [];
  const groupingIds = positiveIds_gnral(
    activeRows.filter((row) => String(row.tipo_alcance || '').trim().toUpperCase() === 'AGRUPACION')
      .map((row) => row.id_agrupacion)
  );
  const groupingDomains = await readGroupingDomains_gnral(db, groupingIds);

  const general = {
    llave_maestra: false,
    agrupaciones: [],
    default: true,
    ver_propio: true,
    creado_por_mi: true,
    asignado_a_mi: true,
    relacionado_conmigo: true
  };
  const corellian = {
    llave_maestra: false,
    agrupaciones: [],
    ver_propio: true,
    ver_reporta_a: false,
    ver_rel_admin: false,
    usuarios_adicionales: []
  };
  const united = {
    llave_maestra: false,
    agrupaciones: [],
    zonas: [],
    zonas_detalle: []
  };

  const additional = new Set();
  for (const row of activeRows) {
    const type = String(row.tipo_alcance || '').trim().toUpperCase();
    if (type === 'DOMINIO_COMPLETO') {
      const domain = String(row.dominio || '').trim().toUpperCase();
      if (domain === GENERAL_COMPANY) general.llave_maestra = true;
      if (domain === CORELLIAN_COMPANY) corellian.llave_maestra = true;
      if (domain === UNITED_COMPANY) united.llave_maestra = true;
      continue;
    }
    if (type === 'AGRUPACION') {
      const groupingId = positiveId_gnral(row.id_agrupacion);
      const grouping = groupingDomains.get(groupingId);
      if (!grouping) continue;
      if (grouping.empresa === GENERAL_COMPANY) general.agrupaciones.push(groupingId);
      if (grouping.empresa === CORELLIAN_COMPANY) corellian.agrupaciones.push(groupingId);
      if (grouping.empresa === UNITED_COMPANY) united.agrupaciones.push(groupingId);
      continue;
    }
    if (type === 'REPORTA_A') {
      corellian.ver_reporta_a = true;
      continue;
    }
    if (type === 'REL_ADMIN') {
      corellian.ver_rel_admin = true;
      continue;
    }
    if (type === 'USUARIO') {
      const visibleId = positiveId_gnral(row.id_usuario_visible);
      if (visibleId && visibleId !== id) additional.add(visibleId);
    }
  }

  general.agrupaciones = positiveIds_gnral(general.agrupaciones);
  corellian.agrupaciones = positiveIds_gnral(corellian.agrupaciones);
  united.agrupaciones = positiveIds_gnral(united.agrupaciones);
  corellian.usuarios_adicionales = positiveIds_gnral([...additional]);

  // Lectura informativa: Alcance puede mostrar las zonas actuales, pero no las administra.
  const zones = await readUserZones_gnral(db, id);
  united.zonas = positiveIds_gnral(zones.map((zone) => zone.id_zona));
  united.zonas_detalle = zones;

  const domainsLegacy = [];
  if (general.llave_maestra) domainsLegacy.push(GENERAL_COMPANY);
  if (corellian.llave_maestra) domainsLegacy.push(CORELLIAN_COMPANY);
  if (united.llave_maestra) domainsLegacy.push(UNITED_COMPANY);
  const groupingsLegacy = positiveIds_gnral([
    ...general.agrupaciones,
    ...corellian.agrupaciones,
    ...united.agrupaciones
  ]);

  const result = {
    version_alcance: PANEL_SCOPE_VERSION,
    id_usuario: id,
    alcances: {
      general,
      corellian,
      united
    },
    dominios_completos: domainsLegacy,
    agrupaciones: groupingsLegacy,
    ver_propio: true,
    ver_reporta_a: corellian.ver_reporta_a,
    ver_rel_admin: corellian.ver_rel_admin,
    usuarios_adicionales: [...corellian.usuarios_adicionales]
  };

  if (options.includeCatalogs !== false) {
    result.catalogos = {
      zonas_operativas: await readZoneCatalog_gnral(db)
    };
  }

  return result;
}

async function assertUsersExist_gnral(executor, userIds) {
  const db = assertExecutor_gnral(executor);
  const ids = positiveIds_gnral(userIds);
  if (!ids.length) return;
  const [rows] = await db.query('SELECT id_SB FROM usuarios WHERE id_SB IN (?)', [ids]);
  const found = new Set((Array.isArray(rows) ? rows : []).map((row) => Number(row.id_SB)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw panelError_gnral(
      `Uno o mas usuarios adicionales no existen: ${missing.join(', ')}.`,
      400,
      'ALCANCE_PANEL_USERS_NOT_FOUND'
    );
  }
}

async function assertGroupingIdsForDomain_gnral(executor, ids, domain) {
  const normalized = positiveIds_gnral(ids);
  if (!normalized.length) return [];
  const mapping = await readGroupingDomains_gnral(executor, normalized);
  const missing = normalized.filter((id) => !mapping.has(id));
  if (missing.length) {
    throw panelError_gnral(
      `Una o mas agrupaciones no existen o estan inactivas: ${missing.join(', ')}.`,
      400,
      'ALCANCE_PANEL_GROUPINGS_NOT_FOUND'
    );
  }
  const wrong = normalized.filter((id) => mapping.get(id)?.empresa !== domain);
  if (wrong.length) {
    throw panelError_gnral(
      `Las agrupaciones ${wrong.join(', ')} no pertenecen a ${domain}.`,
      400,
      'ALCANCE_PANEL_GROUPING_COMPANY_MISMATCH'
    );
  }
  return normalized;
}

async function replaceScopeRows_gnral(executor, userId, normalized, actorId, options = {}) {
  const db = assertExecutor_gnral(executor);
  const preserveAdditionalUsers = options.preserveAdditionalUsers === true;

  const targetTypes = preserveAdditionalUsers
    ? ['DOMINIO_COMPLETO', 'AGRUPACION', 'REPORTA_A', 'REL_ADMIN']
    : ['DOMINIO_COMPLETO', 'AGRUPACION', 'REPORTA_A', 'REL_ADMIN', 'USUARIO'];

  await db.query(
    `UPDATE usuarios_alcance_informacion
        SET activo = 0,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id_usuario = ?
        AND activo = 1
        AND tipo_alcance IN (?)`,
    [actorId, userId, targetTypes]
  );

  const rows = [];
  if (normalized.general.llave_maestra) {
    rows.push([userId, 'DOMINIO_COMPLETO', GENERAL_COMPANY, null, null, actorId, actorId]);
  } else {
    normalized.general.agrupaciones.forEach((idGrouping) => {
      rows.push([userId, 'AGRUPACION', null, idGrouping, null, actorId, actorId]);
    });
  }
  if (normalized.corellian.llave_maestra) {
    rows.push([userId, 'DOMINIO_COMPLETO', CORELLIAN_COMPANY, null, null, actorId, actorId]);
  } else {
    normalized.corellian.agrupaciones.forEach((idGrouping) => {
      rows.push([userId, 'AGRUPACION', null, idGrouping, null, actorId, actorId]);
    });
  }
  if (normalized.united.llave_maestra) {
    rows.push([userId, 'DOMINIO_COMPLETO', UNITED_COMPANY, null, null, actorId, actorId]);
  } else {
    normalized.united.agrupaciones.forEach((idGrouping) => {
      rows.push([userId, 'AGRUPACION', null, idGrouping, null, actorId, actorId]);
    });
  }
  if (normalized.corellian.ver_reporta_a) {
    rows.push([userId, 'REPORTA_A', null, null, null, actorId, actorId]);
  }
  if (normalized.corellian.ver_rel_admin) {
    rows.push([userId, 'REL_ADMIN', null, null, null, actorId, actorId]);
  }
  if (!preserveAdditionalUsers) {
    normalized.corellian.usuarios_adicionales.forEach((visibleId) => {
      rows.push([userId, 'USUARIO', null, null, visibleId, actorId, actorId]);
    });
  }

  for (const row of rows) {
    await db.query(
      `INSERT INTO usuarios_alcance_informacion
        (id_usuario, tipo_alcance, dominio, id_agrupacion, id_usuario_visible, activo, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      row
    );
  }
}

async function savePanelScope_gnral(executor, userId, body, actor, options = {}) {
  const db = assertExecutor_gnral(executor);
  const id = positiveId_gnral(userId);
  const actorId = positiveId_gnral(actor?.id_SB || actor?.id || actor?.user_id);
  if (!id) throw panelError_gnral('Usuario invalido.', 400, 'ALCANCE_PANEL_USER_INVALID');
  if (!actorId) throw panelError_gnral('Actor invalido.', 401, 'ALCANCE_PANEL_ACTOR_REQUIRED');

  const normalized = normalizeNewPanelPayload_gnral(body);
  normalized.general.agrupaciones = await assertGroupingIdsForDomain_gnral(
    db,
    normalized.general.agrupaciones,
    GENERAL_COMPANY
  );
  normalized.corellian.agrupaciones = await assertGroupingIdsForDomain_gnral(
    db,
    normalized.corellian.agrupaciones,
    CORELLIAN_COMPANY
  );
  normalized.united.agrupaciones = await assertGroupingIdsForDomain_gnral(
    db,
    normalized.united.agrupaciones,
    UNITED_COMPANY
  );

  normalized.corellian.usuarios_adicionales = positiveIds_gnral(
    normalized.corellian.usuarios_adicionales
  ).filter((visibleId) => visibleId !== id);

  const preserveAdditionalUsers = options.preserveAdditionalUsers === true;
  if (preserveAdditionalUsers) {
    const current = await readPanelScope_gnral(db, id, { includeCatalogs: false });
    const currentAdditional = positiveIds_gnral(
      current.alcances?.corellian?.usuarios_adicionales || []
    );
    if (JSON.stringify(currentAdditional) !== JSON.stringify(normalized.corellian.usuarios_adicionales)) {
      throw panelError_gnral(
        'Solo el rol Programador puede modificar Usuarios adicionales Corellian.',
        403,
        'ALCANCE_PANEL_ADDITIONAL_USERS_FORBIDDEN'
      );
    }
    normalized.corellian.usuarios_adicionales = currentAdditional;
  }
  await assertUsersExist_gnral(db, normalized.corellian.usuarios_adicionales);

  // Alcance guarda exclusivamente puertas/llaves/reglas de informacion.
  // NO modifica usuario_zop: los cuartos UNITED se administran en Usuarios.
  await replaceScopeRows_gnral(db, id, normalized, actorId, { preserveAdditionalUsers });

  return readPanelScope_gnral(db, id);
}

function mergeBulkActivation_gnral(current, activation) {
  const currentScopes = current?.alcances || {};
  const add = normalizeNewPanelPayload_gnral({ alcances: activation });

  return {
    alcances: {
      general: {
        llave_maestra: Boolean(currentScopes.general?.llave_maestra || add.general.llave_maestra),
        agrupaciones: positiveIds_gnral([
          ...(currentScopes.general?.agrupaciones || []),
          ...add.general.agrupaciones
        ])
      },
      corellian: {
        llave_maestra: Boolean(currentScopes.corellian?.llave_maestra || add.corellian.llave_maestra),
        agrupaciones: positiveIds_gnral([
          ...(currentScopes.corellian?.agrupaciones || []),
          ...add.corellian.agrupaciones
        ]),
        ver_reporta_a: Boolean(currentScopes.corellian?.ver_reporta_a || add.corellian.ver_reporta_a),
        ver_rel_admin: Boolean(currentScopes.corellian?.ver_rel_admin || add.corellian.ver_rel_admin),
        usuarios_adicionales: [...(currentScopes.corellian?.usuarios_adicionales || [])]
      },
      united: {
        llave_maestra: Boolean(currentScopes.united?.llave_maestra || add.united.llave_maestra),
        agrupaciones: positiveIds_gnral([
          ...(currentScopes.united?.agrupaciones || []),
          ...add.united.agrupaciones
        ])
      }
    }
  };
}

async function activatePanelScopeBulk_gnral(executor, userIds, activation, actor, options = {}) {
  const db = assertExecutor_gnral(executor);
  const ids = positiveIds_gnral(userIds);
  if (!ids.length) {
    throw panelError_gnral('Selecciona al menos un usuario.', 400, 'ALCANCE_PANEL_BULK_USERS_REQUIRED');
  }
  if (ids.length > 200) {
    throw panelError_gnral('La activacion masiva admite como maximo 200 usuarios.', 400, 'ALCANCE_PANEL_BULK_LIMIT');
  }

  const normalizedActivation = normalizeNewPanelPayload_gnral({ alcances: activation });
  const hasActivation = normalizedActivation.general.llave_maestra
    || normalizedActivation.general.agrupaciones.length
    || normalizedActivation.corellian.llave_maestra
    || normalizedActivation.corellian.agrupaciones.length
    || normalizedActivation.corellian.ver_reporta_a
    || normalizedActivation.corellian.ver_rel_admin
    || normalizedActivation.united.llave_maestra
    || normalizedActivation.united.agrupaciones.length;
  if (!hasActivation) {
    throw panelError_gnral(
      'Selecciona al menos una llave, puerta o regla de alcance.',
      400,
      'ALCANCE_PANEL_BULK_EMPTY'
    );
  }

  await assertUsersExist_gnral(db, ids);
  for (const userId of ids) {
    const current = await readPanelScope_gnral(db, userId, { includeCatalogs: false });
    const merged = mergeBulkActivation_gnral(current, activation);
    await savePanelScope_gnral(db, userId, merged, actor, {
      preserveAdditionalUsers: options.preserveAdditionalUsers !== false
    });
  }

  return {
    usuarios_actualizados: ids.length,
    usuario_ids: ids,
    activado: normalizedActivation
  };
}

module.exports = {
  PANEL_SCOPE_VERSION,
  hasNewPanelPayload_gnral,
  normalizeNewPanelPayload_gnral,
  readZoneCatalog_gnral,
  readUserZones_gnral,
  readPanelScope_gnral,
  savePanelScope_gnral,
  activatePanelScopeBulk_gnral
};
