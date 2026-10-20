'use strict';

const { listAuthorizedModules } = require('./offline-pilot.catalog');

const OFFLINE_PILOT_PERMISSION = 'GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const OFFLINE_DATASETS = Object.freeze([
  Object.freeze({
    key: 'operacion-resumen-dia',
    module_code: 'OPERACION_RESUMEN_DEL_DIA',
    label: 'Resumen del Día',
    domain: 'UNITED',
    endpoint: '/api/operacion/resumen-dia/inicial',
    mode: 'READ_ONLY',
    exporter: {
      manifest: '/api/offline/export/resumen-dia/manifest',
      page: '/api/offline/export/resumen-dia/page',
      kinds: ['tickets', 'portafolio'],
      page_limit: 300
    },
    excludes_binary_attachments: true
  }),
  Object.freeze({
    key: 'instalaciones-proyectos',
    module_code: 'INSTALACIONES_PROYECTOS',
    label: 'Instalaciones · Proyectos',
    domain: 'CORELLIAN',
    endpoint: '/api/ins-fl',
    mode: 'READ_ONLY',
    exporter: {
      manifest: '/api/offline/export/instalaciones-proyectos/manifest',
      page: '/api/offline/export/instalaciones-proyectos/page',
      kinds: ['proyectos'],
      page_limit: 300
    },
    excludes_binary_attachments: true
  })
]);

function positiveUserId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildCapabilities(req, authorizedModules = null) {
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

  // null is retained only for existing callers of the historical pilot contract.
  // The externally exposed getCapabilities ALWAYS provides a validated array.
  const modules = Array.isArray(authorizedModules) ? authorizedModules : [];
  const hasScopedCatalog = Array.isArray(authorizedModules);
  const permittedDatasets = OFFLINE_DATASETS.filter(dataset => !hasScopedCatalog || modules.some(module =>
    module.code === dataset.module_code && module.domain === dataset.domain &&
    Array.isArray(module.datasets) && module.datasets.includes(dataset.key)
  ));

  return {
    pilot: true,
    phase: 2, // Contrato historico del piloto anterior (compatibilidad).
    implementation_phase: 5, // Nueva implementacion: Fase 5 de 5.
    catalog_version: 1,
    permission_code: OFFLINE_PILOT_PERMISSION,
    effective_user_id: effectiveUserId,
    viewer_read_only: req?.viewerContext?.active === true,
    operational_data_enabled: permittedDatasets.length > 0,
    datasets: permittedDatasets,
    catalog_modules: modules,
    wifi_confirmation_required: false,
    scheduling: {
      mode: 'AUTO_WHILE_APP_ACTIVE',
      exact_background_execution: false,
      runs_when_app_is_closed: false,
      next_opportunity_fallback: true
    },
    synchronization: {
      enabled: true,
      mode: 'AUTO_WHILE_APP_ACTIVE',
      idempotency: 'MYSQL_USER_INTERACCIONES_LOCK',
      outbox_foundation: true,
      requires_approval_phase: false
    },
    storage_test: {
      indexed_db: true,
      writes_operational_data: false,
      removes_diagnostic_record: true
    }
  };
}

async function getCapabilities(req) {
  // Backend es autoridad. Un permiso general no debe listar datasets ajenos.
  const authorizedModules = await listAuthorizedModules(req);
  return buildCapabilities(req, authorizedModules);
}

module.exports = {
  OFFLINE_PILOT_PERMISSION,
  OFFLINE_DATASETS,
  buildCapabilities,
  getCapabilities
};
