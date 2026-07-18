const dashboardOperativoRepository = require('./dashboard-operativo.repository');

function normalizarZona(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, '');
}

async function getPreventivosSupervisor(mes) {
  const [supervisores, servicios] = await Promise.all([
    dashboardOperativoRepository.getSupervisoresActivosPorZona(),
    dashboardOperativoRepository.getPreventivosPorZona(mes)
  ]);

  const porZona = new Map(
    servicios.map((row) => [
      String(row.zona_clave || ''),
      {
        programados: Number(row.programados || 0),
        realizados: Number(row.realizados || 0)
      }
    ])
  );

  const porSupervisor = new Map();

  for (const row of supervisores) {
    const id = Number(row.supervisor_id);

    if (!porSupervisor.has(id)) {
      porSupervisor.set(id, {
        supervisor_id: id,
        supervisor: row.supervisor,
        zonas: [],
        programados: 0,
        realizados: 0
      });
    }

    const item = porSupervisor.get(id);
    const zona = String(row.zona || '').trim();
    const conteo = porZona.get(normalizarZona(zona)) || {
      programados: 0,
      realizados: 0
    };

    item.zonas.push(zona);
    item.programados += conteo.programados;
    item.realizados += conteo.realizados;
  }

  return [...porSupervisor.values()].map((item) => ({
    ...item,
    porcentaje: item.programados
      ? Math.round((item.realizados / item.programados) * 100)
      : 0
  }));
}

module.exports = {
  getPreventivosSupervisor
};
