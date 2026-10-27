'use strict';
// BLT NOW | F9A | NetSuite -> Aiven: escritura atomica exclusiva Portafolio experimental.
// Tickets sigue cerrado. Seguridad HMAC obligatoria en TODO el receptor.
const express = require('express');
const { requireIntegrationAuthFor } = require('../../middleware/integration-auth.middleware');
const contract = require('./netsuite-integration.contract');
const { createReceiver } = require('./netsuite-portafolio.receiver');

const router = express.Router();
const receiver = createReceiver();

router.use(requireIntegrationAuthFor('INTEGRATION_NETSUITE_ID', {
  alwaysRequireAuth: true,
  algorithm: 'sha256'
}));

router.get('/estado', (_req,res) => res.json(receiver.status()));

function receive(validate, operation) {
  return (req,res,next) => {
    try {
      validate(req);
      if (!receiver.status().persistenciaHabilitada) {
        return res.status(503).json({
          ok:false,
          code:'NS_DATASET_DESTINATION_PENDING',
          message:'Portafolio NS no habilitado o sin parametros de seguridad.'
        });
      }
    } catch(error) { return next(error); }
    Promise.resolve().then(() => operation(req))
      .then(result => res.json(result))
      .catch(next);
  };
}

// Contrato 1 y rutas existentes: se conservan para el Emisor Universal.
router.post('/lotes',receive(
  req => contract.validateBegin(req.body),
  req => receiver.begin(req.body)
));
router.post('/lotes/:loteId/paginas',receive(
  req => contract.validatePage(req.params.loteId,req.body),
  req => receiver.page(req.params.loteId,req.body)
));
router.post('/lotes/:loteId/finalizar',receive(
  req => contract.validateFinish(req.params.loteId,req.body),
  req => receiver.finish(req.params.loteId,req.body)
));

// Cancelacion autenticada, sin DML: libera solo el staging del lote indicado.
// No altera contratos existentes ni requiere credenciales adicionales.
router.post('/lotes/:loteId/abortar',receive(
  req => contract.validateAbort(req.params.loteId,req.body),
  req => receiver.abort(req.params.loteId,req.body)
));

module.exports = router;
