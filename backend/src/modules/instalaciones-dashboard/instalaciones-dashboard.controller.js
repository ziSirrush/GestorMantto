'use strict';

const db = require('../../config/db');
const service = require('./instalaciones-dashboard.service');
const {
  resolveInformationScopeForContext_gnral,
  hasCompleteDomain_gnral,
  listVisibleUserProfiles_gnral,
  runInformationScopeWithFallback_gnral
} = require('../../services/information-scope-gnral.service');

function sendKnownError_cor(error, res, next) {
  if (error && (error.statusCode || error.status)) {
    return res.status(Number(error.statusCode || error.status)).json({
      ok: false,
      code: error.code || 'INSTALACIONES_DASHBOARD_ERROR',
      message: error.message,
      details: error.details || undefined
    });
  }
  return next(error);
}

function scopeError_cor(message, code = 'INSTALACIONES_DASHBOARD_SCOPE_FORBIDDEN') {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = code;
  return error;
}

function effectiveUser_cor(req) {
  return req.contextUser || req.user || null;
}

function effectiveUserId_cor(req) {
  const id = Number(effectiveUser_cor(req)?.id_SB);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolveInformationGuard_cor(req) {
  return runInformationScopeWithFallback_gnral({
    label: 'instalaciones-dashboard',
    modern: () => resolveInformationScopeForContext_gnral(db, {
      user: req.user,
      contextUser: effectiveUser_cor(req)
    }),
    legacy: () => ({ legacy: true, dominios_completos: [], usuarios_visibles: [] })
  });
}

function supervisorValues_cor(value) {
  const raw = Array.isArray(value) ? value : [value];
  return [...new Set(raw.flatMap(item => String(item == null ? '' : item).split(','))
    .map(item => item.trim().toUpperCase()).filter(Boolean))];
}

async function scopeIdentity_cor(req) {
  const scope = await resolveInformationGuard_cor(req);
  if (scope.legacy || hasCompleteDomain_gnral(scope, 'CORELLIAN')) {
    return { scope, all: true, ids: new Set(), initials: new Set() };
  }
  const profiles = await listVisibleUserProfiles_gnral(db, scope);
  return {
    scope,
    all: false,
    ids: new Set((scope.usuarios_visibles || []).map(Number)),
    initials: new Set(profiles.map(row => String(row.iniciales || '').trim().toUpperCase()).filter(Boolean))
  };
}

async function validateDashboardQueryScope_cor(req) {
  const identity = await scopeIdentity_cor(req);
  if (identity.all) return identity;

  const special = String(req.query?.filtro_especial || req.query?.special || '').trim().toUpperCase();
  if (special === 'AFL' && !identity.ids.has(38)) {
    throw scopeError_cor('El filtro AFL queda fuera de tu Alcance de Información.');
  }

  const requested = supervisorValues_cor(req.query?.supervisores);
  const outside = requested.filter(value => !identity.initials.has(value));
  if (outside.length) {
    throw scopeError_cor(`Uno o más supervisores quedan fuera de tu Alcance de Información: ${outside.join(', ')}.`);
  }
  return identity;
}

async function bootstrap_cor(req, res, next) {
  try {
    const userId = effectiveUserId_cor(req);
    const [result, identity] = await Promise.all([
      service.getBootstrap_cor(userId),
      scopeIdentity_cor(req)
    ]);

    if (!identity.all) {
      result.supervisors = (result.supervisors || []).filter(row =>
        identity.initials.has(String(row.supervisor || '').trim().toUpperCase())
      );
      result.special_filters = (result.special_filters || []).filter(row =>
        String(row.codigo || '').toUpperCase() !== 'AFL' || identity.ids.has(Number(row.usuario_id || 38))
      );
    }

    result.information_scope = {
      source: identity.scope.legacy ? 'LEGACY_FALLBACK' : 'ALCANCE_INFORMACION',
      dominio_completo: identity.all && !identity.scope.legacy,
      usuarios_visibles: identity.all ? null : identity.ids.size
    };
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function summary_cor(req, res, next) {
  try {
    const userId = effectiveUserId_cor(req);
    await validateDashboardQueryScope_cor(req);
    const result = await service.getSummary_cor(userId, req.query || {});
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function report_cor(req, res, next) {
  try {
    await validateDashboardQueryScope_cor(req);
    const result = await service.getReport_cor(req.query || {});
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

async function assertRowInInformationScope_cor(req, idInsFl) {
  const identity = await scopeIdentity_cor(req);
  if (identity.all) return;
  const id = Number(idInsFl);
  const [rows] = await db.query(
    `SELECT id_sup, supervisor_fl
       FROM ins_fl
      WHERE id_ins_fl = ?
        AND activo = 1
      LIMIT 1`,
    [id]
  );
  if (!rows.length) return;
  const row = rows[0];
  const supervisorId = Number(row.id_sup);
  const supervisorInitials = String(row.supervisor_fl || '').trim().toUpperCase();
  if ((Number.isInteger(supervisorId) && identity.ids.has(supervisorId)) ||
      (supervisorInitials && identity.initials.has(supervisorInitials))) return;
  throw scopeError_cor('El equipo queda fuera de tu Alcance de Información.');
}

async function updateCell_cor(req, res, next) {
  try {
    const userId = effectiveUserId_cor(req);
    await assertRowInInformationScope_cor(req, req.params && req.params.id_ins_fl);
    const result = await service.updateQuickEdit_cor(
      req,
      userId,
      req.params && req.params.id_ins_fl,
      req.body || {}
    );
    return res.json({ ok: true, source: 'aiven', ...result });
  } catch (error) {
    return sendKnownError_cor(error, res, next);
  }
}

module.exports = {
  bootstrap_cor,
  summary_cor,
  report_cor,
  updateCell_cor
};
