'use strict';

const repository = require('./experimental-ns-resumen-dia.repository');
const { assertScope } = require('./experimental-ns.scope');
const REQUIRED_PERMISSION = 'EXPERIMENTAL_NS_RESUMEN_DIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

async function getInitialData(req) {
  const access = assertScope(req);
  if (access.permission_code !== REQUIRED_PERMISSION) {
    const error = new Error('Se necesita el permiso individual de Resumen del Dia Experimental NS.');
    error.code = 'EXPERIMENTAL_NS_RESUMEN_PERMISSION_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  const data = await repository.getInitialData(req);
  return {
    ok: true,
    source: 'experimental-ns',
    tablas: ['ns_tickets_pruebas', 'ns_portafolio_pruebas'],
    modo: 'SOLO_LECTURA',
    data: { tickets: data.tickets, portafolio: data.portafolio },
    total: { tickets: data.tickets.length, portafolio: data.portafolio.length },
    truncado: data.truncado,
    limites: data.limites,
    criticidad: 'PENDIENTE_FASE4',
    alcance: {
      zona_ids: access.llave_maestra ? null : [...(access.zona_ids || [])],
      zonas: access.llave_maestra ? null : [...(access.zona_codigos || [])]
    }
  };
}

module.exports = { getInitialData, REQUIRED_PERMISSION };
