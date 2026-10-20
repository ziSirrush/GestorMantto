'use strict';

// BLT NOW | 2026-10-20 | ALTAS FASE 5 V001
// Cierre de la puerta legacy: los calculados exclusivos de altas humanas
// no se pueden modificar por rutas PATCH V1, individuales ni multiples.
// La lectura comprueba EDITAR, Guard CORELLIAN (en routes) y alcance del registro.
const db = require('../../config/db');
const visibilityService = require('../ventas/ventas-visibility.service');
const repository = require('./instalaciones-administracion.repository');
const service = require('./instalaciones-administracion.service');
const origin = require('./instalaciones-administracion-altas-origin');

const HUMAN_READONLY_COR = Object.freeze([
  'meses_garantia_restantes', 'anio_termino',
  'costo_mensual_mantenimiento_cem',
  // Evitar cambio de PP NS: el origen de auditoria depende de esta identidad.
  'id_proyecto'
]);
const guarded = new Set(HUMAN_READONLY_COR);

function plainCor(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requestedFieldsCor(body) {
  if (!plainCor(body)) return [];
  const collected = new Set();
  if (plainCor(body.changes)) for (const field of Object.keys(body.changes)) collected.add(field);
  if (plainCor(body.groups)) for (const group of Object.values(body.groups)) {
    if (plainCor(group?.changes)) for (const field of Object.keys(group.changes)) collected.add(field);
  }
  return [...collected].filter(field => guarded.has(field));
}
function idsCor(req) {
  const input = req?.params?.id == null ? req?.body?.ids : [req.params.id];
  if (!Array.isArray(input) || !input.length || input.length > 20) return [];
  const ids = input.map(Number);
  return ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length ? ids : [];
}

async function protectHumanFormulasLegacyCor(req, res, next) {
  if (!requestedFieldsCor(req?.body).length) return next();
  const ids = idsCor(req);
  if (!ids.length) return next(); // Servicio oficial devolvera 400 por IDs invalidos.
  try {
    await service.ensureFullEditPermission_cor(req);
    const scope = await visibilityService.resolveVisibilityScope(db, req);
    const scoped = repository.scopeClause_cor(scope, 'f');
    const conditions = [`f.id_ins_fl IN (${ids.map(() => '?').join(',')})`];
    const params = [...ids];
    if (req?.params?.projectKey != null) {
      const project = repository.parseProjectKey_cor(req.params.projectKey);
      conditions.push(`(${project.sql})`);
      params.push(...project.params);
    }
    const [rows] = await db.query(
      `SELECT f.id_ins_fl, f.id_proyecto FROM ins_fl f WHERE ${conditions.join(' AND ')} ${scoped.sql}`,
      [...params, ...scoped.params]
    );
    const human = await origin.humanCreatedIdsCor(db, rows);
    if (human.size) return res.status(409).json({
      ok:false, code:'INSTALACIONES_ADMIN_ALTA_CALCULADO_SOLO_LECTURA',
      message:'Las formulas y el PP NS de equipos creados en Administracion estan protegidos. Requieren conciliacion autorizada.'
    });
    return next(); // Equipo legacy o fuera de alcance: servicio volvera a validar scope.
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({
      ok:false, code:error.code || 'INSTALACIONES_ADMINISTRACION_ERROR',message:error.message
    });
    // Si no se puede verificar la procedencia no se habilita escritura.
    return res.status(503).json({
      ok:false, code:'INSTALACIONES_ADMIN_ALTA_VERIFICACION_NO_DISPONIBLE',
      message:'No fue posible verificar el origen del equipo. Ningun campo fue modificado.'
    });
  }
}
module.exports = Object.freeze({HUMAN_READONLY_COR,requestedFieldsCor,idsCor,protectHumanFormulasLegacyCor});
