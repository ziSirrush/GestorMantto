'use strict';

// [Aster | 2026-10-12 | ASTER-MG | FASE_1_INSTALACIONES_ADMINISTRACION_TABLA_V001]
// Tabla completa de ins_fl limitada al proyecto, la puerta, el alcance y
// los campos visibles por permiso. Solo lectura; NO acepta actualizaciones.
const db = require('../../config/db');
const visibilityService = require('../ventas/ventas-visibility.service');
const service = require('./instalaciones-administracion.service');
const repository = require('./instalaciones-administracion.repository');
const { ALL_OPERATIONAL_FIELDS_COR, SYSTEM_READONLY_FIELDS_COR } =
  require('./instalaciones-administracion.constants');

const allowedOperational = new Set(ALL_OPERATIONAL_FIELDS_COR);
const allowedSystem = new Set(SYSTEM_READONLY_FIELDS_COR);

function projectTableColumns_cor(contract) {
  const visible = (Array.isArray(contract?.groups) ? contract.groups : [])
    .filter(group => group?.permissions?.can_view === true)
    .flatMap(group => Array.isArray(group.fields) ? group.fields : [])
    .filter(field => allowedOperational.has(field));
  const system = (Array.isArray(contract?.system_readonly_fields)
    ? contract.system_readonly_fields : [])
    .filter(field => allowedSystem.has(field) && field !== 'id_ins_fl');
  return [...new Set(['id_ins_fl', ...visible, ...system])];
}

async function projectEquipmentTable_cor(req, projectKey, query = {}) {
  // Los metodos existentes validan usuario efectivo, permiso, alcance
  // de lectura CORELLIAN y la identidad real del proyecto (P: o R:).
  // Los filtros de Main no se aplican al detalle: muestra TODOS los
  // equipos autorizados de ese proyecto, por paginas.
  const contract = await service.getContract_cor(req);
  const listing = await service.listProjectEquipments_cor(req, projectKey, {
    limit: query.limit,
    offset: query.offset
  });
  const columns = projectTableColumns_cor(contract);
  const ids = (Array.isArray(listing.data) ? listing.data : [])
    .map(row => Number(row?.id_ins_fl))
    .filter(id => Number.isSafeInteger(id) && id > 0);

  const result = {
    data: [],
    columns,
    total: Number(listing.total) || 0,
    limit: Number(listing.limit) || 0,
    offset: Number(listing.offset) || 0
  };
  if (!ids.length) return result;

  // Segundo control fail-closed: volver a aplicar scope y proyecto sobre
  // la consulta de campos completos, no confiar solo en IDs ya leidos.
  const scope = await visibilityService.resolveVisibilityScope(db, req);
  const project = repository.parseProjectKey_cor(projectKey);
  const scoped = repository.scopeClause_cor(scope, 'f');
  const placeholders = ids.map(() => '?').join(', ');
  const select = columns.map(field => `f.\`${field}\``).join(', ');
  const [rows] = await db.query(
    `SELECT ${select}
       FROM ins_fl f
      WHERE f.id_ins_fl IN (${placeholders})
        AND ${project.sql}
        ${scoped.sql}`,
    [...ids, ...project.params, ...scoped.params]
  );
  const matched = new Map((rows || []).map(row => [Number(row.id_ins_fl), row]));
  result.data = ids.map(id => matched.get(id)).filter(Boolean);
  return result;
}

module.exports = { projectTableColumns_cor, projectEquipmentTable_cor };
