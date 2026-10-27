'use strict';

const service = require('./experimental-ns-equipos-criticos.service');

async function initial(req, res, next) {
  try { return res.json(await service.getInitial(req)); }
  catch (error) { return next(error); }
}
async function detail(req, res, next) {
  try { return res.json(await service.getDetail(req)); }
  catch (error) { return next(error); }
}
module.exports = { initial, detail };
