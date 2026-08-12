function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function hasProgrammerRole(user) {
  const roles = new Set([user?.rol, ...(user?.roles || [])].filter(Boolean));
  return roles.has('Programador') || roles.has('Programador United') || roles.has('Programador Corellian');
}

function requireProgrammerRole(req, res, next) {
  if (!hasProgrammerRole(req.user)) {
    return res.status(403).json({
      ok: false,
      code: 'SYNC_FORBIDDEN',
      message: 'Solo un perfil de Programador puede ejecutar sincronizaciones.'
    });
  }

  return next();
}

function requireHistoricalSyncEnabled(req, res, next) {
  if (!isEnabled(process.env.CFFAA_HISTORICAL_SYNC_ENABLED)) {
    return res.status(403).json({
      ok: false,
      code: 'CFFAA_HISTORICAL_SYNC_DISABLED',
      message: 'Las sincronizaciones históricas están deshabilitadas. Activa CFFAA_HISTORICAL_SYNC_ENABLED únicamente durante una importación controlada.'
    });
  }

  if (!hasProgrammerRole(req.user)) {
    return res.status(403).json({
      ok: false,
      code: 'CFFAA_HISTORICAL_SYNC_FORBIDDEN',
      message: 'Solo un perfil de Programador puede ejecutar sincronizaciones históricas.'
    });
  }

  return next();
}

function requireAzureDiagnosticsEnabled(req, res, next) {
  const productionBlocked = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
    && !isEnabled(process.env.CFFAA_PRODUCTION_DIAGNOSTICS_OVERRIDE);
  if (productionBlocked || !isEnabled(process.env.AZURE_STORAGE_DIAGNOSTICS_ENABLED)) {
    return res.status(404).json({ ok: false, message: 'Ruta no encontrada.' });
  }

  if (!hasProgrammerRole(req.user)) {
    return res.status(403).json({
      ok: false,
      code: 'CFFAA_AZURE_DIAGNOSTICS_FORBIDDEN',
      message: 'Solo un perfil de Programador puede usar el diagnóstico de Azure Storage.'
    });
  }

  return next();
}

module.exports = {
  requireProgrammerRole,
  requireHistoricalSyncEnabled,
  requireAzureDiagnosticsEnabled
};
