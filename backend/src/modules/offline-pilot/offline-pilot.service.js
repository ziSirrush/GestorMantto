'use strict';

const OFFLINE_PILOT_PERMISSION = 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

function positiveUserId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildCapabilities(req) {
  const effectiveUser = req?.contextUser || req?.user || {};
  const effectiveUserId = positiveUserId(
    effectiveUser.id_SB || effectiveUser.id || effectiveUser.user_id
  );

  if (!effectiveUserId) {
    const error = new Error('No fue posible identificar al usuario efectivo.');
    error.status = 401;
    error.code = 'OFFLINE_EFFECTIVE_USER_REQUIRED';
    throw error;
  }

  return {
    pilot: true,
    phase: 1,
    permission_code: OFFLINE_PILOT_PERMISSION,
    effective_user_id: effectiveUserId,
    viewer_read_only: req?.viewerContext?.active === true,
    operational_data_enabled: false,
    wifi_confirmation_required: true,
    scheduling: {
      mode: 'PREFERRED_TIME_BEST_EFFORT',
      exact_background_execution: false,
      runs_when_app_is_closed: false,
      next_opportunity_fallback: true
    },
    storage_test: {
      indexed_db: true,
      writes_operational_data: false,
      removes_diagnostic_record: true
    }
  };
}

module.exports = {
  OFFLINE_PILOT_PERMISSION,
  buildCapabilities
};
