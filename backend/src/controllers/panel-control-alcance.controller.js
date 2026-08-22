'use strict';

const db = require('../config/db');
const {
  normalizeInformationScopePayload_gnral,
  readInformationScope_gnral,
  replaceInformationScope_gnral,
  activateInformationScopeBulk_gnral
} = require('../services/information-scope-gnral.service');
const {
  hasNewPanelPayload_gnral,
  readPanelScope_gnral,
  savePanelScope_gnral,
  activatePanelScopeBulk_gnral
} = require('../services/alcance/alcance-panel.service');

function roleNames_gnral(req) {
  const actor = req.actorUser || req.user || {};
  return new Set(
    [actor.rol, ...(actor.roles || [])]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
  );
}

function canManageGlobalInformationScope_gnral(req) {
  const roles = roleNames_gnral(req);
  return roles.has('programador') || roles.has('director general');
}

function canManageAdditionalInformationUsers_gnral(req) {
  return roleNames_gnral(req).has('programador');
}

function informationScopeCapabilities_gnral(req) {
  return {
    puede_gestionar_alcance: canManageGlobalInformationScope_gnral(req),
    puede_gestionar_usuarios_adicionales: canManageAdditionalInformationUsers_gnral(req),
    alcance_general_default: true,
    alcance_corellian_personas: true,
    alcance_united_zonas: true
  };
}

function denyUnlessGlobalInformationScopeManager_gnral(req, res) {
  if (canManageGlobalInformationScope_gnral(req)) return false;
  res.status(403).json({
    ok: false,
    message: 'No tienes autorizacion para administrar el alcance global de informacion.'
  });
  return true;
}

