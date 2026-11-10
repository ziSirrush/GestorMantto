'use strict';

const repository = require('./experimental-ns-equipos-parados.repository');
const scope = require('./experimental-ns.scope');

const REQUIRED_PERMISSION = 'EXPERIMENTAL_NS_EQUIPOS_PARADOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

function getAccess(req) {
  const info = scope.assertScope(req);
  if (info.permission_code !== REQUIRED_PERMISSION) {
    const error = new Error('Se requiere permiso individual de Equipos Parados Experimental NS.');
    error.code = 'EXPERIMENTAL_NS_STOPPED_PERMISSION_REQUIRED';
    error.statusCode = 403;
    throw error;
  }
  return info;
}

async function initial(req) {
  const access = getAccess(req);
  const rows = await repository.listStopped(req);
  return {
    ok: true,
    source: 'experimental-ns',
    modo: 'SOLO_LECTURA',
    tablas: ['ns_tickets_pruebas','ns_portafolio_pruebas'],
    generadoIso: new Date().toISOString(),
    total: rows.length,
    criterios: {
      aplicados: [
        'Equipo no funcionando / fuera de servicio',
        'Caso no cerrado',
        'Equipo activo y proyecto en servicio'
      ],
      no_disponibles: [
        'Origen distinto de trabajo planificado: ns_tickets_pruebas no contiene una columna equivalente confirmada'
      ]
    },
    alcance: {
      llave_maestra: access.llave_maestra === true,
      zona_ids: access.llave_maestra ? null : Array.from(access.zona_ids || []),
      zonas: access.llave_maestra ? null : Array.from(access.zona_codigos || [])
    },
    data: rows
  };
}

module.exports = { REQUIRED_PERMISSION, initial };