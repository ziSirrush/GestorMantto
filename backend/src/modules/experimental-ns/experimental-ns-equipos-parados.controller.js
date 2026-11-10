'use strict';
const service = require('./experimental-ns-equipos-parados.service');
async function initial(req, res, next) {
  try { return res.json(await service.initial(req)); }
  catch (error) { return next(error); }
}
module.exports = { initial };