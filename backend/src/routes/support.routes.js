const express = require('express');
const router = express.Router();

const supportController = require('../controllers/support.controller');

/* ===========================
   CENTRO DE AYUDA
=========================== */

router.get('/menu', supportController.getMenu);

module.exports = router;