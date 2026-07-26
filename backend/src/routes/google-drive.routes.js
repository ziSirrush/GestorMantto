'use strict';

const express = require('express');

const googleDriveController = require('../controllers/google-drive.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/about', googleDriveController.about);
router.get('/files', googleDriveController.list);
router.get('/files/:fileId/download', googleDriveController.download);
router.get('/files/:fileId', googleDriveController.detail);

module.exports = router;
