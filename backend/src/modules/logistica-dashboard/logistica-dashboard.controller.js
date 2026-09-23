'use strict';

// [Aster | 2026-09-23 | ASTER-MG | FASE 1 DASHBOARD LOGISTICA ANALITICA V001]

const service = require('./logistica-dashboard.service');

async function analytics_cor(req, res, next) {
  try {
    const data = await service.analytics_cor();
    return res.json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      data
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = Object.freeze({ analytics_cor });
