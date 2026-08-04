const portafolioRepository = require('./portafolio.repository');

async function execute(handlerName, req, res) {
  const handler = portafolioRepository.getHandler(handlerName);
  return handler(req, res);
}

module.exports = {
  execute
};
