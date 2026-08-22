'use strict';

const ROUTES_COR = Object.freeze({
  aditivas: '/api/cobranza-cor/aditivas',
  adeudos_contractuales: '/api/cobranza-cor/adeudos-contractuales'
});

function pendingSource_cor(kind) {
  const config = kind === 'adeudos_contractuales'
    ? {
        route: ROUTES_COR.adeudos_contractuales,
        label: 'Adeudos contractuales'
      }
    : {
        route: ROUTES_COR.aditivas,
        label: 'Aditivas'
      };

  return {
    available: false,
    supported: false,
    domain: 'CORELLIAN',
    route: config.route,
    source_table: null,
    status: 'PENDING_COBRANZA_COR_TABLES',
    label: config.label,
    message: `La fuente de ${config.label} de Cobranza Corellian aún no está creada. La ruta queda reservada y no consulta tablas de United.`,
    data: []
  };
}

function getAditivas_cor() {
  return pendingSource_cor('aditivas');
}

function getAdeudosContractuales_cor() {
  return pendingSource_cor('adeudos_contractuales');
}

module.exports = {
  ROUTES_COR,
  getAditivas_cor,
  getAdeudosContractuales_cor
};
