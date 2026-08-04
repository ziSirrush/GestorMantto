const ticketsRepository = require('./tickets.repository');

async function execute(handlerName, req, res) {
  const handler = ticketsRepository.getHandler(handlerName);
  return handler(req, res);
}

module.exports = {
  execute
};
