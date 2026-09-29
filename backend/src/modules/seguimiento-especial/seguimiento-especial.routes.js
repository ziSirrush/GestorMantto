'use strict';

const express = require('express');
const controller = require('./seguimiento-especial.controller');
const {
  humanInformationGuard_gnral
} = require('../../middleware/information-access-gnral.middleware');
const {
  requireTicketRecordScope_gnral
} = require('../../services/information-record-scope-gnral.service');

const router = express.Router();

const SEGUIMIENTO_ESPECIAL_ACCESS_PERMISSION =
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const SEGUIMIENTO_ESPECIAL_MANAGE_PERMISSION =
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';

// Fase 1 conserva los codigos de permiso vigentes. No se inventa una facultad
// nueva solo por agregar TICKET como primer consumidor de la capa general.
const seguimientoEspecialReadGuard = humanInformationGuard_gnral({
  permissionCodesAny: [
    SEGUIMIENTO_ESPECIAL_ACCESS_PERMISSION,
    SEGUIMIENTO_ESPECIAL_MANAGE_PERMISSION
  ],
  domain: 'UNITED',
  groupingCode: 'PORTAFOLIO'
});

const seguimientoEspecialManageGuard = humanInformationGuard_gnral({
  permissionCode: SEGUIMIENTO_ESPECIAL_MANAGE_PERMISSION,
  domain: 'UNITED',
  groupingCode: 'PORTAFOLIO'
});

router.get(
  '/seguimiento-especial/tickets',
  ...seguimientoEspecialReadGuard,
  controller.listTickets
);

router.get(
  '/tickets/:ticket/seguimiento-especial',
  ...seguimientoEspecialReadGuard,
  requireTicketRecordScope_gnral,
  controller.getTicket
);

router.put(
  '/tickets/:ticket/seguimiento-especial',
  ...seguimientoEspecialManageGuard,
  requireTicketRecordScope_gnral,
  controller.setTicket
);

module.exports = router;
