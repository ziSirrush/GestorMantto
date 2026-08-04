const express = require('express');
const router = express.Router();
const devController = require('../controllers/dev.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

router.use(requireAuth, requireRole('Programador'));
router.get('/tables', devController.tables);
router.get('/schema', devController.schema);
router.get('/table/:table/columns', devController.columns);
router.get('/table/:table/count', devController.count);
router.get('/table/:table/rows', devController.rows);

module.exports = router;
