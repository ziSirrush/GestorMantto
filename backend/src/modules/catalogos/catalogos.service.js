const catalogosRepository = require('./catalogos.repository');

function normalizarCodigos(value) {
  return [...new Set(
    String(value || '')
      .split(',')
      .map(item => item.trim().toUpperCase())
      .filter(Boolean)
  )];
}

async function obtenerEstadosVisuales(query = {}) {
  const codigos = normalizarCodigos(query.codigos || query.codigo);
  return catalogosRepository.findEstadosVisuales(codigos);
}

async function obtenerPermisos() {
  return catalogosRepository.findPermisos();
}

async function obtenerRoles() {
  return catalogosRepository.findRoles();
}

async function obtenerZonas() {
  return catalogosRepository.findZonas();
}

async function obtenerUsuarioZop() {
  return catalogosRepository.findUsuarioZop();
}

module.exports = {
  obtenerEstadosVisuales,
  obtenerPermisos,
  obtenerRoles,
  obtenerZonas,
  obtenerUsuarioZop
};
