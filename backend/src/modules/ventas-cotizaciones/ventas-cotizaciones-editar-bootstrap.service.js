'use strict';

const cotizacionesService = require('./ventas-cotizaciones.service');
const clientesService = require('../ventas-clientes/ventas-clientes.service');
const contactosService = require('../ventas-clientes-contactos/ventas-clientes-contactos.service');
const catalogoGeneralService = require('../catalogo-general/catalogo-general.service');

async function get(rawId, actionContext) {
  const cotizacionResult = await cotizacionesService.getById(rawId, actionContext);
  const cotizacion = cotizacionResult?.cotizacion || null;
  if (!cotizacion) {
    const error = new Error('La cotización no fue encontrada.');
    error.statusCode = 404;
    throw error;
  }

  const contactosPromise = cotizacion.id_cliente
    ? contactosService.list(cotizacion.id_cliente, actionContext)
    : Promise.resolve({ contactos: [] });

  const [clientesResult, catalogosResult, generalResult, estadosResult, contactosResult] = await Promise.all([
    clientesService.list({
      page: 1,
      page_size: 5000,
      sort_by: 'nombre_empresa',
      sort_direction: 'asc'
    }, actionContext),
    cotizacionesService.getCatalogos(actionContext),
    catalogoGeneralService.list({ area: 'Ventas' }),
    catalogoGeneralService.list({ elemento: 'Estado' }),
    contactosPromise
  ]);

  return {
    ok: true,
    source: 'aiven',
    cotizacion,
    clientes: Array.isArray(clientesResult?.data) ? clientesResult.data : [],
    contactos: Array.isArray(contactosResult?.contactos) ? contactosResult.contactos : [],
    catalogo_general: Array.isArray(generalResult?.articulos) ? generalResult.articulos : [],
    estados: Array.isArray(estadosResult?.articulos) ? estadosResult.articulos : [],
    catalogos: catalogosResult?.catalogos || {},
    visibilidad: catalogosResult?.visibilidad || null
  };
}

module.exports = { get };
