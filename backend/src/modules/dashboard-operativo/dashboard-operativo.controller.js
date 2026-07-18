const dashboardOperativoService = require('./dashboard-operativo.service');

async function getPreventivosSupervisor(req, res) {
  try {
    const mes = String(req.query.mes || '').trim();

    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({
        ok: false,
        message: 'El parámetro mes debe usar el formato YYYY-MM.'
      });
    }

    const data = await dashboardOperativoService.getPreventivosSupervisor(mes);

    return res.json({
      ok: true,
      source: 'aiven',
      mes,
      data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando servicios preventivos por supervisor.',
      error: error.message
    });
  }
}

module.exports = {
  getPreventivosSupervisor
};
