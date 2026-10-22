'use strict';

const interactionsService = require('../../services/interactions/interactions.service');

const CLIENT_TYPES = new Set(['NAVEGACION', 'CONSULTAR']);


async function create(req, res) {
  const body = req.body || {};
  const type = String(body.tipo_interaccion || body.tipo || '').trim().toUpperCase();

  if (CLIENT_TYPES.has(type)) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'SOLO_ACCIONES_OPERATIVAS_BACKEND'
    });
  }

  return res.status(400).json({
    ok: false,
    message: 'Las interacciones operativas se registran exclusivamente desde backend después de una acción exitosa.'
  });
}

async function list(req, res) {
  try {
    const user = req.contextUser || req.user || {};
    const rows = await interactionsService.listForUser_gnral(user.id_SB || user.id, {
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.status(200).json({ ok: true, source: 'aiven', data: rows });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.message || 'No fue posible consultar las interacciones.'
    });
  }
}

module.exports = {
  create,
  list
};
