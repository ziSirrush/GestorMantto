const logger = require('../shared/logger');

function validateEnvironment() {
  const required = ['JWT_SECRET'];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables obligatorias: ${missing.join(', ')}`);
  }

  if ((process.env.JWT_SECRET || '').length < 16) {
    logger.warn('JWT_SECRET tiene menos de 16 caracteres. No es recomendable para produccion.');
  }
}

module.exports = { validateEnvironment };
