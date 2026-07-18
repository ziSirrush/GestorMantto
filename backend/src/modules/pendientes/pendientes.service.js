const pendientesRepository = require('./pendientes.repository');

async function execute(handlerName, req, res) {
  const handler = pendientesRepository.getHandler(handlerName);
  return handler(req, res);
}

module.exports = {
  execute
};
