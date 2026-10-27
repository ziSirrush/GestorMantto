'use strict';

// [Mantto Gestor | 2026-10-16 | INT9-F1 | CATALOGO PERSONAL ROUTES V001]
const express = require('express');
const service = require('./instalaciones-programacion-personal.service');
const asignaciones = require('./instalaciones-programacion-personal.asignaciones.service');
const analitica = require('./instalaciones-programacion-personal.analitica.service');
const ajustadoresSync = require('./instalaciones-programacion-personal.ajustadores-sync.service');
const { humanInformationGuard_gnral } = require('../../middleware/information-access-gnral.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const { hasEffectivePermission } = require('../../services/permissions/effective-permission.service');

const router = express.Router();
const PERMISSION_BASE = 'INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION';
const readGuard = humanInformationGuard_gnral({
  permissionCode: `${PERMISSION_BASE}.VER`,
  domain: 'CORELLIAN',
  groupingCodesAny: ['INSTALACIONES']
});

// Mutar requiere permiso funcional adicional; VER sigue siendo necesario.
function permissionFor(action) {
  return async (req, res, next) => {
    try {
      if (req.viewerContext?.active === true) {
        return res.status(403).json({ok:false,code:'INT9_VISOR_SOLO_LECTURA',message:'El Visor de Usuarios es solo lectura.'});
      }
      const effective = req.contextUser || req.user || {};
      const userId = Number(effective.id_SB || effective.id || 0);
      if (!Number.isSafeInteger(userId) || userId < 1 ||
          !await hasEffectivePermission(userId, `${PERMISSION_BASE}.${action}`)) {
        return res.status(403).json({ok:false,code:'INT9_PERMISO_DENEGADO',message:'No tienes permiso para realizar esta operación.'});
      }
      return next();
    } catch (error) { return next(error); }
  };
}

function reply(action, status = 200) {
  return async (req, res, next) => {
    try {
      const data = await action(req);
      const resolvedStatus = typeof status === 'function' ? status(data) : status;
      return res.status(resolvedStatus).json({ok:true,source:'aiven',data});
    } catch (error) {
      if (error?.statusCode >= 400 && error.statusCode < 600) {
        return res.status(error.statusCode).json({ok:false,code:error.code||'INT9_ERROR',message:error.message});
      }
      if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({ok:false,code:'INT9_SQL_NO_APLICADO',message:'La estructura SQL de Programación de Personal aún no está disponible en Aiven.'});
      }
      return next(error);
    }
  };
}

// /api/instalaciones/programacion/*; mantiene la nomenclatura de INT-9 LAB.
router.get('/programacion/opciones',...readGuard,reply(() => service.opciones()));
router.get('/programacion/personal',...readGuard,reply(req => service.listar(req.query)));
// [Aster | 2026-10-20 | ASTER-MG | INT9 CATALOGO PERSONAL M2M HMAC V001]
// Solo el alta del catalogo admite la integracion ventas-appscript existente.
// La firma se exige siempre, aunque INTEGRATION_AUTH_ENABLED=false.
// El navegador conserva el flujo JWT + Guard CORELLIAN + permiso CREAR.
const requireVentasM2M = requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', {
  alwaysRequireAuth: true,
  algorithm: 'sha256'
});

function isM2MAttempt(req) {
  const headerNames = [
    process.env.INTEGRATION_HEADER_ID || 'X-Integration-Id',
    process.env.INTEGRATION_HEADER_TIMESTAMP || 'X-Integration-Timestamp',
    process.env.INTEGRATION_HEADER_SIGNATURE || 'X-Integration-Signature'
  ];
  // Un solo encabezado M2M (incluso vacio) obliga a validar HMAC:
  // nunca retroceder a JWT ante una firma incompleta o invalida.
  return headerNames.some(name => req.get(name) !== undefined);
}

const crearPersonal = reply(req => service.crear(req), 201);
router.post('/programacion/personal', (req, res, next) => {
  if (!isM2MAttempt(req)) return next('route');
  return requireVentasM2M(req, res, next);
}, crearPersonal);
router.post('/programacion/personal',...readGuard,permissionFor('CREAR'),crearPersonal);
router.put('/programacion/personal/:tipo/:id',...readGuard,permissionFor('EDITAR'),reply(req => service.editar(req)));
router.delete('/programacion/personal/:tipo/:id',...readGuard,permissionFor('DESACTIVAR'),reply(req => service.desactivar(req)));

// [Mantto Gestor | 2026-10-16 | INT9-F2 | CALENDARIO Y ASIGNACIONES]
// La lectura usa el mismo Guard CORELLIAN. Las mutaciones comprueban
// ademas el permiso especifico y el alcance del equipo EN la transaccion.
router.get('/programacion/equipos',...readGuard,reply(req => asignaciones.equipos(req)));
router.get('/programacion/calendario',...readGuard,reply(req => asignaciones.calendario(req)));
router.post('/programacion/asignaciones',...readGuard,permissionFor('CREAR'),
  reply(req => asignaciones.crearAsignaciones(req), data => data.requiere_confirmacion?200:201));
router.put('/programacion/asignaciones/:id',...readGuard,permissionFor('EDITAR'),
  reply(req => asignaciones.editarAsignacion(req)));
router.delete('/programacion/asignaciones/:id',...readGuard,permissionFor('DESACTIVAR'),
  reply(req => asignaciones.eliminarAsignacion(req)));

// [BLT NOW | 2026-10-27 | INT9 AJUSTADORES FASE 1]
// Vista previa solo lectura; no crea asignaciones ni modifica ins_fl.
// Carga diferida para no afectar los flujos existentes ni la integracion M2M.
router.get('/programacion/ajustadores/vinculaciones',...readGuard,
  reply(req => require('./instalaciones-programacion-personal.ajustadores.service').vinculaciones(req)));

// [BLT NOW | 2026-10-27 | INT9 AJUSTADORES FASE 2]
// Escritura explicita protegida por VER + CREAR, puerta CORELLIAN y scope ins_fl.
router.post('/programacion/ajustadores/asignaciones-automaticas',...readGuard,permissionFor('CREAR'),
  reply(req => require('./instalaciones-programacion-personal.ajustadores.service').asignarAutomaticamente(req),
    result => result.creadas?.length ? 201 : 200));

// [Mantto Gestor | 2026-10-16 | INT9-F3 | HISTORIAL Y PROYECCION SOLO LECTURA]
router.get('/programacion/historial',...readGuard,reply(req => analitica.historial(req)));
router.get('/programacion/disponibilidad',...readGuard,reply(req => analitica.disponibilidad(req)));
router.get('/programacion/simulacion',...readGuard,reply(req => analitica.simulacion(req)));


// [BLT NOW | 2026-10-27 | INT9 AJUSTADORES F3]
// Reintento explicito y acotado: necesita permisos de crear y desactivar,
// ademas de la puerta/alcance CORELLIAN. No se ejecuta mediante GET.
router.post('/programacion/ajustadores/reconciliar',...readGuard,
  permissionFor('CREAR'),permissionFor('DESACTIVAR'),
  reply(req => ajustadoresSync.reconciliarManual(req)));

module.exports = router;
