// [Aster | 2026-08-19 | ASTER-MG | FASE 4: Guard General por modulo]
const express = require('express');
const router = express.Router();
const ticketsController = require('./tickets.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const {
  humanInformationGuard_gnral,
  buildInformationAccessGuard_gnral
} = require('../../middleware/information-access-gnral.middleware');
const {
  requireTicketRecordScope_gnral
} = require('../../services/information-record-scope-gnral.service');

const requireTicketsIntegration = requireIntegrationAuthFor('INTEGRATION_TICKETS_ID');
const OPERACION_TICKET_LIST_PERMISSIONS = Object.freeze([
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_TICKETS_TICKETS_DEL_PERIODO.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_TOTAL_DE_TICKETS.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_PEND_VALIDAR.VER',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_VALIDADOS.VER',
  'OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER_TICKETS',
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER_TICKETS'
]);

const PORTAFOLIO_TICKET_LIST_PERMISSIONS = Object.freeze([
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER_TICKETS'
]);

const OPERACION_TICKET_DETAIL_PERMISSIONS = Object.freeze([
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.ABRIR_DETALLE',
  'OPERACION_RESUMEN_DEL_DIA_TICKET_PERIODO_TICKETS_DEL_PERIODO.VER_TICKET',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_TICKETS_TICKETS_DEL_PERIODO.ABRIR_DETALLE',
  'OPERACION_DASHBOARD_CALL_CENTER_TABLA_TICKETS_TICKETS_DEL_PERIODO.VER_TICKET',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_TOTAL_DE_TICKETS.ABRIR_DETALLE',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_PEND_VALIDAR.ABRIR_DETALLE',
  'OPERACION_DASHBOARD_OPERATIVO_KPI_VALIDADOS.ABRIR_DETALLE',
  'OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER_TICKETS',
  'OPERACION_EQUIPOS_CRITICOS_PROYECTOS_CRITICOS_PROYECTOS_CRITICOS.VER_TICKETS'
]);

const PORTAFOLIO_TICKET_DETAIL_PERMISSIONS = Object.freeze([
  'PORTAFOLIO_DASHBOARD_PORTAFOLIO_TABLA_PROYECTOS_PORTAFOLIO_TABLA_PORTAFOLIO.VER_TICKETS'
]);

const ticketListGuard = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingPermissionPairsAny: [
    { groupingCode: 'OPERACION', permissionCodesAny: OPERACION_TICKET_LIST_PERMISSIONS },
    { groupingCode: 'PORTAFOLIO', permissionCodesAny: PORTAFOLIO_TICKET_LIST_PERMISSIONS }
  ]
});

const ticketDetailGuard = humanInformationGuard_gnral({
  domain: 'UNITED',
  groupingPermissionPairsAny: [
    { groupingCode: 'OPERACION', permissionCodesAny: OPERACION_TICKET_DETAIL_PERMISSIONS },
    { groupingCode: 'PORTAFOLIO', permissionCodesAny: PORTAFOLIO_TICKET_DETAIL_PERMISSIONS }
  ]
});

const validateTicketGuard = buildInformationAccessGuard_gnral({
  permissionCode: 'OPERACION_DASHBOARD_OPERATIVO_KPI_PEND_VALIDAR.VALIDAR_VO_BO',
  domain: 'UNITED',
  groupingCodesAny: ['OPERACION']
});

const revertTicketGuard = buildInformationAccessGuard_gnral({
  permissionCode: 'OPERACION_DASHBOARD_OPERATIVO_KPI_VALIDADOS.REVERTIR_VO_BO',
  domain: 'UNITED',
  groupingCodesAny: ['OPERACION']
});

function requireTicketValidationPermission(req, res, next) {
  const targetState = String(req.body?.vobo_estado || 'Pendiente').trim();
  return targetState === 'Pendiente'
    ? revertTicketGuard(req, res, next)
    : validateTicketGuard(req, res, next);
}

router.get('/tickets', ...ticketListGuard, ticketsController.getTickets);
router.get(
  '/tickets/:ticket/interacciones',
  ...ticketDetailGuard,
  requireTicketRecordScope_gnral,
  ticketsController.getTicketInteracciones
);

// El catalogo actual no contiene una accion independiente AGREGAR_COMENTARIO para Tickets.
// Se exige permiso real de lectura/detalle y alcance del registro; no se inventa un codigo.
router.post(
  '/tickets/:ticket/comentarios',
  ...ticketDetailGuard,
  requireTicketRecordScope_gnral,
  ticketsController.createTicketComentario
);

router.post(
  '/tickets/:ticket/validacion',
  requireAuth,
  requireTicketValidationPermission,
  requireTicketRecordScope_gnral,
  ticketsController.saveTicketValidacion
);
router.get(
  '/tickets/:ticket',
  ...ticketDetailGuard,
  requireTicketRecordScope_gnral,
  ticketsController.getTicketDetalle
);
router.post(
  '/tickets/:ticket/vobo',
  requireAuth,
  requireTicketValidationPermission,
  requireTicketRecordScope_gnral,
  ticketsController.saveTicketVobo
);

// M2M permanece separado del Guard humano.
router.post('/tickets/sync', requireTicketsIntegration, ticketsController.syncTickets);
router.post('/tickets/sync-fechas-cdmx', requireTicketsIntegration, ticketsController.syncTicketDatesCdmx);

module.exports = router;
