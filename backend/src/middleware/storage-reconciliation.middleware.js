function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function hasProgrammerRole(user) {
  const roles = new Set([user && user.rol, ...((user && user.roles) || [])].filter(Boolean));
  return roles.has('Programador') || roles.has('Programador United') || roles.has('Programador Corellian');
}

function requireStorageReconciliationEnabled(req, res, next) {
  if (!isEnabled(process.env.CFFAA_STORAGE_RECONCILIATION_ENABLED)) {
    return res.status(404).json({ ok: false, message: 'Ruta no encontrada.' });
  }

  if (!hasProgrammerRole(req.user)) {
    return res.status(403).json({
      ok: false,
      code: 'CFFAA_STORAGE_RECONCILIATION_FORBIDDEN',
      message: 'Solo un perfil de Programador puede ejecutar la conciliación de Storage.'
    });
  }

  return next();
}

module.exports = {
  isEnabled,
  hasProgrammerRole,
  requireStorageReconciliationEnabled
};