function positiveUserId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function assertConfiguredUserExists_gnral(connection, userId, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT id_SB, nombre, correo, estado
       FROM usuarios
      WHERE id_SB = ?
      LIMIT 1${suffix}`,
    [userId]
  );
  if (!rows.length) {
    const error = new Error('Usuario no encontrado.');
    error.status = 404;
    throw error;
  }
  return rows[0];
}

function activeRowCountLegacy_gnral(scope) {
  return Number(scope.ver_reporta_a ? 1 : 0)
    + Number(scope.ver_rel_admin ? 1 : 0)
    + (scope.dominios_completos || []).length
    + (scope.agrupaciones || []).length
    + (scope.usuarios_adicionales || []).length;
}

function samePositiveIdSet_gnral(left, right) {
  const normalize = (values) => [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function panelResponseData_gnral(req, scope, user) {
  const general = scope?.alcances?.general || {};
  const corellian = scope?.alcances?.corellian || {};
  const united = scope?.alcances?.united || {};
  const registros = Number(general.llave_maestra ? 1 : 0)
    + (general.agrupaciones || []).length
    + Number(corellian.llave_maestra ? 1 : 0)
    + Number(united.llave_maestra ? 1 : 0)
    + (corellian.agrupaciones || []).length
    + (united.agrupaciones || []).length
    + Number(corellian.ver_reporta_a ? 1 : 0)
    + Number(corellian.ver_rel_admin ? 1 : 0)
    + (corellian.usuarios_adicionales || []).length
    + (united.zonas || []).length;

  return {
    ...scope,
    id_usuario: Number(user.id_SB),
    usuario: user.nombre,
    registros_activos: registros,
    capacidades: informationScopeCapabilities_gnral(req)
  };
}

async function getUserInformationScope_gnral(req, res, next) {
  try {
    if (denyUnlessGlobalInformationScopeManager_gnral(req, res)) return;
    const userId = positiveUserId(req.params.id);
    if (!userId) return res.status(400).json({ ok: false, message: 'Usuario invalido.' });

    const user = await assertConfiguredUserExists_gnral(db, userId);
    const scope = await readPanelScope_gnral(db, userId);
    return res.json({ ok: true, data: panelResponseData_gnral(req, scope, user) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    next(error);
  }
}

async function saveNewPanelScope_gnral(req, res, next) {
  const connection = await db.getConnection();
  try {
    const userId = positiveUserId(req.params.id);
    const actor = req.actorUser || req.user || {};
    const actorId = positiveUserId(actor.id_SB || actor.id);
    if (!userId) return res.status(400).json({ ok: false, message: 'Usuario invalido.' });
    if (!actorId) return res.status(401).json({ ok: false, message: 'Sesion requerida.' });

    await connection.beginTransaction();
    const user = await assertConfiguredUserExists_gnral(connection, userId, true);
    const saved = await savePanelScope_gnral(connection, userId, req.body, actor, {
      preserveAdditionalUsers: !canManageAdditionalInformationUsers_gnral(req)
    });
    await connection.commit();

    return res.json({
      ok: true,
      message: 'Alcance GENERAL / CORELLIAN / UNITED guardado correctamente.',
      data: panelResponseData_gnral(req, saved, user)
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    next(error);
  } finally {
    connection.release();
  }
}

async function saveLegacyScope_gnral(req, res, next) {
  const connection = await db.getConnection();
  try {
    const userId = positiveUserId(req.params.id);
    const actorId = positiveUserId((req.actorUser || req.user)?.id_SB);
    if (!userId) return res.status(400).json({ ok: false, message: 'Usuario invalido.' });
    if (!actorId) return res.status(401).json({ ok: false, message: 'Sesion requerida.' });

    const rawPayload = req.body || {};
    const payload = normalizeInformationScopePayload_gnral(rawPayload, userId);
    const canManageAdditionalUsers = canManageAdditionalInformationUsers_gnral(req);
    const groupingFieldProvided = Object.prototype.hasOwnProperty.call(rawPayload, 'agrupaciones')
      || Object.prototype.hasOwnProperty.call(rawPayload, 'agrupaciones_acceso');

    await connection.beginTransaction();
    const user = await assertConfiguredUserExists_gnral(connection, userId, true);
    const current = await readInformationScope_gnral(connection, userId);
    if (!groupingFieldProvided) payload.agrupaciones = [...(current.agrupaciones || [])];

    if (!canManageAdditionalUsers && !samePositiveIdSet_gnral(
      current.usuarios_adicionales,
      payload.usuarios_adicionales
    )) {
      const error = new Error('Solo el rol Programador puede modificar Usuarios adicionales.');
      error.status = 403;
      throw error;
    }

    const savedLegacy = await replaceInformationScope_gnral(
      connection,
      userId,
      payload,
      actorId,
      { preserveAdditionalUsers: !canManageAdditionalUsers }
    );
    await connection.commit();

    // Lectura con contrato F6, conservando los campos legacy para despliegue gradual.
    const saved = await readPanelScope_gnral(db, userId);
    return res.json({
      ok: true,
      message: 'Alcance de informacion guardado correctamente.',
      data: {
        ...panelResponseData_gnral(req, saved, user),
        registros_legacy: activeRowCountLegacy_gnral(savedLegacy)
      }
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    next(error);
  } finally {
    connection.release();
  }
}

async function saveUserInformationScope_gnral(req, res, next) {
  if (denyUnlessGlobalInformationScopeManager_gnral(req, res)) return;
  return hasNewPanelPayload_gnral(req.body)
    ? saveNewPanelScope_gnral(req, res, next)
    : saveLegacyScope_gnral(req, res, next);
}

async function activateUserInformationScopeBulk_gnral(req, res, next) {
  const connection = await db.getConnection();
  try {
    if (denyUnlessGlobalInformationScopeManager_gnral(req, res)) return;
    const actor = req.actorUser || req.user || {};
    const actorId = positiveUserId(actor.id_SB || actor.id);
    if (!actorId) return res.status(401).json({ ok: false, message: 'Sesion requerida.' });

    const userIds = Array.isArray(req.body?.usuario_ids) ? req.body.usuario_ids : [];
    const activation = req.body?.activar || {};
    const newBulk = hasNewPanelPayload_gnral(activation);

    await connection.beginTransaction();
    const result = newBulk
      ? await activatePanelScopeBulk_gnral(
        connection,
        userIds,
        activation.alcances || activation,
        actor,
        { preserveAdditionalUsers: true }
      )
      : await activateInformationScopeBulk_gnral(
        connection,
        userIds,
        activation,
        actorId
      );
    await connection.commit();

    return res.json({
      ok: true,
      message: `Activacion masiva aplicada a ${result.usuarios_actualizados} usuario(s).`,
      data: {
        ...result,
        version_alcance: newBulk ? 'F6_V001' : 'LEGACY_COMPAT',
        capacidades: informationScopeCapabilities_gnral(req)
      }
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    next(error);
  } finally {
    connection.release();
  }
}

module.exports = {
  getUserInformationScope_gnral,
  saveUserInformationScope_gnral,
  activateUserInformationScopeBulk_gnral
};
